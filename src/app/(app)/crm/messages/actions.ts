"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { guardPage } from "@/lib/pageGuard";
import { requireOrganizationId } from "@/lib/tenant";
import { normalizeAddress } from "@/lib/integrations/communication-contract";
import { acceptCommunication, getAccount } from "@/lib/integrations/communications";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function authorize(capability: "editCrm" | "manageUsers") {
  if (!(await guardPage(capability)).allowed) throw new Error("Bu işlem için yetkiniz yok.");
  return requireOrganizationId();
}

export async function createAccount(form: FormData) {
  const org = await authorize("manageUsers");
  const input = z.object({
    project: z.coerce.number().int().positive(), provider: z.enum(["gmail", "smtp_imap", "microsoft_graph", "meta"]),
    address: z.string().min(1).max(320), prefix: z.string().regex(/^[A-Z][A-Z0-9_]{2,80}$/),
    limit: z.coerce.number().int().min(1).max(1000),
  }).parse(Object.fromEntries(["project", "provider", "address", "prefix", "limit"].map(key => [key, form.get(key)])));
  const channel = input.provider === "meta" ? "whatsapp" : "email";
  const address = channel === "email" ? normalizeAddress(channel, input.address) : input.address.trim();
  if (channel === "whatsapp" && !/^\d{5,40}$/.test(address)) throw new Error("Meta Phone Number ID gerekli.");
  await db.transaction(async tx => {
    const project = await tx.execute(sql`SELECT id,client_key FROM projects WHERE id=${input.project} AND organization_id=${org} FOR UPDATE`);
    if (!project.rows[0]) throw new Error("Proje bulunamadı.");
    const clientKey = String(project.rows[0].client_key ?? `project-${input.project}`);
    if (!project.rows[0].client_key) await tx.execute(sql`UPDATE projects SET client_key=${clientKey} WHERE id=${input.project} AND organization_id=${org}`);
    await tx.execute(sql`INSERT INTO communication_accounts(organization_id,project_id,client_id,channel,provider,address,credential_prefix,enabled,hourly_limit) VALUES(${org},${input.project},${clientKey},${channel},${input.provider},${address},${input.prefix},${form.get("enabled") === "on"},${input.limit})`);
  });
  revalidatePath("/crm/messages");
}

export async function toggleAccount(form: FormData) {
  const org = await authorize("manageUsers");
  const id = z.coerce.number().int().positive().parse(form.get("account"));
  await db.execute(sql`UPDATE communication_accounts SET enabled=NOT enabled WHERE id=${id} AND organization_id=${org}`);
  revalidatePath("/crm/messages");
}

export async function setPermission(form: FormData) {
  const org = await authorize("manageUsers");
  const guard = await guardPage("manageUsers");
  if (!guard.allowed) throw new Error("Yetki yok.");
  const rawUser = String(form.get("user") ?? "");
  const userId = rawUser ? z.coerce.number().int().positive().parse(rawUser) : null;
  const id = z.coerce.number().int().positive().parse(form.get("account"));
  await db.transaction(async tx => {
    const result = await tx.execute(sql`SELECT channel FROM communication_accounts WHERE id=${id} AND organization_id=${org} FOR UPDATE`);
    if (!result.rows[0]) throw new Error("Hesap bulunamadı.");
    const address = normalizeAddress(String(result.rows[0].channel), String(form.get("address") ?? ""));
    if (userId) {
      const target = (await tx.execute(sql`SELECT id,role,organization_id FROM users WHERE id=${userId}`)).rows[0];
      if (!target || (target.role === 'super_admin' ? guard.role !== 'super_admin' || guard.session.userId !== userId : Number(target.organization_id) !== org)) throw new Error("Kullanıcı bu hesaba bağlanamaz.");
    }
    await tx.execute(sql`INSERT INTO communication_permissions(account_id,address,allowed,ai_allowed,user_id) VALUES(${id},${address},${form.get("allowed") === "on"},${form.get("ai_allowed") === "on"},${userId}) ON CONFLICT(account_id,address) DO UPDATE SET allowed=EXCLUDED.allowed,ai_allowed=EXCLUDED.ai_allowed,user_id=EXCLUDED.user_id`);
  });
  revalidatePath("/crm/messages");
}

export async function suppressContact(form: FormData) {
  const org = await authorize("editCrm");
  const id = z.coerce.number().int().positive().parse(form.get("account"));
  await db.transaction(async tx => {
    const result = await tx.execute(sql`SELECT channel,client_id FROM communication_accounts WHERE id=${id} AND organization_id=${org} FOR UPDATE`);
    if (!result.rows[0]) throw new Error("Hesap bulunamadı.");
    const a = result.rows[0];
    const address = normalizeAddress(String(a.channel), String(form.get("address") ?? ""));
    await tx.execute(sql`INSERT INTO communication_suppressions(organization_id,client_id,channel,address,reason) VALUES(${org},${a.client_id},${a.channel},${address},'do_not_contact') ON CONFLICT DO NOTHING`);
  });
  revalidatePath("/crm/messages");
}

export async function resolveCommunicationReview(form: FormData) {
  const org = await authorize("editCrm");
  const id = z.coerce.number().int().positive().parse(form.get("message"));
  await db.execute(sql`UPDATE communication_messages SET status='resolved' WHERE id=${id} AND organization_id=${org} AND status='review'`);
  revalidatePath("/crm/messages");
  revalidatePath("/crm/review");
}

export async function prepareMessage(form: FormData) {
  const org = await authorize("editCrm");
  const account = z.coerce.number().int().positive().parse(form.get("account"));
  const a = await getAccount(account);
  if (!a || a.organization_id !== org) throw new Error("Hesap bulunamadı.");
  await acceptCommunication(account, {
    external_event_id: z.string().uuid().parse(form.get("request_id")),
    occurred_at: z.iso.datetime().parse(form.get("occurred_at")), direction: "outgoing",
    address: String(form.get("address") ?? ""), body: String(form.get("body") ?? ""),
    subject: String(form.get("subject") ?? ""),
    lead_id: z.coerce.number().int().positive().parse(form.get("lead")),
    contact_id: z.coerce.number().int().positive().parse(form.get("contact")),
  }, org);
  revalidatePath("/crm/messages");
  revalidatePath("/crm/activities");
}
