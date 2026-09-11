// Import V2: duplicate koruma ve toplu yazma testleri.
//
// Gercek veritabanina karsi calisir: gecici bir organizasyon + proje olusturur,
// ayni veriyi IKI KEZ import eder ve ikinci seferde hicbir satirin
// eklenmedigini dogrular. Sonunda olusturdugu her seyi siler.
//
// Calistirma: npx tsx --env-file=.env --test tests/import-dedup.test.ts

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db";
import { organizations, projects, companies, tradeRecords, importBatches, companyProjects } from "../src/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { importTradeDataRows } from "../src/lib/importTradeData";
import { computeRowHash } from "../src/lib/rowHash";
import { suggestMapping, missingRequired } from "../src/lib/columnMapping";

const MARKER = "__IMPORT_TEST__";
let orgId: number;
let projectId: number;

/** Gercek dosyalardaki basliklarla ayni sekilde adlandirilmis ornek satirlar. */
function sampleRows(n = 50) {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      "HS_Code": "320890" + String(100000 + i).slice(-6),
      "Importer": `${MARKER} ALICI ${i % 10}`,
      "Country_of_Importers": "Testland (XX)",
      "Exporter": `${MARKER} TEDARIKCI ${i % 3}`,
      "Country_of_Exporters": "Turkey (TR)",
      "Date": "2024-0" + ((i % 7) + 1) + "-15",
      "Actual_Detailed_Product": `Test urun ${i}`,
      "Quantity": 10 + i,
      "Unit_Qty": "KG",
      "MT": "1,5",
      "Value(USD)": String(1000 + i * 7),
      "Shipments": 1,
    });
  }
  return rows;
}

before(async () => {
  const [o] = await db.insert(organizations).values({ name: MARKER }).returning();
  orgId = o.id;
  const [p] = await db.insert(projects).values({ organizationId: orgId, name: MARKER }).returning();
  projectId = p.id;
});

after(async () => {
  // Silme sirasi onemli: yabanci anahtar bagimliligi olan tablolar once silinir.
  await db.delete(tradeRecords).where(eq(tradeRecords.organizationId, orgId));
  await db.delete(importBatches).where(eq(importBatches.organizationId, orgId));
  await db.delete(companyProjects).where(eq(companyProjects.projectId, projectId));
  // possibleDuplicateOfId kendi tablosuna referans verdigi icin once temizlenir
  await db.update(companies).set({ possibleDuplicateOfId: null }).where(eq(companies.organizationId, orgId));
  await db.delete(companies).where(eq(companies.organizationId, orgId));
  await db.delete(projects).where(eq(projects.organizationId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

test("otomatik sutun eslestirmesi gercek basliklari taniyor", () => {
  const headers = Object.keys(sampleRows(1)[0]);
  const m = suggestMapping(headers);
  assert.equal(m.hsCode, "HS_Code");
  assert.equal(m.importer, "Importer");
  assert.equal(m.valueUsd, "Value(USD)");
  assert.equal(m.exporter, "Exporter");
  assert.equal(m.date, "Date");
  assert.deepEqual(missingRequired(m), [], "zorunlu alanlarin hepsi eslesmeli");
});

test("ilk import tum satirlari ekler", async () => {
  const rows = sampleRows(50);
  const r = await importTradeDataRows({
    organizationId: orgId, projectId, sourceFile: "test.xlsx", rows,
  });
  assert.equal(r.successCount, 50);
  assert.equal(r.skippedDuplicateCount, 0);
  assert.equal(r.errorCount, 0);

  const [{ n }] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(tradeRecords)
    .where(eq(tradeRecords.organizationId, orgId));
  assert.equal(Number(n), 50);
});

test("AYNI dosya ikinci kez yuklenince HIC satir eklenmez", async () => {
  const rows = sampleRows(50);
  const r = await importTradeDataRows({
    organizationId: orgId, projectId, sourceFile: "test.xlsx", rows,
  });
  assert.equal(r.successCount, 0, "ikinci yuklemede yeni satir eklenmemeli");
  assert.equal(r.skippedDuplicateCount, 50, "50 satirin tamami duplicate olarak atlanmali");

  const [{ n }] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(tradeRecords)
    .where(eq(tradeRecords.organizationId, orgId));
  assert.equal(Number(n), 50, "toplam satir sayisi degismemeli");
});

test("dosyanin KENDI icindeki tekrarlar da atlanir", async () => {
  const rows = [...sampleRows(5), ...sampleRows(5)]; // her satir iki kez
  const r = await importTradeDataRows({
    organizationId: orgId, projectId, sourceFile: "tekrarli.xlsx", rows,
  });
  // 5 satir zaten veritabaninda var (onceki testten) + dosya ici tekrar
  assert.equal(r.successCount, 0);
  assert.equal(r.skippedDuplicateCount, 10);
});

test("YENI satirlar eklenir, eskiler atlanir (kismi ortusme)", async () => {
  const rows = [...sampleRows(50), ...sampleRows(60).slice(50)]; // 50 eski + 10 yeni
  const r = await importTradeDataRows({
    organizationId: orgId, projectId, sourceFile: "genisletilmis.xlsx", rows,
  });
  assert.equal(r.successCount, 10, "yalnizca yeni 10 satir eklenmeli");
  assert.equal(r.skippedDuplicateCount, 50, "eski 50 satir atlanmali");

  const [{ n }] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(tradeRecords)
    .where(eq(tradeRecords.organizationId, orgId));
  assert.equal(Number(n), 60);
});

test("hash deterministik ve alan degisikligine duyarli", () => {
  const a = { projectId: 1, hsCode: "3208", importerNameRaw: "ABC", exporterNameRaw: "X",
              importerCountry: "TR", transactionDate: "2024-01-01", valueUsd: 100, quantity: 5 };
  assert.equal(computeRowHash(a), computeRowHash(a), "ayni girdi ayni hash");
  // Bosluk/buyuk-kucuk harf farki duplicate saymayi engellememeli
  assert.equal(computeRowHash(a), computeRowHash({ ...a, importerNameRaw: "  abc  " }));
  // Gercek bir alan degisirse hash degismeli
  assert.notEqual(computeRowHash(a), computeRowHash({ ...a, valueUsd: 101 }));
  assert.notEqual(computeRowHash(a), computeRowHash({ ...a, transactionDate: "2024-01-02" }));
});

test("zorunlu alani eksik satirlar hata olarak raporlanir, digerleri eklenir", async () => {
  const rows: Record<string, unknown>[] = [
    { "HS_Code": "320899000001", "Importer": `${MARKER} GECERLI`, "Value(USD)": "500",
      "Country_of_Importers": "Testland (XX)", "Exporter": "T1", "Date": "2024-09-01" },
    { "HS_Code": "", "Importer": `${MARKER} EKSIK`, "Value(USD)": "500" },          // GTIP yok
    { "HS_Code": "320899000002", "Importer": "", "Value(USD)": "500" },              // ithalatci yok
    { "HS_Code": "320899000003", "Importer": `${MARKER} X`, "Value(USD)": "abc" },   // deger gecersiz
  ];
  const r = await importTradeDataRows({
    organizationId: orgId, projectId, sourceFile: "hatali.xlsx", rows,
  });
  assert.equal(r.successCount, 1);
  assert.equal(r.errorCount, 3);
  assert.ok(r.errors[0].reason.includes("GTİP"), "hata mesaji eksik alani adiyla belirtmeli");
});

test("firma kayitlari tekrar olusturulmaz (ayni firma tek kayit)", async () => {
  const [{ n }] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(companies)
    .where(and(eq(companies.organizationId, orgId), sql`${companies.name} LIKE ${MARKER + " ALICI%"}`));
  assert.equal(Number(n), 10, "10 farkli alici firma olmali (tekrar eden kayit yok)");
});
