// Analiz sorgu katmani (Phase 1)
//
// KURALLAR:
//  - Her fonksiyon organizationId + TradeFilters alir; WHERE kosullari yalnizca
//    lib/filters.ts uzerinden uretilir (multi-tenant guvencesi tek kapidan gecer).
//  - Tum toplama (SUM/COUNT/GROUP BY) ve sayfalama VERITABANINDA yapilir;
//    React tarafina buyuk dataset gonderilmez.
//  - Hesaplama formulleri acik ve deterministiktir; tahmin/uydurma deger yoktur.
//  - Veri yoksa 0 / null doner; "veri yokken sifir gostermek" ile "veri yok"
//    ayrimini cagiran katman yapar.

import { db } from "@/db";
import { companies, companyProjects, tradeRecords } from "@/db/schema";
import { and, desc, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { tradeWhere, tradeConditionsSql, type TradeFilters } from "./filters";
import { calculateTargetMarketScore, type TargetMarketScore } from "./targetMarketScoring";

// ---------------------------------------------------------------------------
// KPI'lar
// ---------------------------------------------------------------------------

export interface TradeKpis {
  totalValueUsd: number;
  totalShipments: number;
  transactionCount: number;
  importerCount: number;
  exporterCount: number;
  hsCodeCount: number;
  countryCount: number;
  avgShipmentValueUsd: number;
  firstTransactionDate: string | null;
  lastTransactionDate: string | null;
}

export async function getTradeKpis(
  organizationId: number,
  filters: TradeFilters
): Promise<TradeKpis> {
  const [row] = await db
    .select({
      totalValueUsd: sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}), 0)`,
      totalShipments: sql<string>`COALESCE(SUM(${tradeRecords.shipments}), 0)`,
      transactionCount: sql<string>`COUNT(*)`,
      importerCount: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})`,
      exporterCount: sql<string>`COUNT(DISTINCT ${tradeRecords.exporterNameRaw})`,
      hsCodeCount: sql<string>`COUNT(DISTINCT ${tradeRecords.hsCode})`,
      countryCount: sql<string>`COUNT(DISTINCT ${tradeRecords.importerCountry})`,
      firstTransactionDate: sql<string | null>`MIN(${tradeRecords.transactionDate})`,
      lastTransactionDate: sql<string | null>`MAX(${tradeRecords.transactionDate})`,
    })
    .from(tradeRecords)
    .where(tradeWhere(organizationId, filters));

  const totalValueUsd = Number(row?.totalValueUsd ?? 0);
  const transactionCount = Number(row?.transactionCount ?? 0);

  return {
    totalValueUsd,
    totalShipments: Number(row?.totalShipments ?? 0),
    transactionCount,
    importerCount: Number(row?.importerCount ?? 0),
    exporterCount: Number(row?.exporterCount ?? 0),
    hsCodeCount: Number(row?.hsCodeCount ?? 0),
    countryCount: Number(row?.countryCount ?? 0),
    // Ortalama sevkiyat degeri = toplam deger / islem sayisi (formul acik)
    avgShipmentValueUsd: transactionCount > 0 ? totalValueUsd / transactionCount : 0,
    firstTransactionDate: row?.firstTransactionDate ?? null,
    lastTransactionDate: row?.lastTransactionDate ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ulke kirilimi (Country Analysis + dunya haritasi)
// ---------------------------------------------------------------------------

export interface CountryBreakdownRow {
  country: string | null;
  totalValueUsd: number;
  transactionCount: number;
  shipmentCount: number;
  importerCount: number;
  exporterCount: number;
  lastTransactionDate: string | null;
  /** Bu ulkenin filtrelenmis toplam icindeki payi (%) */
  marketSharePct: number;
}

export async function getCountryBreakdown(
  organizationId: number,
  filters: TradeFilters
): Promise<CountryBreakdownRow[]> {
  const rows = await db
    .select({
      country: tradeRecords.importerCountry,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<string>`COUNT(*)`,
      shipmentCount: sql<string>`COALESCE(SUM(${tradeRecords.shipments}), 0)`,
      importerCount: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})`,
      exporterCount: sql<string>`COUNT(DISTINCT ${tradeRecords.exporterNameRaw})`,
      lastTransactionDate: sql<string | null>`MAX(${tradeRecords.transactionDate})`,
    })
    .from(tradeRecords)
    .where(tradeWhere(organizationId, filters))
    .groupBy(tradeRecords.importerCountry)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`));

  const grandTotal = rows.reduce((acc, r) => acc + (Number(r.totalValueUsd) || 0), 0);

  return rows.map((r) => {
    const v = Number(r.totalValueUsd) || 0;
    return {
      country: r.country,
      totalValueUsd: v,
      transactionCount: Number(r.transactionCount) || 0,
      shipmentCount: Number(r.shipmentCount) || 0,
      importerCount: Number(r.importerCount) || 0,
      exporterCount: Number(r.exporterCount) || 0,
      lastTransactionDate: r.lastTransactionDate ?? null,
      marketSharePct: grandTotal > 0 ? (v / grandTotal) * 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// HS Code kirilimi (HS2 / HS4 / HS6 / tam kod)
// ---------------------------------------------------------------------------

export type HsLevel = "hs2" | "hs4" | "hs6" | "full";

const HS_COLUMN = {
  hs2: tradeRecords.hsCode2,
  hs4: tradeRecords.hsCode4,
  hs6: tradeRecords.hsCode6,
  full: tradeRecords.hsCode,
} as const;

export interface HsBreakdownRow {
  code: string | null;
  totalValueUsd: number;
  transactionCount: number;
  importerCount: number;
  exporterCount: number;
  countryCount: number;
}

export async function getHsBreakdown(
  organizationId: number,
  filters: TradeFilters,
  level: HsLevel = "hs6",
  limit = 50
): Promise<HsBreakdownRow[]> {
  const col = HS_COLUMN[level];
  const rows = await db
    .select({
      code: col,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<string>`COUNT(*)`,
      importerCount: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})`,
      exporterCount: sql<string>`COUNT(DISTINCT ${tradeRecords.exporterNameRaw})`,
      countryCount: sql<string>`COUNT(DISTINCT ${tradeRecords.importerCountry})`,
    })
    .from(tradeRecords)
    .where(tradeWhere(organizationId, filters))
    .groupBy(col)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(limit);

  return rows.map((r) => ({
    code: r.code,
    totalValueUsd: Number(r.totalValueUsd) || 0,
    transactionCount: Number(r.transactionCount) || 0,
    importerCount: Number(r.importerCount) || 0,
    exporterCount: Number(r.exporterCount) || 0,
    countryCount: Number(r.countryCount) || 0,
  }));
}

// ---------------------------------------------------------------------------
// Zaman serisi (yillik / aylik trend)
// ---------------------------------------------------------------------------

export interface TrendPoint {
  period: string; // "2025" veya "2025-03"
  totalValueUsd: number;
  transactionCount: number;
}

export async function getTradeTrend(
  organizationId: number,
  filters: TradeFilters,
  granularity: "year" | "month" = "month"
): Promise<TrendPoint[]> {
  // Format string bind parametresi olarak gonderilirse Postgres GROUP BY ifadesini
  // SELECT ifadesiyle eslestiremiyor; sabit ve kullanicidan gelmedigi icin
  // sql.raw ile gomuluyor (SQL injection riski yok - deger literal olarak burada).
  const fmt = sql.raw(granularity === "year" ? "'YYYY'" : "'YYYY-MM'");
  const period = sql<string>`to_char(${tradeRecords.transactionDate}, ${fmt})`;

  const rows = await db
    .select({
      period,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<string>`COUNT(*)`,
    })
    .from(tradeRecords)
    .where(and(tradeWhere(organizationId, filters), sql`${tradeRecords.transactionDate} IS NOT NULL`))
    .groupBy(period)
    .orderBy(asc(period));

  return rows.map((r) => ({
    period: r.period,
    totalValueUsd: Number(r.totalValueUsd) || 0,
    transactionCount: Number(r.transactionCount) || 0,
  }));
}

// ---------------------------------------------------------------------------
// En buyuk ithalatci firmalar / tedarikciler
// ---------------------------------------------------------------------------

export interface TopImporterRow {
  companyId: number | null;
  name: string | null;
  country: string | null;
  totalValueUsd: number;
  transactionCount: number;
  leadScore: number | null;
  leadScoreLabel: string | null;
}

export async function getTopImporters(
  organizationId: number,
  filters: TradeFilters,
  limit = 20
): Promise<TopImporterRow[]> {
  const rows = await db
    .select({
      companyId: tradeRecords.companyId,
      name: companies.name,
      country: companies.country,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<string>`COUNT(*)`,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
    })
    .from(tradeRecords)
    .leftJoin(companies, eq(companies.id, tradeRecords.companyId))
    .leftJoin(
      companyProjects,
      and(
        eq(companyProjects.companyId, tradeRecords.companyId),
        eq(companyProjects.projectId, tradeRecords.projectId)
      )
    )
    .where(tradeWhere(organizationId, filters))
    .groupBy(
      tradeRecords.companyId,
      companies.name,
      companies.country,
      companyProjects.leadScore,
      companyProjects.leadScoreLabel
    )
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(limit);

  return rows.map((r) => ({
    companyId: r.companyId,
    name: r.name,
    country: r.country,
    totalValueUsd: Number(r.totalValueUsd) || 0,
    transactionCount: Number(r.transactionCount) || 0,
    leadScore: r.leadScore,
    leadScoreLabel: r.leadScoreLabel,
  }));
}

export interface TopExporterRow {
  name: string | null;
  country: string | null;
  totalValueUsd: number;
  transactionCount: number;
  customerCount: number;
}

export async function getTopExporters(
  organizationId: number,
  filters: TradeFilters,
  limit = 20
): Promise<TopExporterRow[]> {
  const rows = await db
    .select({
      name: tradeRecords.exporterNameRaw,
      country: sql<string | null>`MIN(${tradeRecords.exporterCountry})`,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<string>`COUNT(*)`,
      customerCount: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})`,
    })
    .from(tradeRecords)
    .where(tradeWhere(organizationId, filters))
    .groupBy(tradeRecords.exporterNameRaw)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(limit);

  return rows.map((r) => ({
    name: r.name,
    country: r.country,
    totalValueUsd: Number(r.totalValueUsd) || 0,
    transactionCount: Number(r.transactionCount) || 0,
    customerCount: Number(r.customerCount) || 0,
  }));
}

// ---------------------------------------------------------------------------
// Islem listesi - SUNUCU TARAFI SAYFALAMA
// ---------------------------------------------------------------------------

export interface TransactionRow {
  id: number;
  transactionDate: string | null;
  companyId: number | null;
  importerName: string;
  importerCountry: string | null;
  exporterName: string | null;
  exporterCountry: string | null;
  hsCode: string;
  productDescription: string | null;
  quantity: string | null;
  unit: string | null;
  weightMt: string | null;
  valueUsd: string;
  shipments: number | null;
  sourceFile: string | null;
  importBatchId: number | null;
}

export interface PagedResult<T> {
  rows: T[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export const TRANSACTION_SORTS = {
  date_desc: { column: tradeRecords.transactionDate, dir: "desc" },
  date_asc: { column: tradeRecords.transactionDate, dir: "asc" },
  value_desc: { column: tradeRecords.valueUsd, dir: "desc" },
  value_asc: { column: tradeRecords.valueUsd, dir: "asc" },
} as const;

export type TransactionSort = keyof typeof TRANSACTION_SORTS;

export async function getTransactionsPage(
  organizationId: number,
  filters: TradeFilters,
  opts: { page?: number; pageSize?: number; sort?: TransactionSort } = {}
): Promise<PagedResult<TransactionRow>> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const sortKey: TransactionSort =
    opts.sort && opts.sort in TRANSACTION_SORTS ? opts.sort : "date_desc";
  const sort = TRANSACTION_SORTS[sortKey];

  const where = tradeWhere(organizationId, filters);

  // Toplam satir sayisi ayri sorguda - butun kayitlari cekmeden sayfa sayisi hesaplanir.
  const [countRow] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(tradeRecords)
    .where(where);
  const totalRows = Number(countRow?.n ?? 0);

  const rows = await db
    .select({
      id: tradeRecords.id,
      transactionDate: tradeRecords.transactionDate,
      companyId: tradeRecords.companyId,
      importerName: tradeRecords.importerNameRaw,
      importerCountry: tradeRecords.importerCountry,
      exporterName: tradeRecords.exporterNameRaw,
      exporterCountry: tradeRecords.exporterCountry,
      hsCode: tradeRecords.hsCode,
      productDescription: tradeRecords.productDescription,
      quantity: tradeRecords.quantity,
      unit: tradeRecords.unit,
      weightMt: tradeRecords.weightMt,
      valueUsd: tradeRecords.valueUsd,
      shipments: tradeRecords.shipments,
      sourceFile: tradeRecords.sourceFile,
      importBatchId: tradeRecords.importBatchId,
    })
    .from(tradeRecords)
    .where(where)
    .orderBy(sort.dir === "desc" ? desc(sort.column) : asc(sort.column))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    rows,
    page,
    pageSize,
    totalRows,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
  };
}

// ---------------------------------------------------------------------------
// Filtre secenekleri (dropdown'lari doldurmak icin - hepsi filtre-farkinda)
// ---------------------------------------------------------------------------

export async function getFilterOptions(organizationId: number, filters: TradeFilters) {
  // Secenek listeleri, PROJE filtresine gore daralir; digger filtreler uygulanmaz
  // (aksi halde bir filtre secilince digerlerinin secenekleri kaybolurdu).
  const scoped: TradeFilters = { projectId: filters.projectId };
  const where = tradeWhere(organizationId, scoped);

  const [importerCountries, exporterCountries, hs4List] = await Promise.all([
    db
      .select({ value: tradeRecords.importerCountry })
      .from(tradeRecords)
      .where(where)
      .groupBy(tradeRecords.importerCountry)
      .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
      .limit(300),
    db
      .select({ value: tradeRecords.exporterCountry })
      .from(tradeRecords)
      .where(where)
      .groupBy(tradeRecords.exporterCountry)
      .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
      .limit(300),
    db
      .select({ value: tradeRecords.hsCode4 })
      .from(tradeRecords)
      .where(where)
      .groupBy(tradeRecords.hsCode4)
      .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
      .limit(300),
  ]);

  return {
    importerCountries: importerCountries.map((r) => r.value).filter((v): v is string => !!v),
    exporterCountries: exporterCountries.map((r) => r.value).filter((v): v is string => !!v),
    hs4Codes: hs4List.map((r) => r.value).filter((v): v is string => !!v),
  };
}

// ---------------------------------------------------------------------------
// Tek bir ulkenin detayi (Country Detail)
// ---------------------------------------------------------------------------

export async function getCountryDetail(
  organizationId: number,
  country: string,
  filters: TradeFilters
) {
  const scoped: TradeFilters = { ...filters, importerCountry: country };

  const [kpis, topImporters, topExporters, hsBreakdown, trend, supplierCountries] =
    await Promise.all([
      getTradeKpis(organizationId, scoped),
      getTopImporters(organizationId, scoped, 20),
      getTopExporters(organizationId, scoped, 20),
      getHsBreakdown(organizationId, scoped, "hs6", 20),
      getTradeTrend(organizationId, scoped, "month"),
      db
        .select({
          country: tradeRecords.exporterCountry,
          totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
        })
        .from(tradeRecords)
        .where(tradeWhere(organizationId, scoped))
        .groupBy(tradeRecords.exporterCountry)
        .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
        .limit(20),
    ]);

  // Bu ulkenin, filtrelenmis TOPLAM icindeki payi
  const overall = await getTradeKpis(organizationId, filters);
  const marketSharePct =
    overall.totalValueUsd > 0 ? (kpis.totalValueUsd / overall.totalValueUsd) * 100 : 0;

  return {
    kpis,
    marketSharePct,
    topImporters,
    topExporters,
    hsBreakdown,
    trend,
    supplierCountries: supplierCountries.map((r) => ({
      country: r.country,
      totalValueUsd: Number(r.totalValueUsd) || 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Rakip (tedarikci) siralamasi - pencere fonksiyonu ile pazar payi + sira
// ---------------------------------------------------------------------------

export interface CompetitorRankRow {
  exporterName: string;
  totalValueUsd: number;
  marketSharePct: number;
  rank: number;
  competitorCount: number;
  customerCount: number;
}

/**
 * Filtrelenmis veri kumesinde tedarikcileri hacme gore siralar ve her birinin
 * pazar payini hesaplar. Tek sorguda pencere fonksiyonlari kullanilir.
 */
export async function getCompetitorRanking(
  organizationId: number,
  filters: TradeFilters,
  limit = 25
): Promise<CompetitorRankRow[]> {
  const conds = tradeConditionsSql(organizationId, filters, "tr");

  const result = await db.execute(sql`
    WITH base AS (
      SELECT
        tr."exporter_name_raw" AS exporter_name,
        SUM(tr."value_usd")     AS val,
        COUNT(DISTINCT tr."company_id") AS customers
      FROM "trade_records" tr
      WHERE ${conds} AND tr."exporter_name_raw" IS NOT NULL
      GROUP BY tr."exporter_name_raw"
    ),
    ranked AS (
      SELECT
        exporter_name,
        val,
        customers,
        RANK()  OVER (ORDER BY val DESC) AS rnk,
        SUM(val) OVER ()                 AS grand_total,
        COUNT(*) OVER ()                 AS competitor_count
      FROM base
    )
    SELECT
      exporter_name     AS "exporterName",
      val               AS "totalValueUsd",
      customers         AS "customerCount",
      rnk               AS "rank",
      grand_total       AS "grandTotal",
      competitor_count  AS "competitorCount"
    FROM ranked
    ORDER BY val DESC
    LIMIT ${limit}
  `);

  return (
    result.rows as {
      exporterName: string;
      totalValueUsd: string;
      customerCount: string;
      rank: string;
      grandTotal: string;
      competitorCount: string;
    }[]
  ).map((r) => {
    const v = Number(r.totalValueUsd) || 0;
    const total = Number(r.grandTotal) || 0;
    return {
      exporterName: r.exporterName,
      totalValueUsd: v,
      marketSharePct: total > 0 ? (v / total) * 100 : 0,
      rank: Number(r.rank) || 0,
      competitorCount: Number(r.competitorCount) || 0,
      customerCount: Number(r.customerCount) || 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Phase 2: urun (GTIP) detayi
// ---------------------------------------------------------------------------

/**
 * Bir GTIP icin "temsilci" urun aciklamasi secer.
 * Ham veride iki tur bozuk deger var: (1) anlamsiz kisa degerler (".", "-") ve
 * (2) tek hucreye virgulle art arda eklenmis onlarca urun. Bu yuzden once az
 * virgul iceren (tek urune yakin), onlar arasinda da daha bilgilendirici
 * (daha uzun) olan deger tercih edilir.
 */
export async function getRepresentativeDescription(
  organizationId: number,
  filters: TradeFilters
): Promise<string | null> {
  const [row] = await db
    .select({ d: tradeRecords.productDescription })
    .from(tradeRecords)
    .where(
      and(
        tradeWhere(organizationId, filters),
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
  return row?.d ?? null;
}

export async function getProductDetail(
  organizationId: number,
  hsCode: string,
  filters: TradeFilters
) {
  const scoped: TradeFilters = { ...filters, hsCode };

  const [kpis, description, byCountry, topImporters, topExporters, trend] = await Promise.all([
    getTradeKpis(organizationId, scoped),
    getRepresentativeDescription(organizationId, scoped),
    getCountryBreakdown(organizationId, scoped),
    getTopImporters(organizationId, scoped, 20),
    getTopExporters(organizationId, scoped, 20),
    getTradeTrend(organizationId, scoped, "month"),
  ]);

  const overall = await getTradeKpis(organizationId, filters);
  const shareOfTotalPct =
    overall.totalValueUsd > 0 ? (kpis.totalValueUsd / overall.totalValueUsd) * 100 : 0;

  return { kpis, description, shareOfTotalPct, byCountry, topImporters, topExporters, trend };
}

// ---------------------------------------------------------------------------
// Phase 2: tedarikci (ihracatci) detayi - filtre farkindali
// ---------------------------------------------------------------------------

export interface SupplierCountryPerformance {
  country: string;
  myValueUsd: number;
  countryTotalUsd: number;
  sharePct: number;
  rank: number;
  competitorCount: number;
}

export interface OpportunityLead {
  companyId: number;
  name: string;
  country: string | null;
  leadScore: number | null;
  leadScoreLabel: string | null;
  totalValueUsd: number;
}

export async function getSupplierDetail(
  organizationId: number,
  exporterName: string,
  filters: TradeFilters
) {
  const scoped: TradeFilters = { ...filters, exporter: undefined };
  const mine: TradeFilters = { ...scoped };

  // Kesin eslesme gerekiyor (filters.exporter ILIKE ile calisir, burada ismin
  // tamami eslesmeli), bu yuzden kosul ayrica ekleniyor.
  const mineWhere = and(tradeWhere(organizationId, mine), eq(tradeRecords.exporterNameRaw, exporterName))!;

  const [kpiRow] = await db
    .select({
      totalValueUsd: sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}), 0)`,
      transactionCount: sql<string>`COUNT(*)`,
      customerCount: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})`,
      countryCount: sql<string>`COUNT(DISTINCT ${tradeRecords.importerCountry})`,
      productCount: sql<string>`COUNT(DISTINCT ${tradeRecords.hsCode})`,
      lastTransactionDate: sql<string | null>`MAX(${tradeRecords.transactionDate})`,
    })
    .from(tradeRecords)
    .where(mineWhere);

  const kpis = {
    totalValueUsd: Number(kpiRow?.totalValueUsd ?? 0),
    transactionCount: Number(kpiRow?.transactionCount ?? 0),
    customerCount: Number(kpiRow?.customerCount ?? 0),
    countryCount: Number(kpiRow?.countryCount ?? 0),
    productCount: Number(kpiRow?.productCount ?? 0),
    lastTransactionDate: kpiRow?.lastTransactionDate ?? null,
  };

  // --- Ulke bazinda pazar payi + siralama (tek sorguda pencere fonksiyonlari) ---
  const conds = tradeConditionsSql(organizationId, scoped, "tr");
  const perf = await db.execute(sql`
    WITH country_exporter AS (
      SELECT tr."importer_country" AS country,
             tr."exporter_name_raw" AS exporter_name,
             SUM(tr."value_usd") AS val
      FROM "trade_records" tr
      WHERE ${conds} AND tr."exporter_name_raw" IS NOT NULL
      GROUP BY tr."importer_country", tr."exporter_name_raw"
    ),
    ranked AS (
      SELECT country, exporter_name, val,
             RANK()   OVER (PARTITION BY country ORDER BY val DESC) AS rnk,
             SUM(val) OVER (PARTITION BY country)                   AS country_total,
             COUNT(*) OVER (PARTITION BY country)                   AS competitor_count
      FROM country_exporter
    )
    SELECT country          AS "country",
           val              AS "myValueUsd",
           country_total    AS "countryTotalUsd",
           rnk              AS "rank",
           competitor_count AS "competitorCount"
    FROM ranked
    WHERE exporter_name = ${exporterName}
    ORDER BY val DESC
  `);

  const byCountry: SupplierCountryPerformance[] = (
    perf.rows as Record<string, string>[]
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

  // --- Mevcut musteriler ---
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
    .leftJoin(
      companyProjects,
      and(
        eq(companyProjects.companyId, tradeRecords.companyId),
        eq(companyProjects.projectId, tradeRecords.projectId)
      )
    )
    .where(mineWhere)
    .groupBy(
      tradeRecords.companyId,
      companies.name,
      companies.country,
      companyProjects.leadScore,
      companyProjects.leadScoreLabel
    )
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(20);

  // --- Henuz girilmemis pazarlar ---
  const oppMarkets = await db.execute(sql`
    WITH country_totals AS (
      SELECT tr."importer_country" AS country,
             SUM(tr."value_usd") AS total,
             COUNT(DISTINCT tr."company_id") AS company_count
      FROM "trade_records" tr
      WHERE ${conds}
      GROUP BY tr."importer_country"
    ),
    entered AS (
      SELECT DISTINCT tr."importer_country" AS country
      FROM "trade_records" tr
      WHERE ${conds} AND tr."exporter_name_raw" = ${exporterName}
    )
    SELECT ct.country       AS "country",
           ct.total         AS "totalValueUsd",
           ct.company_count AS "companyCount"
    FROM country_totals ct
    WHERE ct.country IS NOT NULL
      AND ct.country NOT IN (SELECT country FROM entered WHERE country IS NOT NULL)
    ORDER BY ct.total DESC
  `);

  const opportunityMarkets = (oppMarkets.rows as Record<string, string>[]).map((r) => ({
    country: r.country,
    totalValueUsd: Number(r.totalValueUsd) || 0,
    companyCount: Number(r.companyCount) || 0,
  }));

  // --- Satis firsati: ayni GTIP'leri alan ama bu tedarikciden ALMAYAN firmalar ---
  const leads = await db.execute(sql`
    WITH my_hs AS (
      SELECT DISTINCT tr."hs_code" AS hs
      FROM "trade_records" tr
      WHERE ${conds} AND tr."exporter_name_raw" = ${exporterName}
    ),
    my_customers AS (
      SELECT DISTINCT tr."company_id" AS cid
      FROM "trade_records" tr
      WHERE ${conds} AND tr."exporter_name_raw" = ${exporterName} AND tr."company_id" IS NOT NULL
    )
    SELECT tr."company_id"        AS "companyId",
           c."name"               AS "name",
           c."country"            AS "country",
           cp."lead_score"        AS "leadScore",
           cp."lead_score_label"  AS "leadScoreLabel",
           SUM(tr."value_usd")    AS "totalValueUsd"
    FROM "trade_records" tr
    JOIN "companies" c ON c."id" = tr."company_id"
    LEFT JOIN "company_projects" cp
           ON cp."company_id" = tr."company_id" AND cp."project_id" = tr."project_id"
    WHERE ${conds}
      AND tr."hs_code" IN (SELECT hs FROM my_hs)
      AND tr."company_id" NOT IN (SELECT cid FROM my_customers)
    GROUP BY tr."company_id", c."name", c."country", cp."lead_score", cp."lead_score_label"
    ORDER BY cp."lead_score" DESC NULLS LAST, SUM(tr."value_usd") DESC
    LIMIT 25
  `);

  const opportunityLeads: OpportunityLead[] = (leads.rows as Record<string, string>[]).map((r) => ({
    companyId: Number(r.companyId),
    name: r.name,
    country: r.country ?? null,
    leadScore: r.leadScore === null || r.leadScore === undefined ? null : Number(r.leadScore),
    leadScoreLabel: r.leadScoreLabel ?? null,
    totalValueUsd: Number(r.totalValueUsd) || 0,
  }));

  return {
    kpis,
    byCountry,
    topCustomers: topCustomers.map((c) => ({
      ...c,
      totalValueUsd: Number(c.totalValueUsd) || 0,
    })),
    opportunityMarkets,
    opportunityLeads,
  };
}

/** Tedarikci secici listesi - filtre farkindali. */
export async function getSupplierList(
  organizationId: number,
  filters: TradeFilters,
  limit = 500
) {
  const rows = await db
    .select({
      name: tradeRecords.exporterNameRaw,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      countryCount: sql<string>`COUNT(DISTINCT ${tradeRecords.importerCountry})`,
      customerCount: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})`,
    })
    .from(tradeRecords)
    .where(and(tradeWhere(organizationId, filters), sql`${tradeRecords.exporterNameRaw} IS NOT NULL`))
    .groupBy(tradeRecords.exporterNameRaw)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(limit);

  return rows.map((r) => ({
    name: r.name as string,
    totalValueUsd: Number(r.totalValueUsd) || 0,
    countryCount: Number(r.countryCount) || 0,
    customerCount: Number(r.customerCount) || 0,
  }));
}

// ---------------------------------------------------------------------------
// Phase 2: Dashboard V2
// ---------------------------------------------------------------------------

export interface DashboardOverview {
  kpis: TradeKpis;
  highOpportunityCount: number;
  activeLeadCount: number;
  companyCount: number;
  topCountries: CountryBreakdownRow[];
  topHs: HsBreakdownRow[];
  trend: TrendPoint[];
  topOpportunities: {
    companyId: number;
    name: string;
    country: string | null;
    totalValueUsd: number;
    transactionCount: number;
    leadScore: number | null;
    leadScoreLabel: string | null;
    leadStatus: string | null;
  }[];
}

/** CRM'de "kapanmis" sayilan durumlar - aktif lead sayimindan dislanir. */
const CLOSED_LEAD_STATUSES = ["kaybedildi", "uygun_degil", "siparis_alindi"];

export async function getDashboardOverview(
  organizationId: number,
  filters: TradeFilters
): Promise<DashboardOverview> {
  const [kpis, topCountries, topHs, trend] = await Promise.all([
    getTradeKpis(organizationId, filters),
    getCountryBreakdown(organizationId, filters),
    getHsBreakdown(organizationId, filters, "hs6", 8),
    getTradeTrend(organizationId, filters, "month"),
  ]);

  // Firma / lead sayimlari company_projects uzerinden yapilir ve aktif projeye gore daralir.
  const projectCond =
    filters.projectId === undefined ? [] : [eq(companyProjects.projectId, filters.projectId)];

  const [counts] = await db
    .select({
      companyCount: sql<string>`COUNT(*)`,
      highOpportunityCount: sql<string>`COUNT(*) FILTER (WHERE ${companyProjects.leadScoreLabel} = 'Yuksek Potansiyel')`,
      activeLeadCount: sql<string>`COUNT(*) FILTER (WHERE ${companyProjects.leadStatus}::text NOT IN ('kaybedildi','uygun_degil','siparis_alindi'))`,
    })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(and(eq(companies.organizationId, organizationId), ...projectCond));

  // En iyi firsatlar: ticaret hacmi + skor + CRM durumu birlikte
  const topOpportunities = await db
    .select({
      companyId: tradeRecords.companyId,
      name: companies.name,
      country: companies.country,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<string>`COUNT(*)`,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
      leadStatus: companyProjects.leadStatus,
    })
    .from(tradeRecords)
    .innerJoin(companies, eq(companies.id, tradeRecords.companyId))
    .leftJoin(
      companyProjects,
      and(
        eq(companyProjects.companyId, tradeRecords.companyId),
        eq(companyProjects.projectId, tradeRecords.projectId)
      )
    )
    .where(tradeWhere(organizationId, filters))
    .groupBy(
      tradeRecords.companyId,
      companies.name,
      companies.country,
      companyProjects.leadScore,
      companyProjects.leadScoreLabel,
      companyProjects.leadStatus
    )
    .orderBy(desc(companyProjects.leadScore), desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(10);

  return {
    kpis,
    companyCount: Number(counts?.companyCount ?? 0),
    highOpportunityCount: Number(counts?.highOpportunityCount ?? 0),
    activeLeadCount: Number(counts?.activeLeadCount ?? 0),
    topCountries,
    topHs,
    trend,
    topOpportunities: topOpportunities.map((r) => ({
      companyId: r.companyId as number,
      name: r.name,
      country: r.country,
      totalValueUsd: Number(r.totalValueUsd) || 0,
      transactionCount: Number(r.transactionCount) || 0,
      leadScore: r.leadScore,
      leadScoreLabel: r.leadScoreLabel,
      leadStatus: r.leadStatus,
    })),
  };
}

export { CLOSED_LEAD_STATUSES };

// ---------------------------------------------------------------------------
// Phase 3: Company Intelligence
// ---------------------------------------------------------------------------

export interface SupplierRow {
  supplier: string | null;
  country: string | null;
  totalValueUsd: number;
  transactionCount: number;
  shipmentCount: number;
  sharePct: number;
  productCount: number;
  firstShipment: string | null;
  lastShipment: string | null;
}

export interface CompanyIntelligence {
  company: {
    id: number;
    name: string;
    country: string | null;
    city: string | null;
    website: string | null;
    sector: string | null;
    companyType: string | null;
    rawNameVariants: string[] | null;
    possibleDuplicateOfId: number | null;
  };
  crm: {
    companyProjectId: number;
    projectId: number;
    leadScore: number | null;
    leadScoreLabel: string | null;
    leadScoreBreakdown: string | null;
    leadStatus: string;
    salesOwner: string | null;
    nextFollowupDate: string | null;
    lastContactDate: string | null;
    notes: string | null;
  } | null;
  kpis: TradeKpis;
  suppliers: SupplierRow[];
  /** En buyuk tedarikcinin toplam alim icindeki payi (%) */
  supplierConcentrationPct: number;
  /** Herfindahl-Hirschman Index (0-10000): 2500+ = yuksek yogunlasma */
  supplierHhi: number;
  supplierCountries: { country: string | null; totalValueUsd: number }[];
  products: { hsCode: string; description: string | null; totalValueUsd: number; transactionCount: number }[];
  yearlyTrend: TrendPoint[];
  monthlyTrend: TrendPoint[];
  recentTransactions: TransactionRow[];
}

/**
 * Bir firmanin tam istihbarat profili.
 *
 * GUVENLIK: Firma once organizationId ile dogrulanir; sahibi degilse null doner.
 * Tum alt sorgular da organizationId ile scope edilir (savunma derinligi -
 * yalnizca companyId ile filtrelemek yeterli sayilmaz).
 */
export async function getCompanyIntelligence(
  organizationId: number,
  companyId: number,
  filters: TradeFilters
): Promise<CompanyIntelligence | null> {
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      country: companies.country,
      city: companies.city,
      website: companies.website,
      sector: companies.sector,
      companyType: companies.companyType,
      rawNameVariants: companies.rawNameVariants,
      possibleDuplicateOfId: companies.possibleDuplicateOfId,
    })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.organizationId, organizationId)))
    .limit(1);
  if (!company) return null;

  // Bu firmaya ait kayitlar, mevcut filtreler + firma kosulu
  const scoped: TradeFilters = { ...filters };
  const where = and(tradeWhere(organizationId, scoped), eq(tradeRecords.companyId, companyId))!;

  const [kpis, crmRow] = await Promise.all([
    getTradeKpis(organizationId, { ...scoped }).then(async () => {
      // KPI'lari firma kosuluyla yeniden hesapla
      const [row] = await db
        .select({
          totalValueUsd: sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}), 0)`,
          totalShipments: sql<string>`COALESCE(SUM(${tradeRecords.shipments}), 0)`,
          transactionCount: sql<string>`COUNT(*)`,
          importerCount: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})`,
          exporterCount: sql<string>`COUNT(DISTINCT ${tradeRecords.exporterNameRaw})`,
          hsCodeCount: sql<string>`COUNT(DISTINCT ${tradeRecords.hsCode})`,
          countryCount: sql<string>`COUNT(DISTINCT ${tradeRecords.importerCountry})`,
          firstTransactionDate: sql<string | null>`MIN(${tradeRecords.transactionDate})`,
          lastTransactionDate: sql<string | null>`MAX(${tradeRecords.transactionDate})`,
        })
        .from(tradeRecords)
        .where(where);
      const totalValueUsd = Number(row?.totalValueUsd ?? 0);
      const transactionCount = Number(row?.transactionCount ?? 0);
      return {
        totalValueUsd,
        totalShipments: Number(row?.totalShipments ?? 0),
        transactionCount,
        importerCount: Number(row?.importerCount ?? 0),
        exporterCount: Number(row?.exporterCount ?? 0),
        hsCodeCount: Number(row?.hsCodeCount ?? 0),
        countryCount: Number(row?.countryCount ?? 0),
        avgShipmentValueUsd: transactionCount > 0 ? totalValueUsd / transactionCount : 0,
        firstTransactionDate: row?.firstTransactionDate ?? null,
        lastTransactionDate: row?.lastTransactionDate ?? null,
      } satisfies TradeKpis;
    }),
    db
      .select({
        companyProjectId: companyProjects.id,
        projectId: companyProjects.projectId,
        leadScore: companyProjects.leadScore,
        leadScoreLabel: companyProjects.leadScoreLabel,
        leadScoreBreakdown: companyProjects.leadScoreBreakdown,
        leadStatus: companyProjects.leadStatus,
        salesOwner: companyProjects.salesOwner,
        nextFollowupDate: companyProjects.nextFollowupDate,
        lastContactDate: companyProjects.lastContactDate,
        notes: companyProjects.notes,
      })
      .from(companyProjects)
      .where(
        and(
          eq(companyProjects.companyId, companyId),
          ...(filters.projectId === undefined ? [] : [eq(companyProjects.projectId, filters.projectId)])
        )
      )
      .orderBy(desc(companyProjects.leadScore))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  // --- Tedarikci analizi ---
  const supplierRows = await db
    .select({
      supplier: tradeRecords.exporterNameRaw,
      country: sql<string | null>`MIN(${tradeRecords.exporterCountry})`,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<string>`COUNT(*)`,
      shipmentCount: sql<string>`COALESCE(SUM(${tradeRecords.shipments}), 0)`,
      productCount: sql<string>`COUNT(DISTINCT ${tradeRecords.hsCode})`,
      firstShipment: sql<string | null>`MIN(${tradeRecords.transactionDate})`,
      lastShipment: sql<string | null>`MAX(${tradeRecords.transactionDate})`,
    })
    .from(tradeRecords)
    .where(where)
    .groupBy(tradeRecords.exporterNameRaw)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`));

  const supplierTotal = supplierRows.reduce((a, r) => a + (Number(r.totalValueUsd) || 0), 0);
  const suppliers: SupplierRow[] = supplierRows.map((r) => {
    const v = Number(r.totalValueUsd) || 0;
    return {
      supplier: r.supplier,
      country: r.country,
      totalValueUsd: v,
      transactionCount: Number(r.transactionCount) || 0,
      shipmentCount: Number(r.shipmentCount) || 0,
      sharePct: supplierTotal > 0 ? (v / supplierTotal) * 100 : 0,
      productCount: Number(r.productCount) || 0,
      firstShipment: r.firstShipment ?? null,
      lastShipment: r.lastShipment ?? null,
    };
  });

  // Yogunlasma: en buyuk tedarikcinin payi + HHI (paylarin karelerinin toplami)
  const supplierConcentrationPct = suppliers.length > 0 ? suppliers[0].sharePct : 0;
  const supplierHhi = Math.round(suppliers.reduce((a, s) => a + s.sharePct * s.sharePct, 0));

  const [supplierCountriesRaw, productRows, yearlyTrend, monthlyTrend, recent] = await Promise.all([
    db
      .select({
        country: tradeRecords.exporterCountry,
        totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      })
      .from(tradeRecords)
      .where(where)
      .groupBy(tradeRecords.exporterCountry)
      .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`)),
    db
      .select({
        hsCode: tradeRecords.hsCode,
        totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
        transactionCount: sql<string>`COUNT(*)`,
      })
      .from(tradeRecords)
      .where(where)
      .groupBy(tradeRecords.hsCode)
      .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
      .limit(25),
    trendFor(where, "year"),
    trendFor(where, "month"),
    db
      .select({
        id: tradeRecords.id,
        transactionDate: tradeRecords.transactionDate,
        companyId: tradeRecords.companyId,
        importerName: tradeRecords.importerNameRaw,
        importerCountry: tradeRecords.importerCountry,
        exporterName: tradeRecords.exporterNameRaw,
        exporterCountry: tradeRecords.exporterCountry,
        hsCode: tradeRecords.hsCode,
        productDescription: tradeRecords.productDescription,
        quantity: tradeRecords.quantity,
        unit: tradeRecords.unit,
        weightMt: tradeRecords.weightMt,
        valueUsd: tradeRecords.valueUsd,
        shipments: tradeRecords.shipments,
        sourceFile: tradeRecords.sourceFile,
        importBatchId: tradeRecords.importBatchId,
      })
      .from(tradeRecords)
      .where(where)
      .orderBy(desc(tradeRecords.transactionDate))
      .limit(25),
  ]);

  // Her GTIP icin temsilci aciklama
  const products = await Promise.all(
    productRows.map(async (p) => ({
      hsCode: p.hsCode,
      description: await getRepresentativeDescription(organizationId, { ...scoped, hsCode: p.hsCode }),
      totalValueUsd: Number(p.totalValueUsd) || 0,
      transactionCount: Number(p.transactionCount) || 0,
    }))
  );

  return {
    company,
    crm: crmRow
      ? {
          ...crmRow,
          leadStatus: String(crmRow.leadStatus),
        }
      : null,
    kpis,
    suppliers,
    supplierConcentrationPct,
    supplierHhi,
    supplierCountries: supplierCountriesRaw.map((r) => ({
      country: r.country,
      totalValueUsd: Number(r.totalValueUsd) || 0,
    })),
    products,
    yearlyTrend,
    monthlyTrend,
    recentTransactions: recent,
  };
}

/** Verilen WHERE kosulu icin donem bazli trend (firma-ici kullanim). */
async function trendFor(where: SQL, granularity: "year" | "month"): Promise<TrendPoint[]> {
  const fmt = sql.raw(granularity === "year" ? "'YYYY'" : "'YYYY-MM'");
  const period = sql<string>`to_char(${tradeRecords.transactionDate}, ${fmt})`;
  const rows = await db
    .select({
      period,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<string>`COUNT(*)`,
    })
    .from(tradeRecords)
    .where(and(where, sql`${tradeRecords.transactionDate} IS NOT NULL`))
    .groupBy(period)
    .orderBy(asc(period));
  return rows.map((r) => ({
    period: r.period,
    totalValueUsd: Number(r.totalValueUsd) || 0,
    transactionCount: Number(r.transactionCount) || 0,
  }));
}

// ---------------------------------------------------------------------------
// Phase 3: Hedef Pazar Analizi
// ---------------------------------------------------------------------------

export interface TargetMarketRow {
  country: string;
  totalValueUsd: number;
  transactionCount: number;
  importerCount: number;
  supplierCount: number;
  avgShipmentValueUsd: number;
  sourceSharePct: number;
  growthRatio: number | null;
  daysSinceLastTransaction: number | null;
  score: TargetMarketScore;
}

/**
 * Her ulke icin hedef pazar faktorlerini hesaplar ve skorlar.
 *
 * Buyume: veri kumesindeki tarih araligi ikiye bolunur; son yarinin toplami
 * onceki yariyla karsilastirilir. Tek donemlik veri varsa buyume hesaplanamaz
 * ve 0 puan alir (bu durum kullaniciya acikca yazilir).
 */
export async function getTargetMarkets(
  organizationId: number,
  filters: TradeFilters
): Promise<TargetMarketRow[]> {
  const where = tradeWhere(organizationId, filters);

  // Veri kumesinin tarih araligi (buyume icin orta nokta)
  const [span] = await db
    .select({
      minDate: sql<string | null>`MIN(${tradeRecords.transactionDate})`,
      maxDate: sql<string | null>`MAX(${tradeRecords.transactionDate})`,
    })
    .from(tradeRecords)
    .where(where);

  let midpoint: string | null = null;
  if (span?.minDate && span?.maxDate && span.minDate !== span.maxDate) {
    const a = new Date(span.minDate).getTime();
    const b = new Date(span.maxDate).getTime();
    midpoint = new Date(a + (b - a) / 2).toISOString().slice(0, 10);
  }

  const rows = await db
    .select({
      country: tradeRecords.importerCountry,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<string>`COUNT(*)`,
      importerCount: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})`,
      supplierCount: sql<string>`COUNT(DISTINCT ${tradeRecords.exporterNameRaw})`,
      lastTransactionDate: sql<string | null>`MAX(${tradeRecords.transactionDate})`,
      sourceValueUsd: sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}) FILTER (WHERE ${tradeRecords.exporterCountry} ~* 'turk|türk'), 0)`,
      recentValueUsd: midpoint
        ? sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}) FILTER (WHERE ${tradeRecords.transactionDate} >= ${midpoint}), 0)`
        : sql<string>`0`,
      earlierValueUsd: midpoint
        ? sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}) FILTER (WHERE ${tradeRecords.transactionDate} < ${midpoint}), 0)`
        : sql<string>`0`,
    })
    .from(tradeRecords)
    .where(where)
    .groupBy(tradeRecords.importerCountry)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`));

  const parsed = rows
    .filter((r) => !!r.country)
    .map((r) => {
      const total = Number(r.totalValueUsd) || 0;
      const source = Number(r.sourceValueUsd) || 0;
      const recent = Number(r.recentValueUsd) || 0;
      const earlier = Number(r.earlierValueUsd) || 0;
      return {
        country: r.country as string,
        totalValueUsd: total,
        transactionCount: Number(r.transactionCount) || 0,
        importerCount: Number(r.importerCount) || 0,
        supplierCount: Number(r.supplierCount) || 0,
        lastTransactionDate: r.lastTransactionDate ?? null,
        sourceSharePct: total > 0 ? (source / total) * 100 : 0,
        growthRatio: midpoint && earlier > 0 ? (recent - earlier) / earlier : null,
      };
    });

  if (parsed.length === 0) return [];

  // Guncellik: veri setindeki en son tarihi referans al (bugunun tarihi degil -
  // veri gecmise ait olabilir, bu yuzden "veri setine gore guncellik" olculur).
  const datasetMaxMs = Math.max(
    ...parsed.map((p) => (p.lastTransactionDate ? new Date(p.lastTransactionDate).getTime() : 0)),
    0
  );
  const daysSince = parsed.map((p) =>
    p.lastTransactionDate && datasetMaxMs > 0
      ? Math.round((datasetMaxMs - new Date(p.lastTransactionDate).getTime()) / 86_400_000)
      : null
  );

  const maxValue = Math.max(...parsed.map((p) => p.totalValueUsd), 1);
  const maxImporters = Math.max(...parsed.map((p) => p.importerCount), 1);
  const maxTransactions = Math.max(...parsed.map((p) => p.transactionCount), 1);
  const maxSuppliers = Math.max(...parsed.map((p) => p.supplierCount), 1);
  const maxDays = Math.max(...daysSince.map((d) => d ?? 0), 1);

  return parsed
    .map((p, i) => {
      const avg = p.transactionCount > 0 ? p.totalValueUsd / p.transactionCount : 0;
      const score = calculateTargetMarketScore({
        country: p.country,
        totalValueUsd: p.totalValueUsd,
        transactionCount: p.transactionCount,
        importerCount: p.importerCount,
        supplierCount: p.supplierCount,
        avgShipmentValueUsd: avg,
        sourceSharePct: p.sourceSharePct,
        growthRatio: p.growthRatio,
        daysSinceLastTransaction: daysSince[i],
        maxValueUsdInDataset: maxValue,
        maxImporterCountInDataset: maxImporters,
        maxTransactionCountInDataset: maxTransactions,
        maxSupplierCountInDataset: maxSuppliers,
        maxDaysSinceInDataset: maxDays,
      });
      return {
        country: p.country,
        totalValueUsd: p.totalValueUsd,
        transactionCount: p.transactionCount,
        importerCount: p.importerCount,
        supplierCount: p.supplierCount,
        avgShipmentValueUsd: avg,
        sourceSharePct: p.sourceSharePct,
        growthRatio: p.growthRatio,
        daysSinceLastTransaction: daysSince[i],
        score,
      } satisfies TargetMarketRow;
    })
    .sort((a, b) => b.score.total - a.score.total);
}

// ---------------------------------------------------------------------------
// Phase 3: Rakip iliskileri (rakip x ulke / rakip x urun matrisi)
// ---------------------------------------------------------------------------

export interface CompetitorMatrix {
  competitors: string[];
  columns: string[];
  /** cells[rakipIndex][sutunIndex] = deger */
  cells: number[][];
  rowTotals: number[];
  columnTotals: number[];
}

/**
 * Rakip (tedarikci) x boyut matrisi. Hangi rakibin hangi pazarda / uründe
 * guclu oldugunu tek bakista gosterir.
 */
export async function getCompetitorMatrix(
  organizationId: number,
  filters: TradeFilters,
  dimension: "country" | "hs4",
  topCompetitors = 10,
  topColumns = 8
): Promise<CompetitorMatrix> {
  const dimCol = dimension === "country" ? tradeRecords.importerCountry : tradeRecords.hsCode4;

  const [topExp, topDim] = await Promise.all([
    db
      .select({ name: tradeRecords.exporterNameRaw, v: sql<string>`SUM(${tradeRecords.valueUsd})` })
      .from(tradeRecords)
      .where(and(tradeWhere(organizationId, filters), sql`${tradeRecords.exporterNameRaw} IS NOT NULL`))
      .groupBy(tradeRecords.exporterNameRaw)
      .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
      .limit(topCompetitors),
    db
      .select({ name: dimCol, v: sql<string>`SUM(${tradeRecords.valueUsd})` })
      .from(tradeRecords)
      .where(and(tradeWhere(organizationId, filters), sql`${dimCol} IS NOT NULL`))
      .groupBy(dimCol)
      .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
      .limit(topColumns),
  ]);

  const competitors = topExp.map((r) => r.name as string);
  const columns = topDim.map((r) => r.name as string);

  if (competitors.length === 0 || columns.length === 0) {
    return { competitors, columns, cells: [], rowTotals: [], columnTotals: [] };
  }

  const pairs = await db
    .select({
      exporter: tradeRecords.exporterNameRaw,
      dim: dimCol,
      v: sql<string>`SUM(${tradeRecords.valueUsd})`,
    })
    .from(tradeRecords)
    .where(
      and(
        tradeWhere(organizationId, filters),
        inArray(tradeRecords.exporterNameRaw, competitors),
        inArray(dimCol, columns)
      )
    )
    .groupBy(tradeRecords.exporterNameRaw, dimCol);

  const rowIdx = new Map(competitors.map((c, i) => [c, i]));
  const colIdx = new Map(columns.map((c, i) => [c, i]));
  const cells: number[][] = competitors.map(() => columns.map(() => 0));

  for (const p of pairs) {
    const r = rowIdx.get(p.exporter as string);
    const c = colIdx.get(p.dim as string);
    if (r === undefined || c === undefined) continue;
    cells[r][c] = Number(p.v) || 0;
  }

  const rowTotals = cells.map((row) => row.reduce((a, v) => a + v, 0));
  const columnTotals = columns.map((_, ci) => cells.reduce((a, row) => a + row[ci], 0));

  return { competitors, columns, cells, rowTotals, columnTotals };
}
