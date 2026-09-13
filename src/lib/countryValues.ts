// Ulke degerlerinin TEK dogruluk kaynagi (Veri Kalitesi)
//
// SORUN: "ulke bilinmiyor" bilgisi veride BIRDEN FAZLA sekilde temsil ediliyordu:
//   - NULL / bos metin              (kaynakta sutun hic yok)
//   - "Unknown"                     (bu sistemin kendi yer tutucusu, bkz. cleanCountry)
//   - "Countries（Territories）Unknown (ZZZ)"  (ticaret verisi saglayicisinin yer tutucusu)
//
// Bunlarin hepsi AYNI seyi soyler ama farkli metinler olduklari icin analizlerde
// AYRI BIRER ULKE gibi davraniyorlardi: "ULKE" KPI'si onlari sayiyor, ulke
// kirilimi onlari gercek pazarlarla yan yana siraliyordu.
//
// ILKE: Burasi eksik veriyi TAHMIN ETMEZ. Yalnizca "bilinmiyor"un es anlamli
// yazimlarini TEK bir yer tutucuda birlestirir ve bunu gercek ulkelerden ayirt
// edilebilir kilar. Hicbir kayit gizlenmez veya silinmez.

import { sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";

/** Ulkesi bilinmeyen kayitlar icin kullanilan TEK yer tutucu. */
export const UNKNOWN_COUNTRY = "Unknown";

/** Kullaniciya gosterilecek etiket (yer tutucu metni ekranda ham haliyle cikmasin). */
export const UNKNOWN_COUNTRY_LABEL = "Bilinmeyen ülke";

/**
 * Deger gercek bir ulkeyi mi gosteriyor, yoksa "bilinmiyor" yer tutucusu mu?
 *
 * "unknown" gecen bir metin gercek bir ulke adi olamaz; ayni sekilde ISO'nun
 * "bilinmeyen ulke" kodu olan ZZZ de bir pazar degildir.
 */
export function isUnknownCountry(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const v = value.trim();
  if (v === "") return true;
  const lower = v.toLowerCase();
  return lower.includes("unknown") || /\(zzz\)$/.test(lower) || lower === "zzz";
}

/**
 * Her "bilinmiyor" yazimini TEK yer tutucuya indirger; gercek ulke adlarina
 * dokunmaz (yalnizca bastaki/sondaki bosluklari kirpar).
 */
export function canonicalizeCountry(value: string | null | undefined): string {
  return isUnknownCountry(value) ? UNKNOWN_COUNTRY : String(value).trim();
}

/**
 * SQL tarafinda ayni kural: sutun "bilinmiyor" yer tutucularindan biri mi?
 *
 * TS tarafindaki isUnknownCountry ile AYNI mantigi ifade eder; ikisi birlikte
 * degistirilmelidir (bkz. tests/countryValues.test.ts).
 */
export function isUnknownCountrySql(column: AnyColumn): SQL {
  return sql`(${column} IS NULL OR btrim(${column}) = '' OR ${column} ILIKE '%unknown%' OR ${column} ILIKE '%(zzz)')`;
}

/** Yalnizca GERCEK ulkeleri sayar - "ULKE" KPI'si bunu kullanmalidir. */
export function knownCountryCountSql(column: AnyColumn): SQL<string> {
  return sql<string>`COUNT(DISTINCT ${column}) FILTER (WHERE NOT ${isUnknownCountrySql(column)})`;
}
