import { z } from "zod";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const communicationEventSchema = z.object({
  external_event_id: z.string().min(1).max(200),
  occurred_at: z.iso.datetime({ offset: true }),
  direction: z.enum(["incoming", "outgoing", "status"]),
  address: z.string().min(1).max(320),
  subject: z.string().max(998).optional(),
  body: z.string().max(50000).optional(),
  provider_message_id: z.string().min(1).max(255).optional(),
  thread_id: z.string().min(1).max(255).optional(),
  lead_id: z.number().int().positive().optional(),
  contact_id: z.number().int().positive().optional(),
  status: z.enum(["sent", "delivered", "read", "failed", "bounce", "unsubscribe"]).optional(),
}).strict().superRefine((e, ctx) => {
  if (e.direction === "status" && (!e.status || !e.provider_message_id)) ctx.addIssue({ code: "custom", message: "Status events require status and provider_message_id" });
  if (e.direction === "outgoing" && (!e.lead_id || !e.contact_id)) ctx.addIssue({ code: "custom", message: "Outgoing messages require lead_id and contact_id" });
});
export type CommunicationEvent = z.infer<typeof communicationEventSchema>;

export function normalizeAddress(channel: string, address: string) {
  if (channel === "email") {
    const value = address.trim().toLowerCase();
    if (!z.email().safeParse(value).success || /[\r\n]/.test(value)) throw new Error("invalid_address");
    return value;
  }
  const value = address.trim().replace(/^\+/, "");
  if (!/^[1-9][0-9]{7,14}$/.test(value)) throw new Error("invalid_address");
  return value;
}

export function payloadHash(event: CommunicationEvent) {
  // Fixed field order, independent of caller JSON property order.
  return createHash("sha256").update(JSON.stringify(communicationEventSchema.parse(event))).digest("hex");
}

export function verifyMetaSignature(body: Buffer, signature: string, secret: string) {
  if (!secret || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return timingSafeEqual(Buffer.from(signature.slice(7), "hex"), Buffer.from(expected, "hex"));
}

export async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 262144) { await reader.cancel(); throw new Error("payload_too_large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function nextDeliveryStatus(current: string, incoming: string) {
  const ranks: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
  if (current === "read" || current === "delivered" && incoming === "failed") return current;
  if (Object.hasOwn(ranks, current) && Object.hasOwn(ranks, incoming)) return ranks[incoming] > ranks[current] ? incoming : current;
  return incoming;
}
