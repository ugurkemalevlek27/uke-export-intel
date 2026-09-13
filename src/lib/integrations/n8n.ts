import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const N8N_SIGNATURE_HEADER = "x-uke-signature";
export const N8N_TIMESTAMP_HEADER = "x-uke-timestamp";
export const N8N_NONCE_HEADER = "x-uke-nonce";
export const MAX_WEBHOOK_AGE_SECONDS = 300;

export const n8nEventSchema = z.object({
  organization_id: z.number().int().positive(),
  client_id: z.string().trim().min(1).max(100),
  project_id: z.number().int().positive(),
  lead_id: z.number().int().positive(),
  contact_id: z.number().int().positive(),
  external_event_id: z.string().trim().min(1).max(255),
  occurred_at: z.iso.datetime({ offset: true }),
  event_type: z.string().trim().min(1).max(100),
  result: z.string().max(10_000).optional(),
  notes: z.string().max(50_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export function signaturePayload(timestamp: string, nonce: string, rawBody: string) {
  return `${timestamp}.${nonce}.${rawBody}`;
}

export function signN8nPayload(secret: string, timestamp: string, nonce: string, rawBody: string) {
  return `sha256=${createHmac("sha256", secret).update(signaturePayload(timestamp, nonce, rawBody)).digest("hex")}`;
}

export function verifyN8nSignature(input: { secret: string; timestamp: string; nonce: string; rawBody: string; signature: string; nowMs?: number }) {
  if (!/^\d{10}$/.test(input.timestamp) || !/^[A-Za-z0-9_-]{16,255}$/.test(input.nonce)) return false;
  if (!/^sha256=[a-f0-9]{64}$/.test(input.signature)) return false;
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isInteger(timestampSeconds)) return false;
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_WEBHOOK_AGE_SECONDS) return false;
  const expected = signN8nPayload(input.secret, input.timestamp, input.nonce, input.rawBody);
  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export const EVENT_ACTIVITY_TYPES: Record<string, string> = {
  "email.sent": "email", "email.received": "email", "email.bounced": "email",
  "whatsapp.sent": "whatsapp", "whatsapp.received": "whatsapp",
  "whatsapp.delivered": "whatsapp", "whatsapp.read": "whatsapp",
  "phone.completed": "phone", "linkedin.activity": "linkedin",
  "catalog.sent": "catalog", "quote.sent": "quote", "sample.sent": "sample",
  "enrichment.completed": "enrichment", "report.generated": "report",
};

export function eventActivityType(type: string): string | undefined {
  return Object.hasOwn(EVENT_ACTIVITY_TYPES, type) ? EVENT_ACTIVITY_TYPES[type] : undefined;
}
