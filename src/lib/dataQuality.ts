// Veri Kalitesi motoru (Phase 4)
//
// ILKE: Bu modul yalnizca SORUN TESPIT EDER, kendiliginden DUZELTME YAPMAZ.
// Ozellikle firma birlestirme her zaman insan onayina baglidir - iki firmanin
// ayni olup olmadigina makine karar veremez (orn. "RETRO HOLDING MMC" ile
// "RETRO HOLDING MMC AZERBEYCAN" ayni firma olabilir de olmayabilir de).

import { db } from "@/db";
import { companies, tradeRecords } from "@/db/schema";
import { and, eq, sql, isNotNull, desc } from "drizzle-orm";

export interface QualityIssue {
  key: string;
  label: string;
  description: string;
  count: number;
  severity: "high" | "medium" | "low";
  /** Sorunun incelenebilecegi ekran (varsa) */
  href?: string;
}

export interface DuplicateCompanyPair {
  keptId: number;
  keptName: string;
  keptValueUsd: number;
  duplicateId: number;
  duplicateName: string;
  duplicateValueUsd: number;
}

export interface DuplicateTradeGroup {
  rowHash: string;
  count: number;
  importerName: string;
  hsCode: string;
  transactionDate: string | null;
  valueUsd: string;
  sourceFiles: string[];
}

/** Ozet gostergeler - Veri Kalitesi ekraninin ust bolumu. */
export async function getQualityOverview(
  organizationId: number,
  projectId?: number
): Promise<QualityIssue[]> {
  const scope = projectId === undefined
    ? eq(tradeRecords.organizationId, organizationId)
    : and(eq(tradeRecords.organizationId, organizationId), eq(tradeRecords.projectId, projectId))!;

  const [row] = await db
    .select({
      total: sql<string>`COUNT(*)`,
      // GTIP yalnizca rakamlardan olusmali ve en az 6 hane olmali
      invalidHs: sql<string>`COUNT(*) FILTER (WHERE ${tradeRecords.hsCode} !~ '^[0-9]+$' OR length(${tradeRecords.hsCode}) < 6)`,
      missingCountry: sql<string>`COUNT(*) FILTER (WHERE ${tradeRecords.importerCountry} IS NULL OR ${tradeRecords.importerCountry} = 'Unknown')`,
      missingDate: sql<string>`COUNT(*) FILTER (WHERE ${tradeRecords.transactionDate} IS NULL)`,
      missingProduct: sql<string>`COUNT(*) FILTER (WHERE ${tradeRecords.productDescription} IS NULL OR ${tradeRecords.productDescription} = 'Not Available')`,
      missingQuantity: sql<string>`COUNT(*) FILTER (WHERE ${tradeRecords.quantity} IS NULL)`,
      missingExporter: sql<string>`COUNT(*) FILTER (WHERE ${tradeRecords.exporterNameRaw} IS NULL OR ${tradeRecords.exporterNameRaw} = 'Not Available')`,
      zeroValue: sql<string>`COUNT(*) FILTER (WHERE ${tradeRecords.valueUsd}::numeric <= 0)`,
      unlinkedCompany: sql<string>`COUNT(*) FILTER (WHERE ${tradeRecords.companyId} IS NULL)`,
      noHash: sql<string>`COUNT(*) FILTER (WHERE ${tradeRecords.rowHash} IS NULL)`,
    })
    .from(tradeRecords)
    .where(scope);

  const dupTrade = await countDuplicateTradeRows(organizationId, projectId);
  const dupCompanies = await countDuplicateCompanies(organizationId);

  const n = (v: string | undefined) => Number(v ?? 0);

  return [
    {
      key: "duplicate-trade",
      label: "Tekrar eden sevkiyat kaydı",
      description:
        "Birebir aynı içeriğe sahip kayıtlar. Genellikle aynı dosyanın iki kez yüklenmesinden kalır. Bundan sonraki yüklemelerde otomatik engelleniyor.",
      count: dupTrade,
      severity: dupTrade > 0 ? "high" : "low",
    },
    {
      key: "duplicate-company",
      label: "Olası duplicate firma",
      description:
        "Aynı firma olabilecek farklı yazımlar. Otomatik birleştirilmez — her biri elle onaylanmalıdır.",
      count: dupCompanies,
      severity: dupCompanies > 0 ? "medium" : "low",
    },
    {
      key: "invalid-hs",
      label: "Geçersiz GTİP kodu",
      description: "Rakam dışı karakter içeren veya 6 haneden kısa GTİP kodları.",
      count: n(row?.invalidHs),
      severity: n(row?.invalidHs) > 0 ? "medium" : "low",
    },
    {
      key: "missing-country",
      label: "Ülke bilgisi eksik",
      description: 'İthalatçı ülkesi boş ya da "Unknown" olan kayıtlar — ülke analizinde görünmezler.',
      count: n(row?.missingCountry),
      severity: n(row?.missingCountry) > 0 ? "medium" : "low",
    },
    {
      key: "missing-date",
      label: "Tarih eksik",
      description: "İşlem tarihi olmayan kayıtlar — trend grafiklerinde ve güncellik skorunda yer almazlar.",
      count: n(row?.missingDate),
      severity: n(row?.missingDate) > 0 ? "medium" : "low",
    },
    {
      key: "zero-value",
      label: "Sıfır veya negatif değer",
      description: "Değeri 0 veya altında olan kayıtlar — hacim hesaplarını bozabilir.",
      count: n(row?.zeroValue),
      severity: n(row?.zeroValue) > 0 ? "high" : "low",
    },
    {
      key: "missing-exporter",
      label: "Tedarikçi bilgisi eksik",
      description: "Tedarikçi adı olmayan kayıtlar — tedarikçi ve rakip analizinde yer almazlar.",
      count: n(row?.missingExporter),
      severity: n(row?.missingExporter) > 0 ? "medium" : "low",
    },
    {
      key: "missing-product",
      label: "Ürün açıklaması eksik",
      description: 'Açıklaması boş ya da "Not Available" olan kayıtlar.',
      count: n(row?.missingProduct),
      severity: "low",
    },
    {
      key: "missing-quantity",
      label: "Miktar eksik",
      description: "Miktar bilgisi olmayan kayıtlar — birim fiyat hesabı yapılamaz.",
      count: n(row?.missingQuantity),
      severity: "low",
    },
    {
      key: "unlinked",
      label: "Firmaya bağlanamamış kayıt",
      description: "İthalatçı firma kaydıyla eşleşmemiş sevkiyatlar.",
      count: n(row?.unlinkedCompany),
      severity: n(row?.unlinkedCompany) > 0 ? "high" : "low",
    },
    {
      key: "no-hash",
      label: "Duplicate koruması olmayan kayıt",
      description:
        "İçerik hash'i hesaplanmamış eski kayıtlar. scripts/backfill-row-hash.ts çalıştırılarak doldurulur.",
      count: n(row?.noHash),
      severity: n(row?.noHash) > 0 ? "medium" : "low",
    },
  ];
}

async function countDuplicateTradeRows(organizationId: number, projectId?: number): Promise<number> {
  const res = await db.execute(sql`
    SELECT COALESCE(SUM(c - 1), 0) AS "extra"
    FROM (
      SELECT COUNT(*) AS c
      FROM trade_records
      WHERE organization_id = ${organizationId}
        AND (${projectId === undefined} OR project_id = ${projectId ?? null})
        AND row_hash IS NOT NULL
      GROUP BY row_hash
      HAVING COUNT(*) > 1
    ) t
  `);
  return Number((res.rows as { extra: string }[])[0]?.extra ?? 0);
}

async function countDuplicateCompanies(organizationId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(companies)
    .where(
      and(
        eq(companies.organizationId, organizationId),
        isNotNull(companies.possibleDuplicateOfId),
        sql`${companies.mergedIntoId} IS NULL`
      )
    );
  return Number(r?.n ?? 0);
}

/** Olasi duplicate firma ciftleri - her biri icin hacim bilgisiyle birlikte. */
export async function getDuplicateCompanyPairs(
  organizationId: number,
  limit = 100
): Promise<DuplicateCompanyPair[]> {
  const res = await db.execute(sql`
    SELECT
      kept."id"        AS "keptId",
      kept."name"      AS "keptName",
      COALESCE(kv.v, 0) AS "keptValueUsd",
      dup."id"         AS "duplicateId",
      dup."name"       AS "duplicateName",
      COALESCE(dv.v, 0) AS "duplicateValueUsd"
    FROM "companies" dup
    JOIN "companies" kept ON kept."id" = dup."possible_duplicate_of_id"
    LEFT JOIN (
      SELECT company_id, SUM(value_usd) AS v FROM trade_records
      WHERE organization_id = ${organizationId} GROUP BY company_id
    ) kv ON kv.company_id = kept."id"
    LEFT JOIN (
      SELECT company_id, SUM(value_usd) AS v FROM trade_records
      WHERE organization_id = ${organizationId} GROUP BY company_id
    ) dv ON dv.company_id = dup."id"
    WHERE dup."organization_id" = ${organizationId}
      AND kept."organization_id" = ${organizationId}
      AND dup."merged_into_id" IS NULL
      AND kept."merged_into_id" IS NULL
    ORDER BY COALESCE(dv.v, 0) DESC
    LIMIT ${limit}
  `);

  return (res.rows as Record<string, string>[]).map((r) => ({
    keptId: Number(r.keptId),
    keptName: r.keptName,
    keptValueUsd: Number(r.keptValueUsd) || 0,
    duplicateId: Number(r.duplicateId),
    duplicateName: r.duplicateName,
    duplicateValueUsd: Number(r.duplicateValueUsd) || 0,
  }));
}

/** Tekrar eden sevkiyat gruplari (ornekleriyle). */
export async function getDuplicateTradeGroups(
  organizationId: number,
  projectId: number | undefined,
  limit = 50
): Promise<DuplicateTradeGroup[]> {
  const res = await db.execute(sql`
    SELECT
      row_hash                              AS "rowHash",
      COUNT(*)                              AS "count",
      MIN(importer_name_raw)                AS "importerName",
      MIN(hs_code)                          AS "hsCode",
      MIN(transaction_date)::text           AS "transactionDate",
      MIN(value_usd)::text                  AS "valueUsd",
      array_agg(DISTINCT source_file)       AS "sourceFiles"
    FROM trade_records
    WHERE organization_id = ${organizationId}
      AND (${projectId === undefined} OR project_id = ${projectId ?? null})
      AND row_hash IS NOT NULL
    GROUP BY row_hash
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, MIN(value_usd) DESC
    LIMIT ${limit}
  `);

  return (res.rows as Record<string, unknown>[]).map((r) => ({
    rowHash: String(r.rowHash),
    count: Number(r.count),
    importerName: String(r.importerName ?? ""),
    hsCode: String(r.hsCode ?? ""),
    transactionDate: r.transactionDate ? String(r.transactionDate) : null,
    valueUsd: String(r.valueUsd ?? "0"),
    sourceFiles: Array.isArray(r.sourceFiles) ? (r.sourceFiles as string[]).filter(Boolean) : [],
  }));
}

/** Ayni firmanin veri kaynagindaki farkli yazimlari. */
export async function getCompanyNameVariations(organizationId: number, limit = 50) {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      variants: companies.rawNameVariants,
    })
    .from(companies)
    .where(and(eq(companies.organizationId, organizationId), sql`array_length(${companies.rawNameVariants}, 1) > 1`))
    .orderBy(desc(sql`array_length(${companies.rawNameVariants}, 1)`))
    .limit(limit);
  return rows;
}
