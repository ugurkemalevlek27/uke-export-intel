import { getAccount, acceptCommunication } from "@/lib/integrations/communications";
import { boundedBody, communicationEventSchema } from "@/lib/integrations/communication-contract";
import { verifyN8nSignature } from "@/lib/integrations/n8n";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const id = Number((await context.params).accountId);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "invalid_account" }, { status: 400 });
  try {
    const account = await getAccount(id);
    if (!account || account.channel !== "email") return Response.json({ error: "not_found" }, { status: 404 });
    const secret = process.env[`${account.credential_prefix}_WEBHOOK_SECRET`];
    if (!secret) return Response.json({ error: "configuration_required" }, { status: 503 });
    const raw = await boundedBody(request);
    const nonce = request.headers.get("x-uke-nonce") ?? "";
    if (!verifyN8nSignature({ secret, nonce, timestamp: request.headers.get("x-uke-timestamp") ?? "", signature: request.headers.get("x-uke-signature") ?? "", rawBody: raw.toString("utf8") })) return Response.json({ error: "invalid_signature" }, { status: 401 });
    let decoded: unknown;
    try { decoded = JSON.parse(raw.toString("utf8")); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
    const event = communicationEventSchema.safeParse(decoded);
    if (!event.success) return Response.json({ error: "invalid_event" }, { status: 400 });
    const result = await acceptCommunication(id, event.data, undefined, nonce);
    return Response.json(result, { status: result.status === "review" ? 202 : 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "processing_failed";
    if (["invalid_address", "payload_too_large", "event_conflict"].includes(code)) return Response.json({ error: code }, { status: code === "payload_too_large" ? 413 : code === "event_conflict" ? 409 : 400 });
    return Response.json({ error: "processing_failed" }, { status: 503, headers: { "Retry-After": "30" } });
  }
}
