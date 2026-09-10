import { db } from "@/db";
import { companies, companyProjects, tradeRecords, importBatches, isLeadStatus } from "@/db/schema";
import { and, eq, sql, desc, ilike } from "drizzle-orm";
import { countryNameToIso2 } from "./countryCodes";

// ---------------------------------------------------------------------------
// Phase 1: proje (client workspace) scope'u
// ---------------------------------------------------------------------------
// Tum sorgular artik organizationId'ye EK OLARAK opsiyonel projectId ile
// daraltilabiliyor. projectId verilmezse davranis V1 ile birebir ayni kalir
// (organizasyon geneli) - mevcut cagrilar bozulmaz.

function tradeScope(organizationId: number, projectId?: number) {
  return projectId === undefined
    ? eq(tradeRecords.organizationId, organizationId)
    : and(eq(tradeRecords.organizationId, organizationId), eq(tradeRecords.projectId, projectId))!;
}

export async function getDashboardStats(organizationId: number, projectId?: number) {
  const [totals] = await db
    .select({
      totalCompanies: sql<number>`COUNT(DISTINCT ${companies.id})`,
      totalValueUsd: sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}), 0)`,
      totalRecords: sql<number>`COUNT(${tradeRecords.id})`,
    })
    .from(tradeRecords)
    .leftJoin(companies, eq(companies.id, tradeRecords.companyId))
    .where(tradeScope(organizationId, projectId));

  const [{ highPotentialCount }] = await db
    .select({ highPotentialCount: sql<number>`COUNT(*)` })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(
      and(
        eq(companies.organizationId, organizationId),
        eq(companyProjects.leadScoreLabel, "Yuksek Potansiyel"),
        ...(projectId === undefined ? [] : [eq(companyProjects.projectId, projectId)])
      )
    );

  const byCountry = await db
    .select({
      country: tradeRecords.importerCountry,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      companyCount: sql<number>`COUNT(DISTINCT ${tradeRecords.companyId})`,
    })
    .from(tradeRecords)
    .where(tradeScope(organizationId, projectId))
    .groupBy(tradeRecords.importerCountry)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`));

  const topCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      country: companies.country,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
    })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(
      and(
        eq(companies.organizationId, organizationId),
        ...(projectId === undefined ? [] : [eq(companyProjects.projectId, projectId)])
      )
    )
    .orderBy(desc(companyProjects.leadScore))
    .limit(8);

  const recentImports = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.organizationId, organizationId))
    .orderBy(desc(importBatches.createdAt))
    .limit(5);

  return {
    totalCompanies: Number(totals?.totalCompanies ?? 0),
    totalValueUsd: Number(totals?.totalValueUsd ?? 0),
    totalRecords: Number(totals?.totalRecords ?? 0),
    highPotentialCount: Number(highPotentialCount ?? 0),
    byCountry,
    topCompanies,
    recentImports,
  };
}

export interface CompanyListFilters {
  projectId?: number;
  search?: string;
  country?: string;
  minScore?: number;
  status?: string;
}

export interface CompaniesListResult {
  rows: {
    id: number;
    name: string;
    country: string | null;
    companyType: string | null;
    leadScore: number | null;
    leadScoreLabel: string | null;
    leadStatus: string | null;
    salesOwner: string | null;
    nextFollowupDate: string | null;
    possibleDuplicateOfId: number | null;
  }[];
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Firma listesi.
 *
 * Phase 1 degisiklikleri:
 *  - projectId ile daraltilabilir (aktif client workspace).
 *  - search / minScore artik VERITABANINDA filtreleniyor (V1'de tum satirlar
 *    cekilip JavaScript icinde filtreleniyordu - buyuk veri setinde surdurulemez).
 *  - Sunucu tarafi sayfalama eklendi.
 */
export async function getCompaniesList(
  organizationId: number,
  filters: CompanyListFilters = {},
  opts: { page?: number; pageSize?: number } = {}
): Promise<CompaniesListResult> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);

  const conditions = [eq(companies.organizationId, organizationId)];
  if (filters.projectId !== undefined) {
    conditions.push(eq(companyProjects.projectId, filters.projectId));
  }
  if (filters.country) conditions.push(eq(companies.country, filters.country));
  // Gecersiz bir status degeri (elle URL degistirme) sorguyu bozmaz, yok sayilir.
  if (filters.status && isLeadStatus(filters.status)) {
    conditions.push(eq(companyProjects.leadStatus, filters.status));
  }
  if (filters.search) conditions.push(ilike(companies.name, `%${filters.search}%`));
  if (filters.minScore !== undefined) {
    conditions.push(sql`COALESCE(${companyProjects.leadScore}, 0) >= ${filters.minScore}`);
  }

  const joinOn =
    filters.projectId === undefined
      ? eq(companyProjects.companyId, companies.id)
      : and(
          eq(companyProjects.companyId, companies.id),
          eq(companyProjects.projectId, filters.projectId)
        )!;

  const where = and(...conditions)!;

  const [countRow] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(companies)
    .leftJoin(companyProjects, joinOn)
    .where(where);
  const totalRows = Number(countRow?.n ?? 0);

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      country: companies.country,
      companyType: companies.companyType,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
      leadStatus: companyProjects.leadStatus,
      salesOwner: companyProjects.salesOwner,
      nextFollowupDate: companyProjects.nextFollowupDate,
      possibleDuplicateOfId: companies.possibleDuplicateOfId,
    })
    .from(companies)
    .leftJoin(companyProjects, joinOn)
    .where(where)
    .orderBy(desc(companyProjects.leadScore))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    rows,
    totalRows,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
  };
}

// ---------------------------------------------------------------------------
// Analiz ekranlari (Ulke Analizi / Urun Analizi) - pazaranaliz.azurewebsites.net
// tarzi drill-down raporlar icin. "Firma/Alici Analizi" zaten Firmalar sayfasinda
// (getCompaniesList / getCompanyDetail) karsilaniyor, burada tekrar yazilmiyor.
// ---------------------------------------------------------------------------

export interface CountryMapPoint {
  code: string; // kucuk harfli ISO2 (react-svg-worldmap formati)
  value: number;
  rawCountry: string; // /analiz sayfasina link vermek icin kullanilan orijinal deger (en yuksek hacimli varyant)
}

/**
 * Dashboard'daki dunya haritasi icin ulke bazinda toplam ithalat hacmini
 * ISO2 koduna gore gruplar. Ayni ISO2 koduna eslesen birden fazla ham deger
 * varsa (ornegin "Turkey" ve "TURKIYE" ayni dosyada farkli yazilmissa)
 * degerleri toplar ve en yuksek hacimli ham degeri /analiz linki icin saklar.
 */
export async function getCountryMapData(organizationId: number, projectId?: number): Promise<CountryMapPoint[]> {
  const rows = await getDistinctCountries(organizationId, projectId);

  const byCode = new Map<string, CountryMapPoint>();
  for (const row of rows) {
    const code = countryNameToIso2(row.country);
    if (!code || !row.country) continue;
    const value = Number(row.totalValueUsd) || 0;
    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, { code, value, rawCountry: row.country });
    } else {
      existing.value += value;
      // rows zaten hacme gore azalan sirali geldigi icin ilk gorulen varyant
      // otomatik olarak en yuksek hacimli olur; rawCountry'i degistirmiyoruz.
    }
  }

  return Array.from(byCode.values()).sort((a, b) => b.value - a.value);
}

export async function getDistinctCountries(organizationId: number, projectId?: number) {
  const rows = await db
    .select({
      country: tradeRecords.importerCountry,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
    })
    .from(tradeRecords)
    .where(tradeScope(organizationId, projectId))
    .groupBy(tradeRecords.importerCountry)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`));
  return rows;
}

// Bir HS Code icin en cok tekrar eden / en "temiz" aciklamayi secmek uzere
// kullanilan ortak siralama kurali. Ham veride ayni HS Code'a ait iki tur
// bozuk deger goruluyor: (1) anlamsiz kisa degerler (".", "-") ve (2) tek
// hucreye virgulle art arda eklenmis onlarca urun varyanti ("A,B,C,..."). Bu
// yuzden: once az sayida virgul iceren (tek urune yakin) degerleri, onlar
// arasinda da daha bilgilendirici (daha uzun) olani tercih ediyoruz.
const DESCRIPTION_RANK_SQL = sql`
  (length(product_description) - length(replace(product_description, ',', ''))) ASC,
  length(product_description) DESC
`;

/**
 * Her GTIP (HS Code) icin "temsilci" urun aciklamasi secer (bkz. yukaridaki
 * not). Onceden MIN() kullaniliyordu; bu alfabetik en kucuk degeri (siklikla
 * anlamsiz "." gibi kisa degerleri) seciyordu.
 */
async function getRepresentativeDescriptions(organizationId: number, projectId?: number): Promise<Map<string, string>> {
  const result = await db.execute(sql`
    SELECT DISTINCT ON (hs_code) hs_code AS "hsCode", product_description AS "productDescription"
    FROM trade_records
    WHERE organization_id = ${organizationId}
      AND (${projectId === undefined} OR project_id = ${projectId ?? null})
      AND product_description IS NOT NULL
      AND length(trim(product_description)) > 2
      AND product_description <> 'Not Available'
    ORDER BY hs_code, ${DESCRIPTION_RANK_SQL}
  `);
  const map = new Map<string, string>();
  for (const row of result.rows as { hsCode: string; productDescription: string }[]) {
    map.set(row.hsCode, row.productDescription);
  }
  return map;
}

export async function getDistinctProducts(organizationId: number, projectId?: number) {
  const [rows, descriptions] = await Promise.all([
    db
      .select({
        hsCode: tradeRecords.hsCode,
        totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      })
      .from(tradeRecords)
      .where(tradeScope(organizationId, projectId))
      .groupBy(tradeRecords.hsCode)
      .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`)),
    getRepresentativeDescriptions(organizationId, projectId),
  ]);
  return rows.map((r) => ({
    ...r,
    productDescription: descriptions.get(r.hsCode) ?? "Not Available",
  }));
}

export async function getCountryAnalysis(organizationId: number, country: string, projectId?: number) {
  const conditions = [tradeScope(organizationId, projectId), eq(tradeRecords.importerCountry, country)];

  const [kpis] = await db
    .select({
      totalValueUsd: sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}), 0)`,
      transactionCount: sql<number>`COUNT(*)`,
      distinctExporters: sql<number>`COUNT(DISTINCT ${tradeRecords.exporterNameRaw})`,
      distinctImporters: sql<number>`COUNT(DISTINCT ${tradeRecords.companyId})`,
    })
    .from(tradeRecords)
    .where(and(...conditions));

  const topExporters = await db
    .select({
      name: tradeRecords.exporterNameRaw,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      shipmentCount: sql<number>`COUNT(*)`,
    })
    .from(tradeRecords)
    .where(and(...conditions))
    .groupBy(tradeRecords.exporterNameRaw)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(20);

  const topImporters = await db
    .select({
      companyId: tradeRecords.companyId,
      name: companies.name,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      shipmentCount: sql<number>`COUNT(*)`,
    })
    .from(tradeRecords)
    .leftJoin(companies, eq(companies.id, tradeRecords.companyId))
    .leftJoin(companyProjects, eq(companyProjects.companyId, tradeRecords.companyId))
    .where(and(...conditions))
    .groupBy(tradeRecords.companyId, companies.name, companyProjects.leadScore, companyProjects.leadScoreLabel)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(20);

  return { kpis, topExporters, topImporters };
}

export async function getProductAnalysis(organizationId: number, hsCode: string, projectId?: number) {
  const conditions = [tradeScope(organizationId, projectId), eq(tradeRecords.hsCode, hsCode)];

  const [kpis] = await db
    .select({
      totalValueUsd: sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}), 0)`,
      transactionCount: sql<number>`COUNT(*)`,
      distinctCountries: sql<number>`COUNT(DISTINCT ${tradeRecords.importerCountry})`,
      distinctImporters: sql<number>`COUNT(DISTINCT ${tradeRecords.companyId})`,
    })
    .from(tradeRecords)
    .where(and(...conditions));

  // En bilgilendirici (en uzun) urun aciklamasini ayrica secilir (bkz.
  // getRepresentativeDescriptions - MIN() anlamsiz kisa degerleri seçebiliyordu)
  const [descRow] = await db
    .select({ productDescription: tradeRecords.productDescription })
    .from(tradeRecords)
    .where(
      and(
        ...conditions,
        sql`${tradeRecords.productDescription} IS NOT NULL`,
        sql`length(trim(${tradeRecords.productDescription})) > 2`,
        sql`${tradeRecords.productDescription} <> 'Not Available'`
      )
    )
    .orderBy(
      sql`(length(${tradeRecords.productDescription}) - length(replace(${tradeRecords.productDescription}, ',', ''))) ASC`,
      desc(sql`length(${tradeRecords.productDescription})`)
    )
    .limit(1);
  const productDescription = descRow?.productDescription ?? "Not Available";

  const byCountry = await db
    .select({
      country: tradeRecords.importerCountry,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      shipmentCount: sql<number>`COUNT(*)`,
    })
    .from(tradeRecords)
    .where(and(...conditions))
    .groupBy(tradeRecords.importerCountry)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(20);

  const topImporters = await db
    .select({
      companyId: tradeRecords.companyId,
      name: companies.name,
      country: companies.country,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
    })
    .from(tradeRecords)
    .leftJoin(companies, eq(companies.id, tradeRecords.companyId))
    .leftJoin(companyProjects, eq(companyProjects.companyId, tradeRecords.companyId))
    .where(and(...conditions))
    .groupBy(tradeRecords.companyId, companies.name, companies.country, companyProjects.leadScore, companyProjects.leadScoreLabel)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(20);

  return {
    kpis: kpis ? { ...kpis, productDescription } : kpis,
    byCountry,
    topImporters,
  };
}


// ---------------------------------------------------------------------------
// Tedarikci (Ihracatci) Analizi - rakip platformdaki "Predo Analizi" karsiligi.
// Fark: tek bir "kendi firmamiz" yerine, veri icindeki HERHANGI bir tedarikci
// secilebiliyor. Boylece hem kendi/musteri performansi hem rakip analizi ayni
// ekranda yapilabiliyor.
// ---------------------------------------------------------------------------

export async function getDistinctExporters(organizationId: number, projectId?: number) {
  const rows = await db
    .select({
      name: tradeRecords.exporterNameRaw,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      countryCount: sql<number>`COUNT(DISTINCT ${tradeRecords.importerCountry})`,
    })
    .from(tradeRecords)
    .where(and(tradeScope(organizationId, projectId), sql`${tradeRecords.exporterNameRaw} IS NOT NULL`))
    .groupBy(tradeRecords.exporterNameRaw)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`));
  return rows;
}

export interface ExporterCountryPerformance {
  country: string;
  myValueUsd: number;
  countryTotalUsd: number;
  sharePct: number;
  rank: number;
  competitorCount: number;
}

export async function getExporterAnalysis(organizationId: number, exporterName: string, projectId?: number) {
  // --- Genel KPI'lar ---
  const [kpis] = await db
    .select({
      totalValueUsd: sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}), 0)`,
      transactionCount: sql<number>`COUNT(*)`,
      distinctCustomers: sql<number>`COUNT(DISTINCT ${tradeRecords.companyId})`,
      distinctCountries: sql<number>`COUNT(DISTINCT ${tradeRecords.importerCountry})`,
      distinctProducts: sql<number>`COUNT(DISTINCT ${tradeRecords.hsCode})`,
    })
    .from(tradeRecords)
    .where(and(tradeScope(organizationId, projectId), eq(tradeRecords.exporterNameRaw, exporterName)));

  // --- Ulke bazinda performans: pazar payi + siralama + rakip sayisi ---
  // Pencere fonksiyonlari ile tek sorguda: her ulkede tum tedarikcileri siralayip
  // sadece secilen tedarikcinin satirini aliyoruz.
  const perfResult = await db.execute(sql`
    WITH country_exporter AS (
      SELECT importer_country, exporter_name_raw, SUM(value_usd) AS val
      FROM trade_records
      WHERE organization_id = ${organizationId}
        AND (${projectId === undefined} OR project_id = ${projectId ?? null})
        AND exporter_name_raw IS NOT NULL
      GROUP BY importer_country, exporter_name_raw
    ),
    ranked AS (
      SELECT
        importer_country,
        exporter_name_raw,
        val,
        RANK() OVER (PARTITION BY importer_country ORDER BY val DESC) AS rnk,
        SUM(val) OVER (PARTITION BY importer_country) AS country_total,
        COUNT(*) OVER (PARTITION BY importer_country) AS competitor_count
      FROM country_exporter
    )
    SELECT
      importer_country AS "country",
      val AS "myValueUsd",
      country_total AS "countryTotalUsd",
      rnk AS "rank",
      competitor_count AS "competitorCount"
    FROM ranked
    WHERE exporter_name_raw = ${exporterName}
    ORDER BY val DESC
  `);

  const byCountry: ExporterCountryPerformance[] = (
    perfResult.rows as {
      country: string;
      myValueUsd: string;
      countryTotalUsd: string;
      rank: string;
      competitorCount: string;
    }[]
  ).map((r) => {
    const my = Number(r.myValueUsd) || 0;
    const total = Number(r.countryTotalUsd) || 0;
    return {
      country: r.country,
      myValueUsd: my,
      countryTotalUsd: total,
      sharePct: total > 0 ? (my / total) * 100 : 0,
      rank: Number(r.rank) || 0,
      competitorCount: Number(r.competitorCount) || 0,
    };
  });

  // --- Bu tedarikcinin musterileri ---
  const topCustomers = await db
    .select({
      companyId: tradeRecords.companyId,
      name: companies.name,
      country: companies.country,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
    })
    .from(tradeRecords)
    .leftJoin(companies, eq(companies.id, tradeRecords.companyId))
    .leftJoin(companyProjects, eq(companyProjects.companyId, tradeRecords.companyId))
    .where(and(tradeScope(organizationId, projectId), eq(tradeRecords.exporterNameRaw, exporterName)))
    .groupBy(
      tradeRecords.companyId,
      companies.name,
      companies.country,
      companyProjects.leadScore,
      companyProjects.leadScoreLabel
    )
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(20);

  // --- Henuz girilmemis pazarlar (bu tedarikcinin satisi olmayan ulkeler) ---
  const oppMarketsResult = await db.execute(sql`
    WITH country_totals AS (
      SELECT importer_country, SUM(value_usd) AS total, COUNT(DISTINCT company_id) AS company_count
      FROM trade_records
      WHERE organization_id = ${organizationId}
        AND (${projectId === undefined} OR project_id = ${projectId ?? null})
      GROUP BY importer_country
    ),
    entered AS (
      SELECT DISTINCT importer_country
      FROM trade_records
      WHERE organization_id = ${organizationId}
        AND (${projectId === undefined} OR project_id = ${projectId ?? null})
        AND exporter_name_raw = ${exporterName}
    )
    SELECT
      ct.importer_country AS "country",
      ct.total AS "totalValueUsd",
      ct.company_count AS "companyCount"
    FROM country_totals ct
    WHERE ct.importer_country NOT IN (SELECT importer_country FROM entered)
    ORDER BY ct.total DESC
  `);

  const opportunityMarkets = (
    oppMarketsResult.rows as { country: string; totalValueUsd: string; companyCount: string }[]
  ).map((r) => ({
    country: r.country,
    totalValueUsd: Number(r.totalValueUsd) || 0,
    companyCount: Number(r.companyCount) || 0,
  }));

  // --- Satis firsati: ayni urunleri (GTIP) alan, ama bu tedarikciden ALMAYAN
  //     firmalar. Firsat Skoruna gore siralanir - dogrudan satis lead listesi.
  const leadsResult = await db.execute(sql`
    WITH my_hs AS (
      SELECT DISTINCT hs_code
      FROM trade_records
      WHERE organization_id = ${organizationId}
        AND (${projectId === undefined} OR project_id = ${projectId ?? null})
        AND exporter_name_raw = ${exporterName}
    ),
    my_customers AS (
      SELECT DISTINCT company_id
      FROM trade_records
      WHERE organization_id = ${organizationId}
        AND (${projectId === undefined} OR project_id = ${projectId ?? null})
        AND exporter_name_raw = ${exporterName}
        AND company_id IS NOT NULL
    )
    SELECT
      tr.company_id AS "companyId",
      c.name AS "name",
      c.country AS "country",
      cp.lead_score AS "leadScore",
      cp.lead_score_label AS "leadScoreLabel",
      SUM(tr.value_usd) AS "totalValueUsd"
    FROM trade_records tr
    JOIN companies c ON c.id = tr.company_id
    LEFT JOIN company_projects cp ON cp.company_id = tr.company_id
    WHERE tr.organization_id = ${organizationId}
      AND (${projectId === undefined} OR tr.project_id = ${projectId ?? null})
      AND tr.hs_code IN (SELECT hs_code FROM my_hs)
      AND tr.company_id NOT IN (SELECT company_id FROM my_customers)
    GROUP BY tr.company_id, c.name, c.country, cp.lead_score, cp.lead_score_label
    ORDER BY cp.lead_score DESC NULLS LAST, SUM(tr.value_usd) DESC
    LIMIT 25
  `);

  const opportunityLeads = (
    leadsResult.rows as {
      companyId: number;
      name: string;
      country: string | null;
      leadScore: number | null;
      leadScoreLabel: string | null;
      totalValueUsd: string;
    }[]
  ).map((r) => ({
    companyId: Number(r.companyId),
    name: r.name,
    country: r.country,
    leadScore: r.leadScore === null ? null : Number(r.leadScore),
    leadScoreLabel: r.leadScoreLabel,
    totalValueUsd: Number(r.totalValueUsd) || 0,
  }));

  return { kpis, byCountry, topCustomers, opportunityMarkets, opportunityLeads };
}

export async function getCompanyDetail(organizationId: number, companyId: number) {
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.organizationId, organizationId)));
  if (!company) return null;

  const [cp] = await db
    .select()
    .from(companyProjects)
    .where(eq(companyProjects.companyId, companyId));

  const records = await db
    .select()
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, companyId))
    .orderBy(desc(tradeRecords.transactionDate));

  const byYear = await db
    .select({
      year: sql<string>`EXTRACT(YEAR FROM ${tradeRecords.transactionDate})`,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
    })
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, companyId))
    .groupBy(sql`EXTRACT(YEAR FROM ${tradeRecords.transactionDate})`);

  const bySupplier = await db
    .select({
      supplier: tradeRecords.exporterNameRaw,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      shipmentCount: sql<number>`COUNT(*)`,
    })
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, companyId))
    .groupBy(tradeRecords.exporterNameRaw)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`));

  const byProduct = await db
    .select({
      product: tradeRecords.productDescription,
      hsCode: tradeRecords.hsCode,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
    })
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, companyId))
    .groupBy(tradeRecords.productDescription, tradeRecords.hsCode)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(20);

  return { company, companyProject: cp ?? null, records, byYear, bySupplier, byProduct };
}
