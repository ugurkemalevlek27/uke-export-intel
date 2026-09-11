// GIRIS SINIRLAMA TESTI (Phase 5)
//
// Gercek veritabanina karsi calisir; yalnizca test'e ozel bir e-posta kullanir,
// sonunda kendi kayitlarini temizler.
//
// Calistirma: npx tsx --env-file=.env --test tests/rate-limit.test.ts

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db";
import { loginAttempts } from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  checkRateLimit,
  recordAttempt,
  MAX_FAILED_ATTEMPTS,
  WINDOW_MINUTES,
} from "../src/lib/rateLimit";

const EMAIL = "__ratelimit_test__@example.invalid";

async function clear() {
  await db.delete(loginAttempts).where(eq(loginAttempts.identifier, EMAIL));
}

beforeEach(clear);
after(clear);

test("temiz baslangicta kilit yok", async () => {
  const s = await checkRateLimit(EMAIL);
  assert.equal(s.blocked, false);
  assert.equal(s.failedCount, 0);
});

test(`${MAX_FAILED_ATTEMPTS} basarisiz denemeden sonra kilitlenir`, async () => {
  for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
    await recordAttempt(EMAIL, false);
  }
  const before = await checkRateLimit(EMAIL);
  assert.equal(before.blocked, false, `${MAX_FAILED_ATTEMPTS - 1}. denemede hala acik olmali`);
  assert.equal(before.failedCount, MAX_FAILED_ATTEMPTS - 1);

  await recordAttempt(EMAIL, false);
  const after = await checkRateLimit(EMAIL);
  assert.equal(after.blocked, true);
  assert.ok(after.retryAfterMinutes >= 1 && after.retryAfterMinutes <= WINDOW_MINUTES);
});

test("basarili giris sayaci sifirlar", async () => {
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await recordAttempt(EMAIL, false);
  assert.equal((await checkRateLimit(EMAIL)).blocked, true);

  await recordAttempt(EMAIL, true);
  const s = await checkRateLimit(EMAIL);
  assert.equal(s.blocked, false, "dogru sifreyi giren kullanici kilitli kalmamali");
  assert.equal(s.failedCount, 0);
});

test("pencere disindaki eski denemeler sayilmaz", async () => {
  const old = new Date(Date.now() - (WINDOW_MINUTES + 5) * 60_000);
  await db.insert(loginAttempts).values(
    Array.from({ length: MAX_FAILED_ATTEMPTS + 3 }, () => ({
      identifier: EMAIL,
      success: false,
      attemptedAt: old,
    }))
  );
  const s = await checkRateLimit(EMAIL);
  assert.equal(s.blocked, false, "15 dakikadan eski denemeler kilit uretmemeli");
  assert.equal(s.failedCount, 0);
});

test("kilit e-posta bazli: baska hesap etkilenmez", async () => {
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await recordAttempt(EMAIL, false);
  assert.equal((await checkRateLimit(EMAIL)).blocked, true);

  const other = await checkRateLimit("__other_account__@example.invalid");
  assert.equal(other.blocked, false);
});

test("buyuk/kucuk harf ve bosluk farki kilidi atlatmaz", async () => {
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await recordAttempt(EMAIL, false);
  const spoof = await checkRateLimit(`  ${EMAIL.toUpperCase()} `);
  assert.equal(spoof.blocked, true, "normalize edilmis kimlik ayni kilide dusmeli");
});

test("bos kimlik sorgu calistirmaz", async () => {
  const s = await checkRateLimit("   ");
  assert.equal(s.blocked, false);
  assert.equal(s.failedCount, 0);
});
