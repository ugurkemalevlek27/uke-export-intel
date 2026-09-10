import { test } from "node:test";
import assert from "node:assert/strict";
import { companyMatchKey, normalizeDisplayName } from "../src/lib/normalize";

test("yaygin sirket ekleri ayni anahtara indirgenir", () => {
  const k = companyMatchKey("ABC LTD");
  assert.equal(companyMatchKey("ABC LTD."), k);
  assert.equal(companyMatchKey("ABC LIMITED"), k);
  assert.equal(companyMatchKey("abc ltd"), k);
});

test("Turkce karakterler eslesmeyi bozmaz", () => {
  assert.equal(companyMatchKey("ŞİMŞEK KİMYA"), companyMatchKey("SIMSEK KIMYA"));
});

test("goruntu adi karakterleri BOZMAZ (sadece temizler)", () => {
  assert.equal(normalizeDisplayName('  «AZFEN» LLC.  '), "AZFEN LLC");
  assert.ok(normalizeDisplayName("ŞİMŞEK KİMYA").includes("Ş"));
});

test("bos girdi Unknown dondurur, hata firlatmaz", () => {
  assert.equal(normalizeDisplayName(""), "Unknown");
  assert.equal(normalizeDisplayName(null as unknown as string), "Unknown");
});
