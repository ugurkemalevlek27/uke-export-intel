import { db } from "@/db";
import { sql } from "drizzle-orm";
import { answerWhatsApp } from "./whatsapp-assistant";
import { communicationEventSchema, type CommunicationEvent, normalizeAddress, payloadHash, nextDeliveryStatus } from "./communication-contract";

export type CommunicationTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Account = {
  id: number; organization_id: number; project_id: number; client_id: string;
  channel: "email" | "whatsapp"; provider: string; address: string;
  credential_prefix: string; enabled: boolean; hourly_limit: number;
};

export async function getAccount(id: number) {
  const result = await db.execute(sql`SELECT * FROM communication_accounts WHERE id=${id}`);
  return result.rows[0] as Account | undefined;
}

/** The account lock serializes rate checks and receipt creation across workers. */
export async function recordCommunication(tx: CommunicationTx, accountId: number, input: CommunicationEvent, organizationId?: number, nonce?: string) {
  const event = communicationEventSchema.parse(input);
  const accountResult = await tx.execute(sql`
    SELECT a.* FROM communication_accounts a JOIN projects p ON p.id=a.project_id
    WHERE a.id=${accountId} AND p.organization_id=a.organization_id AND p.client_key=a.client_id
      AND (${organizationId === undefined} OR a.organization_id=${organizationId ?? null})
    FOR UPDATE OF a
  `);
  const account = accountResult.rows[0] as Account | undefined;
  if (!account) throw new Error("account_not_found");
  const address = normalizeAddress(account.channel, event.address);
  const hash = payloadHash(event);
  if (nonce) {
    const used = await tx.execute(sql`SELECT external_event_id,payload_hash FROM communication_nonces WHERE account_id=${accountId} AND nonce=${nonce}`);
    if (used.rows[0] && (used.rows[0].external_event_id !== event.external_event_id || used.rows[0].payload_hash !== hash)) throw new Error("event_conflict");
  }
  const existing = await tx.execute(sql`SELECT id,status,payload_hash FROM communication_messages WHERE account_id=${accountId} AND external_event_id=${event.external_event_id}`);
  if (existing.rows[0]) {
    if (existing.rows[0].payload_hash !== hash) throw new Error("event_conflict");
    return { id: String(existing.rows[0].id), status: String(existing.rows[0].status), duplicate: true };
  }
  if (nonce) await tx.execute(sql`INSERT INTO communication_nonces(account_id,nonce,external_event_id,payload_hash) VALUES(${accountId},${nonce},${event.external_event_id},${hash})`);

  let leadId: number | null = null;
  let contactId: number | null = null;
  let reason: string | null = null;
  let status = event.direction === "outgoing" ? "dry_run" : "received";
  const permitted = await tx.execute(sql`SELECT allowed,ai_allowed FROM communication_permissions WHERE account_id=${accountId} AND address=${address}`);
  const authorizedNumber = account.channel !== "whatsapp" || permitted.rows[0]?.allowed === true;
  if (!account.enabled) reason = "account_disabled";
  if (!authorizedNumber) reason = "unauthorized_number";

  const candidates = await tx.execute(sql`
    SELECT cp.id AS lead_id,ct.id AS contact_id FROM contacts ct
    JOIN companies c ON c.id=ct.company_id JOIN company_projects cp ON cp.company_id=c.id
    WHERE c.organization_id=${account.organization_id} AND c.merged_into_id IS NULL
      AND (ct.organization_id IS NULL OR ct.organization_id=${account.organization_id})
      AND cp.project_id=${account.project_id}
      AND (${event.lead_id === undefined} OR cp.id=${event.lead_id ?? null})
      AND (${event.contact_id === undefined} OR ct.id=${event.contact_id ?? null})
      AND CASE WHEN ${account.channel}='email' THEN lower(trim(ct.email))=${address}
        ELSE regexp_replace(ct.whatsapp, '[^0-9]', '', 'g')=${address} END
    LIMIT 2
  `);
  if (candidates.rows.length === 1) {
    leadId = Number(candidates.rows[0].lead_id); contactId = Number(candidates.rows[0].contact_id);
  }
  // A provider thread is scoped to the account, never globally matched by subject.
  if (event.thread_id && event.direction === "incoming") {
    const matches = await tx.execute(sql`SELECT DISTINCT lead_id,contact_id FROM communication_messages WHERE account_id=${accountId} AND thread_id=${event.thread_id} AND address=${address} AND lead_id IS NOT NULL AND status<>'review' LIMIT 2`);
    if (matches.rows.length > 1 || matches.rows.length === 1 && (Number(matches.rows[0].lead_id) !== leadId || Number(matches.rows[0].contact_id) !== contactId)) reason = "ambiguous_thread";
  }
  if (!leadId || !contactId) reason ??= "ambiguous_contact_or_lead";

  if (event.direction === "outgoing" && event.status === "sent") {
    if (!event.provider_message_id) throw new Error("provider_message_id_required");
    status = "sent";
  } else if (event.direction === "outgoing") {
    const suppression = await tx.execute(sql`SELECT reason FROM communication_suppressions WHERE organization_id=${account.organization_id} AND client_id=${account.client_id} AND channel=${account.channel} AND address=${address}`);
    if (suppression.rows.length) reason = `suppressed:${String(suppression.rows[0].reason)}`;
    const count = await tx.execute(sql`SELECT count(*)::int AS n FROM communication_messages WHERE account_id=${accountId} AND direction='outgoing' AND status IN ('dry_run','configuration_required','sent','delivered','read') AND created_at>now()-interval '1 hour'`);
    if (Number(count.rows[0].n) >= account.hourly_limit) reason = "rate_limit";
    // Real delivery is deliberately not enabled merely by a credential being present.
    if (!process.env[`${account.credential_prefix}_ACCESS_TOKEN`] && !process.env[`${account.credential_prefix}_PASSWORD`]) status = "configuration_required";
  }

  let target: Record<string, unknown> | undefined;
  if (event.direction === "status") {
    const targets = await tx.execute(sql`SELECT * FROM communication_messages WHERE account_id=${accountId} AND provider_message_id=${event.provider_message_id!} AND direction='outgoing' AND address=${address} LIMIT 2`);
    if (targets.rows.length !== 1) reason = "unmatched_delivery_status";
    else {
      target = targets.rows[0];
      if ((target.lead_id == null ? null : Number(target.lead_id)) !== leadId || (target.contact_id == null ? null : Number(target.contact_id)) !== contactId) reason = "status_scope_mismatch";
      else if (reason === "ambiguous_contact_or_lead" && String(target.external_event_id).startsWith("assistant-reply:")) reason = null;
      status = event.status!;
    }
  }
  const assistantReply = event.direction === "incoming" && account.channel === "whatsapp" && event.body && authorizedNumber && account.enabled
    ? await answerWhatsApp(tx, account, address, event.body) : null;
  if (assistantReply) { reason = null; status = "assistant_answered"; }
  else if (event.direction === "incoming" && account.channel === "whatsapp" && event.body?.trim().startsWith("/ai")) reason = "ai_not_authorized_or_user_unlinked";
  if (reason) status = "review";
  const inserted = await tx.execute(sql`
    INSERT INTO communication_messages(account_id,organization_id,client_id,project_id,lead_id,contact_id,external_event_id,payload_hash,provider_message_id,thread_id,direction,address,subject,body,status,review_reason,occurred_at)
    VALUES(${accountId},${account.organization_id},${account.client_id},${account.project_id},${leadId},${contactId},${event.external_event_id},${hash},${event.provider_message_id ?? null},${event.thread_id ?? null},${event.direction},${address},${event.subject ?? null},${event.body ?? null},${status},${reason},${event.occurred_at}::timestamptz) RETURNING id
  `);
  const id = Number(inserted.rows[0].id);
  if (assistantReply) await tx.execute(sql`INSERT INTO whatsapp_assistant_results(message_id,user_id,organization_id,project_id,action,reply) VALUES(${id},${assistantReply.userId},${account.organization_id},${account.project_id},${assistantReply.action},${assistantReply.reply})`);
  if (!reason && target && event.status) {
    await tx.execute(sql`UPDATE communication_messages SET status=${nextDeliveryStatus(String(target.status), event.status)} WHERE id=${target.id} AND account_id=${accountId}`);
    await tx.execute(sql`UPDATE whatsapp_assistant_results r SET delivery_status=${nextDeliveryStatus(String(target.status), event.status)}
      FROM communication_messages m WHERE m.id=r.message_id AND m.account_id=${accountId} AND r.provider_message_id=${event.provider_message_id!}`);
  }
  // Suppression is scoped to the verified account/client, even if lead matching needs review.
  if (event.direction === "status" && target && (event.status === "bounce" || event.status === "unsubscribe")) {
    await tx.execute(sql`INSERT INTO communication_suppressions(organization_id,client_id,channel,address,reason) VALUES(${account.organization_id},${account.client_id},${account.channel},${address},${event.status}) ON CONFLICT DO NOTHING`);
  }
  if (!reason && leadId && contactId) {
    const activity = await tx.execute(sql`INSERT INTO activities(company_project_id,contact_id,activity_type,activity_date,result,notes,external_event_id) VALUES(${leadId},${contactId},${account.channel},${event.occurred_at}::timestamptz,${`${event.direction}:${status}`},${event.subject ?? event.body ?? null},${`communication:${id}`}) RETURNING id`);
    await tx.execute(sql`UPDATE communication_messages SET activity_id=${activity.rows[0].id} WHERE id=${id}`);
  }
  return { id: String(id), status, duplicate: false };
}

export async function acceptCommunication(accountId: number, event: CommunicationEvent, organizationId?: number, nonce?: string) {
  return db.transaction(tx => recordCommunication(tx, accountId, event, organizationId, nonce));
}
