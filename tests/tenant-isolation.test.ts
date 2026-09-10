// MULTI-TENANT IZOLASYON TESTI
//
// Gercek veritabanina karsi calisir: gecici bir IKINCI organizasyon olusturur,
// ona ait veri yazar ve BIRINCI organizasyonun sorgularinin bu veriyi HICBIR
// sekilde goremedigini dogrular. Test sonunda olusturdugu her seyi siler.
//
// Calistirma: npx tsx --env-file=.env --test tests/tenant-isolation.test.ts

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db";
import { organizations, projects, companies, tradeRecords } from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  getTradeKpis,
  getCountryBreakdown,
  getTopImporters,
  getTopExporters,
  getTransactionsPage,
  getCompetitorRanking,
} from "../src/lib/analytics";
import { parseTradeFilters } from "../src/lib/filters";

const MARKER = "__TENANT_TEST__";
const FOREIGN_COUNTRY = "Testland (XX)";
const FOREIGN_EXPORTER = "__TENANT_TEST_EXPORTER__";

let orgA: number;
let orgB: number;
let projectB: number;
let companyB: number;

before(async () => {
  // Mevcut (gercek) organizasyon = A
  const [existing] = await db.select({ id: organizations.id }).from(organizations).limit(1);
  assert.ok(existing, "Testin calismasi icin en az bir organizasyon gerekli");
  orgA = existing.id;

  // Gecici yabanci organizasyon = B
  const [b] = await db.insert(organizations).values({ name: MARKER }).returning();
  orgB = b.id;

  const [p] = await db
    .insert(projects)
    .values({ organizationId: orgB, name: MARKER + " projesi" })
    .returning();
  projectB = p.id;

  const [c] = await db
    .insert(companies)
    .values({ organizationId: orgB, name: MARKER + " FIRMA", country: FOREIGN_COUNTRY })
    .returning();
  companyB = c.id;

  await db.insert(tradeRecords).values([
    {
      organizationId: orgB,
      projectId: projectB,
      companyId: companyB,
      hsCode: "999999",
      hsCode2: "99",
      hsCode4: "9999",
      hsCode6: "999999",
      exporterNameRaw: FOREIGN_EXPORTER,
      exporterCountry: FOREIGN_COUNTRY,
      importerNameRaw: MARKER + " FIRMA",
      importerCountry: FOREIGN_COUNTRY,
      transactionDate: "2024-05-05",
      valueUsd: "777777",
      sourceFile: MARKER,
    },
  ]);
});

after(async () => {
  await db.delete(tradeRecords).where(eq(tradeRecords.organizationId, orgB));
  await db.delete(companies).where(eq(companies.organizationId, orgB));
  await db.delete(projects).where(eq(projects.organizationId, orgB));
  await db.delete(organizations).where(eq(organizations.id, orgB));
});

const noFilters = parseTradeFilters({});

test("KPI toplamlari baska organizasyonun degerini icermez", async () => {
  const a = await getTradeKpis(orgA, noFilters);
  const b = await getTradeKpis(orgB, noFilters);

  assert.equal(b.totalValueUsd, 777777, "B kendi verisini gormeli");
  assert.equal(b.transactionCount, 1);
  // A'nin toplami B'nin tek kaydini icermemeli
  assert.ok(!String(a.totalValueUsd).includes("777777"));
  assert.equal(a.countryCount, 1, "A yalnizca kendi ulkesini gormeli");
});

test("ulke kirilimi organizasyonlar arasi sizmaz", async () => {
  const a = await getCountryBreakdown(orgA, noFilters);
  assert.ok(
    !a.some((r) => r.country === FOREIGN_COUNTRY),
    "A, B'nin ulkesini gormemeli"
  );
  const b = await getCountryBreakdown(orgB, noFilters);
  assert.equal(b.length, 1);
  assert.equal(b[0].country, FOREIGN_COUNTRY);
});

test("firma ve tedarikci listeleri sizmaz", async () => {
  const importersA = await getTopImporters(orgA, noFilters, 500);
  assert.ok(!importersA.some((r) => r.companyId === companyB));
  assert.ok(!importersA.some((r) => (r.name ?? "").includes(MARKER)));

  const exportersA = await getTopExporters(orgA, noFilters, 500);
  assert.ok(!exportersA.some((r) => r.name === FOREIGN_EXPORTER));
});

test("islem listesi (sayfali) sizmaz", async () => {
  const pageA = await getTransactionsPage(orgA, noFilters, { page: 1, pageSize: 200 });
  assert.ok(!pageA.rows.some((r) => r.importerName.includes(MARKER)));
  assert.ok(!pageA.rows.some((r) => r.valueUsd === "777777"));

  const pageB = await getTransactionsPage(orgB, noFilters, { page: 1, pageSize: 200 });
  assert.equal(pageB.totalRows, 1);
});

test("rakip siralamasi (ham SQL + pencere fonksiyonu) sizmaz", async () => {
  // Bu sorgu db.execute ile ham SQL kullaniyor - izolasyonun orada da gecerli
  // oldugunu ayrica dogrulamak onemli.
  const a = await getCompetitorRanking(orgA, noFilters, 500);
  assert.ok(!a.some((r) => r.exporterName === FOREIGN_EXPORTER));

  const b = await getCompetitorRanking(orgB, noFilters, 500);
  assert.equal(b.length, 1);
  assert.equal(b[0].exporterName, FOREIGN_EXPORTER);
  assert.equal(b[0].marketSharePct, 100);
});

test("baska organizasyonun projectId'si ile filtrelemek veri getirmez", async () => {
  // Saldiri senaryosu: A kullanicisi URL'e ?project=<B'nin projesi> yaziyor.
  // organizationId kosulu her zaman uygulandigi icin sonuc BOS olmali.
  const spoofed = parseTradeFilters({ project: String(projectB) });
  const kpis = await getTradeKpis(orgA, spoofed);
  assert.equal(kpis.transactionCount, 0);
  assert.equal(kpis.totalValueUsd, 0);

  const page = await getTransactionsPage(orgA, spoofed, { page: 1, pageSize: 50 });
  assert.equal(page.totalRows, 0);
});
