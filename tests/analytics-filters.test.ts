// Filtrelerin GERCEKTEN veritabani seviyesinde uygulandigini dogrular.
//
// Calistirma: npx tsx --env-file=.env --test tests/analytics-filters.test.ts

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db";
import { organizations } from "../src/db/schema";
import { parseTradeFilters } from "../src/lib/filters";
import {
  getTradeKpis,
  getCountryBreakdown,
  getHsBreakdown,
  getTransactionsPage,
  getSupplierList,
  getSupplierDetail,
  getProductDetail,
  getDashboardOverview,
} from "../src/lib/analytics";

let org: number;
const none = parseTradeFilters({});

before(async () => {
  const [o] = await db.select({ id: organizations.id }).from(organizations).limit(1);
  assert.ok(o, "test icin en az bir organizasyon gerekli");
  org = o.id;
});

test("tarih filtresi toplamlari daraltir", async () => {
  const all = await getTradeKpis(org, none);
  assert.ok(all.transactionCount > 0, "test verisi bulunamadi");

  const narrowed = await getTradeKpis(org, parseTradeFilters({ dateFrom: "2024-04-01" }));
  assert.ok(narrowed.transactionCount < all.transactionCount, "tarih filtresi etki etmedi");
  assert.ok(narrowed.totalValueUsd < all.totalValueUsd);

  const future = await getTradeKpis(org, parseTradeFilters({ dateFrom: "2099-01-01" }));
  assert.equal(future.transactionCount, 0);
  assert.equal(future.totalValueUsd, 0);
});

test("ulke filtresi diger ulkeleri disarida birakir", async () => {
  const countries = await getCountryBreakdown(org, none);
  const target = countries[0].country!;
  const filtered = await getCountryBreakdown(org, parseTradeFilters({ importerCountry: target }));
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].country, target);
  assert.equal(Math.round(filtered[0].marketSharePct), 100);
});

test("HS4 filtresi kirilimi daraltir", async () => {
  const hs4 = await getHsBreakdown(org, none, "hs4", 5);
  assert.ok(hs4.length > 0);
  const code = hs4[0].code!;
  const filtered = await getHsBreakdown(org, parseTradeFilters({ hs4: code }), "hs4", 5);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].code, code);
});

test("sunucu tarafi sayfalama: her sayfa yalnizca pageSize kadar satir dondurur", async () => {
  const p1 = await getTransactionsPage(org, none, { page: 1, pageSize: 10 });
  assert.equal(p1.rows.length, 10);
  assert.ok(p1.totalRows > 10);
  assert.equal(p1.totalPages, Math.ceil(p1.totalRows / 10));

  const p2 = await getTransactionsPage(org, none, { page: 2, pageSize: 10 });
  // Ikinci sayfa birinciden farkli kayitlar icermeli
  const ids1 = new Set(p1.rows.map((r) => r.id));
  assert.ok(p2.rows.every((r) => !ids1.has(r.id)), "sayfalar ayni kayitlari donduruyor");
});

test("siralama yonu gercekten degisiyor", async () => {
  const desc = await getTransactionsPage(org, none, { page: 1, pageSize: 5, sort: "value_desc" });
  const asc = await getTransactionsPage(org, none, { page: 1, pageSize: 5, sort: "value_asc" });
  assert.ok(Number(desc.rows[0].valueUsd) >= Number(asc.rows[0].valueUsd));
});

test("tedarikci detayi filtreye duyarli", async () => {
  const list = await getSupplierList(org, none, 1);
  const name = list[0].name;

  const full = await getSupplierDetail(org, name, none);
  assert.ok(full.kpis.totalValueUsd > 0);
  // Her ulkedeki pazar payi 0-100 araliginda ve sira >= 1 olmali
  for (const c of full.byCountry) {
    assert.ok(c.sharePct >= 0 && c.sharePct <= 100, `gecersiz pazar payi: ${c.sharePct}`);
    assert.ok(c.rank >= 1 && c.rank <= c.competitorCount);
  }

  const empty = await getSupplierDetail(org, name, parseTradeFilters({ dateFrom: "2099-01-01" }));
  assert.equal(empty.kpis.totalValueUsd, 0);
  assert.equal(empty.byCountry.length, 0);
});

test("urun detayi: pay yuzdesi tutarli", async () => {
  const hs = await getHsBreakdown(org, none, "full", 1);
  const detail = await getProductDetail(org, hs[0].code!, none);
  const overall = await getTradeKpis(org, none);
  const expected = (detail.kpis.totalValueUsd / overall.totalValueUsd) * 100;
  assert.ok(Math.abs(detail.shareOfTotalPct - expected) < 0.01);
});

test("dashboard sayimlari negatif olamaz ve toplamla tutarli", async () => {
  const d = await getDashboardOverview(org, none);
  assert.ok(d.companyCount >= 0);
  assert.ok(d.highOpportunityCount <= d.companyCount, "yuksek firsat sayisi firma sayisini asamaz");
  assert.ok(d.activeLeadCount <= d.companyCount, "aktif lead sayisi firma sayisini asamaz");
  assert.ok(d.topOpportunities.length <= 10);
});
