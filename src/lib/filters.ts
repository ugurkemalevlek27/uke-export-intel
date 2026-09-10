// Global filtre sistemi (Phase 1)
//
// TASARIM: Bu dosya, TUM analiz sorgularinin gectigi TEK kapidir.
//
//  1) Filtreler URL query parametrelerinden okunur (sayfa yenilenince kaybolmaz,
//     analiz linki paylasilabilir).
//  2) buildTradeConditions() her zaman organization_id kosulunu EN BASA koyar.
//     Bu fonksiyon disinda trade_records'a dogrudan WHERE yazilmamalidir; boylece
//     "bir organizasyon digerinin verisini goremez" kurali tek yerde garanti edilir.
//  3) Filtreleme her zaman VERITABANI seviyesinde yapilir - tum dataset cekilip
//     JavaScript icinde filtrelenmez.

import { tradeRecords } from "@/db/schema";
import { and, eq, gte, lte, ilike, sql, type SQL } from "drizzle-orm";

export interface TradeFilters {
  projectId?: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  importerCountry?: string;
  exporterCountry?: string;
  hsCode?: string;
  hs2?: string;
  hs4?: string;
  hs6?: string;
  importer?: string; // firma adinda arama (ILIKE)
  exporter?: string; // tedarikci adinda arama (ILIKE)
  productDescription?: string; // urun aciklamasinda arama (ILIKE)
}

/** URL query parametrelerinde kullanilan anahtarlar. */
export const FILTER_KEYS = [
  "project",
  "dateFrom",
  "dateTo",
  "importerCountry",
  "exporterCountry",
  "hsCode",
  "hs2",
  "hs4",
  "hs6",
  "importer",
  "exporter",
  "product",
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];
export type RawSearchParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = (Array.isArray(v) ? v[0] : v).trim();
  return s === "" ? undefined : s;
}

/** Sadece rakam iceren, belirtilen uzunluktaki HS parcasini kabul eder. */
function hsPart(v: string | string[] | undefined, len: number): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const digits = s.replace(/\D/g, "");
  return digits.length >= len ? digits.slice(0, len) : undefined;
}

/** YYYY-MM-DD formatini dogrular; gecersizse yok sayar (sorguyu patlatmaz). */
function isoDate(v: string | string[] | undefined): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : s;
}

/**
 * URL query parametrelerini tip guvenli TradeFilters'a cevirir.
 * Gecersiz degerler sessizce yok sayilir - kullanici elle URL degistirse bile
 * sorgu bozulmaz.
 */
export function parseTradeFilters(sp: RawSearchParams): TradeFilters {
  const projectRaw = str(sp.project);
  const projectId = projectRaw && /^\d+$/.test(projectRaw) ? Number(projectRaw) : undefined;

  return {
    projectId,
    dateFrom: isoDate(sp.dateFrom),
    dateTo: isoDate(sp.dateTo),
    importerCountry: str(sp.importerCountry),
    exporterCountry: str(sp.exporterCountry),
    hsCode: str(sp.hsCode),
    hs2: hsPart(sp.hs2, 2),
    hs4: hsPart(sp.hs4, 4),
    hs6: hsPart(sp.hs6, 6),
    importer: str(sp.importer),
    exporter: str(sp.exporter),
    productDescription: str(sp.product),
  };
}

/**
 * trade_records icin WHERE kosullarini uretir.
 *
 * organizationId HER ZAMAN ilk kosuldur ve parametre olarak zorunludur -
 * cagiran tarafin bunu unutmasi mumkun degildir (multi-tenant guvencesi).
 */
export function buildTradeConditions(organizationId: number, f: TradeFilters): SQL[] {
  const conds: SQL[] = [eq(tradeRecords.organizationId, organizationId)];

  if (f.projectId !== undefined) conds.push(eq(tradeRecords.projectId, f.projectId));
  if (f.dateFrom) conds.push(gte(tradeRecords.transactionDate, f.dateFrom));
  if (f.dateTo) conds.push(lte(tradeRecords.transactionDate, f.dateTo));
  if (f.importerCountry) conds.push(eq(tradeRecords.importerCountry, f.importerCountry));
  if (f.exporterCountry) conds.push(eq(tradeRecords.exporterCountry, f.exporterCountry));
  if (f.hsCode) conds.push(eq(tradeRecords.hsCode, f.hsCode));
  if (f.hs2) conds.push(eq(tradeRecords.hsCode2, f.hs2));
  if (f.hs4) conds.push(eq(tradeRecords.hsCode4, f.hs4));
  if (f.hs6) conds.push(eq(tradeRecords.hsCode6, f.hs6));
  if (f.importer) conds.push(ilike(tradeRecords.importerNameRaw, `%${f.importer}%`));
  if (f.exporter) conds.push(ilike(tradeRecords.exporterNameRaw, `%${f.exporter}%`));
  if (f.productDescription)
    conds.push(ilike(tradeRecords.productDescription, `%${f.productDescription}%`));

  return conds;
}

/** buildTradeConditions'i tek bir AND ifadesine indirger. */
export function tradeWhere(organizationId: number, f: TradeFilters) {
  return and(...buildTradeConditions(organizationId, f))!;
}

/**
 * Ayni filtreleri ham SQL (db.execute) icinde kullanabilmek icin SQL parcasi uretir.
 * Pencere fonksiyonu / CTE gerektiren sorgularda kullanilir.
 * Kolon adlari, verilen tablo alias'i ile prefixlenir.
 */
export function tradeConditionsSql(organizationId: number, f: TradeFilters, alias = "tr"): SQL {
  const a = sql.raw(`"${alias}"`);
  const parts: SQL[] = [sql`${a}."organization_id" = ${organizationId}`];

  if (f.projectId !== undefined) parts.push(sql`${a}."project_id" = ${f.projectId}`);
  if (f.dateFrom) parts.push(sql`${a}."transaction_date" >= ${f.dateFrom}`);
  if (f.dateTo) parts.push(sql`${a}."transaction_date" <= ${f.dateTo}`);
  if (f.importerCountry) parts.push(sql`${a}."importer_country" = ${f.importerCountry}`);
  if (f.exporterCountry) parts.push(sql`${a}."exporter_country" = ${f.exporterCountry}`);
  if (f.hsCode) parts.push(sql`${a}."hs_code" = ${f.hsCode}`);
  if (f.hs2) parts.push(sql`${a}."hs_code_2" = ${f.hs2}`);
  if (f.hs4) parts.push(sql`${a}."hs_code_4" = ${f.hs4}`);
  if (f.hs6) parts.push(sql`${a}."hs_code_6" = ${f.hs6}`);
  if (f.importer) parts.push(sql`${a}."importer_name_raw" ILIKE ${"%" + f.importer + "%"}`);
  if (f.exporter) parts.push(sql`${a}."exporter_name_raw" ILIKE ${"%" + f.exporter + "%"}`);
  if (f.productDescription)
    parts.push(sql`${a}."product_description" ILIKE ${"%" + f.productDescription + "%"}`);

  return sql.join(parts, sql` AND `);
}

/** Filtreleri tekrar URL query string'e cevirir (link uretimi icin). */
export function filtersToQuery(f: TradeFilters, extra: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  if (f.projectId !== undefined) p.set("project", String(f.projectId));
  if (f.dateFrom) p.set("dateFrom", f.dateFrom);
  if (f.dateTo) p.set("dateTo", f.dateTo);
  if (f.importerCountry) p.set("importerCountry", f.importerCountry);
  if (f.exporterCountry) p.set("exporterCountry", f.exporterCountry);
  if (f.hsCode) p.set("hsCode", f.hsCode);
  if (f.hs2) p.set("hs2", f.hs2);
  if (f.hs4) p.set("hs4", f.hs4);
  if (f.hs6) p.set("hs6", f.hs6);
  if (f.importer) p.set("importer", f.importer);
  if (f.exporter) p.set("exporter", f.exporter);
  if (f.productDescription) p.set("product", f.productDescription);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Kullaniciya "kac filtre aktif" bilgisini gostermek icin (proje haric). */
export function activeFilterCount(f: TradeFilters): number {
  let n = 0;
  for (const [key, value] of Object.entries(f)) {
    if (key === "projectId") continue;
    if (value !== undefined && value !== "") n++;
  }
  return n;
}
