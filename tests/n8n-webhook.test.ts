import assert from "node:assert/strict";
import test from "node:test";
import { MAX_WEBHOOK_AGE_SECONDS, eventActivityType, n8nEventSchema, signN8nPayload, verifyN8nSignature } from "../src/lib/integrations/n8n";

const secret = "test-only-secret";
const rawBody = JSON.stringify({ hello: "world" });
const nowMs = Date.UTC(2026, 8, 13, 12, 0, 0);
const timestamp = String(Math.floor(nowMs / 1000));
const nonce = "unique-nonce-123456789";

test("prototype property names cannot become activity types", () => {
  for (const key of ["constructor", "toString", "__proto__"]) assert.equal(eventActivityType(key), undefined);
  assert.equal(eventActivityType("email.sent"), "email");
});

test("malformed authentication headers and changed nonce are rejected", () => {
  const signature = signN8nPayload(secret, timestamp, nonce, rawBody);
  for (const changed of [{ nonce: "short" }, { nonce: "other-nonce-123456789" }, { timestamp: "1e9" }, { signature: "sha256=zz" }]) {
    assert.equal(verifyN8nSignature({ secret, timestamp, nonce, rawBody, signature, nowMs, ...changed }), false);
  }
});

test("valid HMAC signature is accepted", () => {
  const signature = signN8nPayload(secret, timestamp, nonce, rawBody);
  assert.equal(verifyN8nSignature({ secret, timestamp, nonce, rawBody, signature, nowMs }), true);
});

test("tampered body and stale timestamp are rejected", () => {
  const signature = signN8nPayload(secret, timestamp, nonce, rawBody);
  assert.equal(verifyN8nSignature({ secret, timestamp, nonce, rawBody: `${rawBody}x`, signature, nowMs }), false);
  assert.equal(verifyN8nSignature({ secret, timestamp, nonce, rawBody, signature, nowMs: nowMs + (MAX_WEBHOOK_AGE_SECONDS + 1) * 1000 }), false);
});

test("event contract requires every scope and identity field", () => {
  const valid = { organization_id: 1, client_id: "project-2", project_id: 2, lead_id: 3, contact_id: 4, external_event_id: "evt-5", occurred_at: "2026-09-13T12:00:00+03:00", event_type: "email.sent" };
  assert.equal(n8nEventSchema.safeParse(valid).success, true);
  for (const key of ["organization_id", "client_id", "project_id", "lead_id", "contact_id", "external_event_id", "occurred_at"]) {
    const invalid = { ...valid } as Record<string, unknown>;
    delete invalid[key];
    assert.equal(n8nEventSchema.safeParse(invalid).success, false, key);
  }
});
