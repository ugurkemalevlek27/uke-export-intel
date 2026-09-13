import { getAccount, recordCommunication } from "@/lib/integrations/communications";
import { boundedBody, verifyMetaSignature, communicationEventSchema, type CommunicationEvent } from "@/lib/integrations/communication-contract";
import { db } from "@/db";
import { z } from "zod";

export const runtime = "nodejs";
const envelope = z.object({ object: z.literal("whatsapp_business_account"), entry: z.array(z.object({ changes: z.array(z.object({
  field: z.string(), value: z.object({
    metadata: z.object({ phone_number_id: z.string() }),
    messages: z.array(z.object({ id: z.string(), from: z.string(), timestamp: z.string().regex(/^\d+$/), type: z.string(), text: z.object({ body: z.string() }).optional() })).optional(),
    statuses: z.array(z.object({ id: z.string(), recipient_id: z.string(), timestamp: z.string().regex(/^\d+$/), status: z.enum(["sent", "delivered", "read", "failed"]) })).optional(),
  })
})) })) });

type Context = { params: Promise<{ accountId: string }> };
async function accountFor(context: Context) {
  const id = Number((await context.params).accountId);
  if (!Number.isSafeInteger(id) || id < 1) return undefined;
  const account = await getAccount(id);
  return account?.channel === "whatsapp" ? account : undefined;
}
export async function GET(request: Request, context: Context) {
  const account = await accountFor(context);
  const token = account && process.env[`${account.credential_prefix}_VERIFY_TOKEN`];
  if (!token) return new Response("configuration_required", { status: 503 });
  const params = new URL(request.url).searchParams;
  if (params.get("hub.mode") !== "subscribe" || params.get("hub.verify_token") !== token) return new Response("forbidden", { status: 403 });
  return new Response(params.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
}
export async function POST(request: Request, context: Context) {
  try {
    const account = await accountFor(context);
    if (!account) return Response.json({ error: "not_found" }, { status: 404 });
    const secret = process.env[`${account.credential_prefix}_APP_SECRET`];
    if (!secret) return Response.json({ error: "configuration_required" }, { status: 503 });
    const raw = await boundedBody(request);
    if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256") ?? "", secret)) return Response.json({ error: "invalid_signature" }, { status: 401 });
    let decoded: unknown;
    try { decoded = JSON.parse(raw.toString("utf8")); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
    const parsed = envelope.safeParse(decoded);
    if (!parsed.success) return Response.json({ error: "invalid_event" }, { status: 400 });
    const events: CommunicationEvent[] = [];
    for (const entry of parsed.data.entry) for (const change of entry.changes) {
      if (change.value.metadata.phone_number_id !== account.address) return Response.json({ error: "account_mismatch" }, { status: 403 });
      for (const message of change.value.messages ?? []) events.push(communicationEventSchema.parse({
        direction: "incoming", external_event_id: message.id, provider_message_id: message.id,
        address: message.from, occurred_at: new Date(Number(message.timestamp) * 1000).toISOString(),
        body: message.text?.body ?? `[${message.type}]`,
      }));
      for (const status of change.value.statuses ?? []) events.push(communicationEventSchema.parse({
        direction: "status", external_event_id: `${status.id}:${status.status}:${status.timestamp}`,
        provider_message_id: status.id, address: status.recipient_id, status: status.status,
        occurred_at: new Date(Number(status.timestamp) * 1000).toISOString(),
      }));
    }
    // One provider delivery either commits completely or retries as a whole.
    const result = await db.transaction(async tx => {
      const results = [];
      for (const event of events) results.push(await recordCommunication(tx, account.id, event));
      return results;
    });
    return Response.json({ accepted: result.length });
  } catch (error) {
    const code = error instanceof Error ? error.message : "processing_failed";
    return Response.json({ error: code === "payload_too_large" ? code : "processing_failed" }, { status: code === "payload_too_large" ? 413 : 503 });
  }
}
