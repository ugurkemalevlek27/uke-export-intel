import { Pool } from "pg";
import { createHash } from "node:crypto";
import { deliveryBlock } from "../src/lib/integrations/whatsapp-delivery-policy";

const pool = new Pool({connectionString:process.env.DATABASE_URL});
async function runOnce() {
  await pool.query("UPDATE whatsapp_assistant_results SET delivery_status='review',delivery_error='worker_interrupted_outcome_unknown' WHERE delivery_status='sending' AND delivery_attempted_at<now()-interval '5 minutes'");
  const client = await pool.connect();
  let row;
  try {
    await client.query("BEGIN");
    // Account lock also serializes the hourly cap with other UKE outgoing messages.
    const accounts = await client.query("SELECT * FROM communication_accounts WHERE credential_prefix='ACC_WA' AND channel='whatsapp' AND provider='meta' FOR UPDATE SKIP LOCKED");
    const account = accounts.rows[0];
    if (!account) {await client.query("COMMIT"); return;}
    const pending = await client.query(`SELECT r.*,m.address,m.occurred_at,m.lead_id,m.contact_id,
      p.allowed,p.ai_allowed,p.user_id AS linked_user,u.role,u.organization_id AS user_org
      FROM whatsapp_assistant_results r JOIN communication_messages m ON m.id=r.message_id
      LEFT JOIN communication_permissions p ON p.account_id=m.account_id AND p.address=m.address
      LEFT JOIN users u ON u.id=p.user_id
      WHERE m.account_id=$1 AND m.direction='incoming'
      AND r.delivery_status IN ('configuration_required','retry')
      AND (r.delivery_retry_at IS NULL OR r.delivery_retry_at<=now())
      ORDER BY r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`,[account.id]);
    row = pending.rows[0];
    if (!row) {await client.query("COMMIT"); return;}
    const suppressed = await client.query("SELECT 1 FROM communication_suppressions WHERE organization_id=$1 AND client_id=$2 AND channel='whatsapp' AND address=$3",[account.organization_id,account.client_id,row.address]);
    const block = deliveryBlock({enabled:account.enabled,allowed:row.allowed===true,aiAllowed:row.ai_allowed===true,
      linkedUser:row.linked_user===row.user_id,role:row.role,sameOrganization:row.user_org===account.organization_id,
      suppressed:!!suppressed.rowCount,occurredAt:new Date(row.occurred_at),now:new Date(),
      live:process.env.ACC_WA_LIVE_SEND==='true',token:!!process.env.ACC_WA_ACCESS_TOKEN,
      recipient:row.address,testRecipient:process.env.ACC_WA_TEST_RECIPIENT??''});
    if (block) {
      await client.query("UPDATE whatsapp_assistant_results SET delivery_status=$2,delivery_error=$3,delivery_retry_at=now()+interval '1 minute' WHERE id=$1",[row.id,block==='configuration_required'?block:'review',block]);
      await client.query("COMMIT"); return;
    }
    const count = await client.query("SELECT count(*)::int AS n FROM whatsapp_assistant_results r JOIN communication_messages m ON m.id=r.message_id WHERE m.account_id=$1 AND r.delivery_attempted_at>now()-interval '1 hour'",[account.id]);
    if (count.rows[0].n>=account.hourly_limit) {await client.query("COMMIT"); return;}
    if (!/^\d+$/.test(account.address)) throw new Error("invalid_phone_id");
    row.account = account;
    await client.query("UPDATE whatsapp_assistant_results SET delivery_status='sending',delivery_attempts=delivery_attempts+1,delivery_attempted_at=now(),delivery_error=NULL WHERE id=$1",[row.id]);
    await client.query("COMMIT");
  } catch {await client.query("ROLLBACK"); throw new Error("claim_failed");}
  finally {client.release();}
  if (!row?.account) return;
  // Claim was committed before HTTP. A crash or timeout is not blindly retried.
  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${row.account.address}/messages`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${process.env.ACC_WA_ACCESS_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:row.address,type:'text',text:{preview_url:false,body:row.reply.slice(0,4000)}})
    });
    if (response.status===429) {
      await pool.query("UPDATE whatsapp_assistant_results SET delivery_status=$2,delivery_retry_at=now()+interval '5 minutes',delivery_error='http_429' WHERE id=$1",[row.id,Number(row.delivery_attempts)<4?'retry':'review']); return;
    }
    if (!response.ok) {
      await pool.query("UPDATE whatsapp_assistant_results SET delivery_status='review',delivery_error=$2 WHERE id=$1",[row.id,`http_${response.status}`]); return;
    }
    const data = await response.json() as {messages?:{id?:string}[]};
    const id = data.messages?.[0]?.id;
    if (!id) throw new Error('missing_message_id');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("UPDATE whatsapp_assistant_results SET delivery_status='sent',provider_message_id=$2 WHERE id=$1",[row.id,id]);
      await c.query(`INSERT INTO communication_messages(account_id,organization_id,client_id,project_id,lead_id,contact_id,
        external_event_id,payload_hash,provider_message_id,direction,address,body,status,occurred_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'outgoing',$10,$11,'sent',now()) ON CONFLICT DO NOTHING`,
      [row.account.id,row.account.organization_id,row.account.client_id,row.account.project_id,row.lead_id,row.contact_id,
        `assistant-reply:${row.id}`,createHash('sha256').update(row.reply).digest('hex'),id,row.address,row.reply]);
      await c.query('COMMIT');
    } catch {await c.query('ROLLBACK'); throw new Error('receipt_failed');}
    finally {c.release();}
  } catch {
    await pool.query("UPDATE whatsapp_assistant_results SET delivery_status='review',delivery_error='delivery_outcome_unknown_do_not_resend' WHERE id=$1 AND delivery_status='sending'",[row.id]);
  }
}
async function main() {
  do {await runOnce(); if(process.argv.includes('--watch')) await new Promise(r=>setTimeout(r,3000));}
  while(process.argv.includes('--watch'));
}
main().catch(()=>{console.error('WhatsApp worker failed; check database availability.');process.exitCode=1;}).finally(()=>pool.end());
