import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { boundedBody, normalizeAddress, verifyMetaSignature, nextDeliveryStatus, communicationEventSchema } from "../src/lib/integrations/communication-contract";

test("addresses are validated without allowing header injection", () => {
  assert.equal(normalizeAddress("email", " User@Example.com "), "user@example.com");
  assert.equal(normalizeAddress("whatsapp", "+905551112233"), "905551112233");
  assert.throws(() => normalizeAddress("email", "user@example.com\r\nBcc:x@y.com"));
  assert.throws(() => normalizeAddress("whatsapp", "555"));
});
test("Meta signatures bind exact body bytes", () => {
  const body = Buffer.from('{"text":"merhaba"}');
  const secret = "unit-test-only";
  const signature = `sha256=${createHmac("sha256",secret).update(body).digest("hex")}`;
  assert.ok(verifyMetaSignature(body,signature,secret));
  assert.ok(!verifyMetaSignature(Buffer.concat([body,Buffer.from(" ")]),signature,secret));
  assert.ok(!verifyMetaSignature(body,"sha256=invalid",secret));
});
test("out-of-order delivery does not regress read or delivered", () => {
  assert.equal(nextDeliveryStatus("read","sent"),"read");
  assert.equal(nextDeliveryStatus("delivered","failed"),"delivered");
  assert.equal(nextDeliveryStatus("sent","read"),"read");
});
test("status events require a provider message ID", () => {
  assert.equal(communicationEventSchema.safeParse({ direction:"status",status:"read",address:"905551112233",external_event_id:"e",occurred_at:new Date().toISOString() }).success,false);
});
test("streamed bodies enforce size limit", async () => {
  const request = new Request("http://localhost",{method:"POST",body:"x".repeat(262145)});
  await assert.rejects(boundedBody(request),/payload_too_large/);
});
