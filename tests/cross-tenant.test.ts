// CAPRAZ KIRACI ERISIM TESTLERI
//
// Bu dosya "bir sirketin kullanicisi digerinin verisini goremez" iddiasini
// GERCEK iki kiraci uzerinde dogrular. Onceki tenant-isolation testinden farki:
// orasi gecici olarak olusturdugu yapay bir kiraciyi kullanir, burasi sistemde
// AKTIF olan iki musteri kapsamini (veri barindiran kiraci ve bos kiraci)
// kullanir.
//
// Sinanan saldiri yuzeyleri:
//   - Dashboard / KPI / grafik sorgulari
//   - Ulke, urun (GTIP), tedarikci, rakip analizleri
//   - Arama ve filtreleme
//   - Sayfalanmis islem listesi
//   - Firma detayi (URL'e baska sirketin company_id'si yazilmasi)
//   - Baska sirketin project_id'si ile sorgu (API/URL parametresi)
//
// Calistirma: npx tsx --env-file=.env --test tests/cross-tenant.test.ts

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db";
import { organizations, projects, tradeRecords, companies } from "../src/db/schema";
import { eq, ne, and } from "drizzle-orm";
import { parseTradeFilters } from "../src/lib/filters";
import {
  getTradeKpis,
  getCountryBreakdown,
  getHsBreakdown,
  getTopImporters,
  getTopExporters,
  getTransactionsPage,
  getCompetitorRanking,
  getSupplierList,
  getFilterOptions,
} from "../src/lib/analytics";
import { getCompanyDetail, getCompaniesList, getDashboardStats } from "../src/lib/queries";
import { organizationWithData } from "./helpers/tenant";

/** Veriyi barindiran kiraci (bugun: Dekoral). */
let sahip: number;
/** Baska bir kiraci (bugun: ACC Packaging ya da platform). */
let yabanci: number;
/** sahip kiracisina ait bir proje ve bir firma - "baskasinin id'si" olarak kullanilir. */
let sahipProjectId: number;
let sahipCompanyId: number;

const none = parseTradeFilters({});

before(async () => {
  const withData = await organizationWithData();
  assert.ok(withData, "test icin ticaret verisi olan bir kiraci gerekli");
  sahip = withData;

  const [other] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(ne(organizations.id, sahip))
    .limit(1);
  assert.ok(other, "test icin en az iki kiraci gerekli");
  yabanci = other.id;

  const [p] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.organizationId, sahip))
    .limit(1);
  assert.ok(p, "sahip kiracinin en az bir projesi olmali");
  sahipProjectId = p.id;

  const [c] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.organizationId, sahip))
    .limit(1);
  assert.ok(c, "sahip kiracinin en az bir firmasi olmali");
  sahipCompanyId = c.id;
});

test("yabanci kiraci sahip kiracinin KPI'larini goremez", async () => {
  const benim = await getTradeKpis(sahip, none);
  assert.ok(benim.transactionCount > 0, "sahip kiracinin verisi olmali");

  const onun = await getTradeKpis(yabanci, none);
  assert.equal(onun.transactionCount, 0, "yabanci kiraci islem gormemeli");
  assert.equal(Number(onun.totalValueUsd), 0, "yabanci kiraci ciro gormemeli");
});

test("dashboard ve grafik sorgulari kiracilar arasi karismaz", async () => {
  const onun = await getDashboardStats(yabanci);
  const toplam = Number((onun as Record<string, unknown>).totalValueUsd ?? 0);
  assert.equal(toplam, 0, "yabanci kiracinin dashboard toplami 0 olmali");

  const kirilim = await getCountryBreakdown(yabanci, none);
  assert.equal(kirilim.length, 0, "yabanci kiraci ulke kirilimi gormemeli");

  const hs = await getHsBreakdown(yabanci, none, "hs4", 100);
  assert.equal(hs.length, 0, "yabanci kiraci GTIP kirilimi gormemeli");
});

test("firma ve tedarikci listeleri kiracilar arasi sizmaz", async () => {
  assert.equal((await getTopImporters(yabanci, none, 500)).length, 0);
  assert.equal((await getTopExporters(yabanci, none, 500)).length, 0);
  assert.equal((await getSupplierList(yabanci, none, 500)).length, 0);
  assert.equal((await getCompetitorRanking(yabanci, none)).length, 0);
});

test("sayfalanmis islem listesi yabanci kiraciya bos doner", async () => {
  const sayfa = await getTransactionsPage(yabanci, none, { page: 1, pageSize: 200 });
  assert.equal(sayfa.rows.length, 0, "yabanci kiraci islem satiri gormemeli");
});

test("arama/filtre secenekleri baska kiracinin degerlerini sizdirmaz", async () => {
  const secenekler = await getFilterOptions(yabanci, none);
  assert.equal(secenekler.importerCountries.length, 0, "yabanci kiraci ulke secenegi gormemeli");
  assert.equal(secenekler.hs4Codes.length, 0, "yabanci kiraci GTIP secenegi gormemeli");
});

test("firma ARAMASI baska kiracinin firmalarini bulamaz", async () => {
  const [hedef] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, sahipCompanyId));
  assert.ok(hedef?.name);

  // Dogrudan o firmanin adiyla aranir - yine de bulunmamali.
  const sonuc = await getCompaniesList(yabanci, { search: hedef.name });
  const satirlar = Array.isArray(sonuc) ? sonuc : (sonuc as { rows?: unknown[] }).rows ?? [];
  assert.equal(satirlar.length, 0, "yabanci kiraci baska sirketin firmasini arayarak bulamamali");
});

test("URL'e baska kiracinin company_id'si yazilirsa veri donmez", async () => {
  const kendi = await getCompanyDetail(sahip, sahipCompanyId);
  assert.ok(kendi, "sahip kiraci kendi firmasini gormeli");

  const capraz = await getCompanyDetail(yabanci, sahipCompanyId);
  assert.ok(!capraz, "yabanci kiraci baska sirketin firma detayini GORMEMELI");
});

test("baska kiracinin project_id'si ile sorgu bos doner (URL/API parametresi)", async () => {
  // Saldiri: yabanci kiraci, sahip kiracinin projesinin id'sini parametre olarak gonderir.
  const filtre = parseTradeFilters({ projectId: String(sahipProjectId) });

  const kpi = await getTradeKpis(yabanci, filtre);
  assert.equal(kpi.transactionCount, 0, "baska kiracinin projesi veri getirmemeli");

  const sayfa = await getTransactionsPage(yabanci, filtre, { page: 1, pageSize: 50 });
  assert.equal(sayfa.rows.length, 0, "baska kiracinin projesinden satir gelmemeli");

  assert.equal((await getCountryBreakdown(yabanci, filtre)).length, 0);
  assert.equal((await getTopImporters(yabanci, filtre, 100)).length, 0);
});

test("veritabaninda hicbir ticaret kaydi iki kiraciya birden ait degil", async () => {
  // Kapsam kolonu ile projenin kapsami TUTARLI olmali; aksi halde bir kayit
  // "proje uzerinden" baska kiraciya sizabilir.
  const tutarsiz = await db
    .select({ id: tradeRecords.id })
    .from(tradeRecords)
    .innerJoin(projects, eq(projects.id, tradeRecords.projectId))
    .where(and(ne(projects.organizationId, tradeRecords.organizationId)))
    .limit(5);

  assert.equal(
    tutarsiz.length,
    0,
    "ticaret kaydinin organization_id'si projesinin organization_id'si ile ayni olmali"
  );
});
