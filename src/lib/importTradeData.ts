// Ticaret verisi import pipeline'i (CLAUDE.md madde 18, 20, 54, 55)
//
// Bu dosya, kullanicidan gelen Excel/CSV satirlarini temizler, dogrular ve
// veritabanina yazar. Onemli kurallar:
// - Eksik veri asla uydurulmaz; "Not Available" ile isaretlenir (madde 20).
// - Sutun sirasi dosyadan dosyaya degisebilir; baslik ADINA gore eslestirilir
//   (madde 18, 54) - gercek ornek dosyalarimizda gozlemlendi.
// - Sayisal alanlarda binlik ayiraciyla (ornek: "1,373") gelen METIN degerler
//   sayiya cevrilir (gercek veri setinde tespit edildi).
// - Her import islemi import_batches tablosuna kaydedilir (madde 55).

import { db } from "@/db";
import { companies, importBatches, tradeRecords } from "@/db/schema";
import { companyMatchKey, normalizeDisplayName } from "./normalize";
import { findPossibleDuplicates } from "./duplicates";
import { recalculateProjectScores } from "./recalculateScores";
import { eq, and, isNull } from "drizzle-orm";

// Taninan sutun basliklari (kucuk harfe cevrilip bosluklar temizlenerek karsilastirilir)
const HEADER_ALIASES: Record<string, string[]> = {
  hsCode: ["hs_code", "hscode", "gtip"],
  exporter: ["exporter", "ihracatci"],
  exporterCountry: ["country_of_exporters", "exportercountry", "mensei_ulke"],
  importer: ["importer", "ithalatci"],
  importerCountry: ["country_of_importers", "importercountry", "ulke"],
  date: ["date", "tarih"],
  productDescription: ["actual_detailed_product", "productdescription", "urun_aciklamasi"],
  unit: ["unit_qty", "unit", "birim"],
  valueUsd: ["value(usd)", "value_usd", "valueusd", "deger_usd"],
  quantity: ["quantity", "miktar"],
  weightMt: ["mt", "weight_mt"],
  shipments: ["shipments", "sevkiyat"],
};

function keyFor(header: string): string | null {
  const h = header.toLowerCase().trim().replace(/\s+/g, "_");
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

/** "1,373" -> 1373 ; 1373 -> 1373 ; bos/gecersiz -> null */
function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Kaynak sitelerden sizan fazladan metni temizler: "Azerbaijan (AZ)\n \nTrack Now" -> "Azerbaijan (AZ)" */
function cleanCountry(value: unknown): string {
  if (!value) return "Unknown";
  const first = String(value).split("\n")[0].trim();
  return first || "Unknown";
}

function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export interface ImportRowError {
  rowNumber: number;
  reason: string;
}

export interface ImportResult {
  batchId: number;
  rowCount: number;
  successCount: number;
  errorCount: number;
  duplicateCandidateCount: number;
  errors: ImportRowError[];
}

export async function importTradeDataRows(params: {
  organizationId: number;
  projectId: number;
  sourceFile: string;
  uploadedBy?: string;
  rows: Record<string, unknown>[];
}): Promise<ImportResult> {
  const { organizationId, projectId, sourceFile, uploadedBy, rows } = params;

  const [batch] = await db
    .insert(importBatches)
    .values({
      organizationId,
      projectId,
      fileName: sourceFile,
      uploadedBy: uploadedBy ?? "system",
      rowCount: rows.length,
      status: "processing",
    })
    .returning();

  const errors: ImportRowError[] = [];
  let successCount = 0;

  // Bu import turunda gorulen firmalarin matchKey -> companyId eslesmesi (tekrar DB sorgusu yapmamak icin)
  const companyCache = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i];
    const rowNumber = i + 2; // Excel'de 1. satir baslik oldugu icin +2

    // Sutunlari esnek sekilde esle (baslik adina gore)
    const mapped: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(rawRow)) {
      const field = keyFor(header);
      if (field) mapped[field] = value;
    }

    const hsCode = mapped.hsCode ? String(mapped.hsCode).trim() : "";
    const importerRaw = mapped.importer ? String(mapped.importer).trim() : "";
    const valueUsd = parseNumeric(mapped.valueUsd);

    if (!hsCode || !importerRaw || valueUsd === null) {
      errors.push({
        rowNumber,
        reason: `Zorunlu alan eksik/gecersiz (HS_Code, Importer veya Value(USD)) - satir atlandi`,
      });
      continue;
    }

    // --- Firma coz (bul ya da olustur) ---
    const matchKey = companyMatchKey(importerRaw);
    let companyId = companyCache.get(matchKey);

    if (!companyId) {
      const existing = await db
        .select()
        .from(companies)
        .where(
          and(eq(companies.organizationId, organizationId), eq(companies.name, normalizeDisplayName(importerRaw)))
        )
        .limit(1);

      if (existing.length > 0) {
        companyId = existing[0].id;
        // yeni bir yazim varyanti gorulduyse ekle
        const variants = new Set(existing[0].rawNameVariants ?? []);
        if (!variants.has(importerRaw)) {
          variants.add(importerRaw);
          await db
            .update(companies)
            .set({ rawNameVariants: Array.from(variants), updatedAt: new Date() })
            .where(eq(companies.id, existing[0].id));
        }
      } else {
        const [created] = await db
          .insert(companies)
          .values({
            organizationId,
            name: normalizeDisplayName(importerRaw),
            rawNameVariants: [importerRaw],
            country: cleanCountry(mapped.importerCountry),
            source: "trade_data_import",
            sourceFile,
            importDate: new Date(),
          })
          .returning();
        companyId = created.id;
      }
      companyCache.set(matchKey, companyId);
    }

    // --- Ticaret kaydini ekle ---
    const hsDigits = hsCode.replace(/\D/g, "");
    await db.insert(tradeRecords).values({
      organizationId,
      projectId,
      companyId,
      hsCode,
      hsCode2: hsDigits.slice(0, 2) || null,
      hsCode4: hsDigits.slice(0, 4) || null,
      hsCode6: hsDigits.slice(0, 6) || null,
      exporterNameRaw: mapped.exporter ? String(mapped.exporter).trim() : "Not Available",
      exporterCountry: cleanCountry(mapped.exporterCountry),
      importerNameRaw: importerRaw,
      importerCountry: cleanCountry(mapped.importerCountry),
      transactionDate: parseDate(mapped.date),
      productDescription: mapped.productDescription
        ? String(mapped.productDescription).trim()
        : "Not Available",
      unit: mapped.unit ? String(mapped.unit).trim() : "Not Available",
      valueUsd: String(valueUsd),
      quantity: parseNumeric(mapped.quantity)?.toString() ?? null,
      weightMt: parseNumeric(mapped.weightMt)?.toString() ?? null,
      shipments: parseNumeric(mapped.shipments) ?? 1,
      sourceFile,
      importBatchId: batch.id,
    });

    successCount++;
  }

  // --- Olasi duplicate firma taramasi (bu organizasyondaki TUM firmalar icin) ---
  const allCompanies = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.organizationId, organizationId), isNull(companies.possibleDuplicateOfId)));

  const keyToId = new Map<string, number>();
  const keys: string[] = [];
  for (const c of allCompanies) {
    const k = companyMatchKey(c.name);
    keyToId.set(k, c.id);
    keys.push(k);
  }
  const dupCandidates = findPossibleDuplicates(keys);
  for (const cand of dupCandidates) {
    const idA = keyToId.get(cand.keyA);
    const idB = keyToId.get(cand.keyB);
    if (idA && idB) {
      await db
        .update(companies)
        .set({ possibleDuplicateOfId: idA, updatedAt: new Date() })
        .where(eq(companies.id, idB));
    }
  }

  await db
    .update(importBatches)
    .set({
      successCount,
      errorCount: errors.length,
      duplicateCount: dupCandidates.length,
      status: "completed",
    })
    .where(eq(importBatches.id, batch.id));

  // --- Bu projedeki tum firmalar icin Firsat Skorunu (yeniden) hesapla ---
  // (madde 9/65 - tek merkezi formul; ayrintili yorum icin lib/recalculateScores.ts)
  if (successCount > 0) {
    await recalculateProjectScores(projectId);
  }

  return {
    batchId: batch.id,
    rowCount: rows.length,
    successCount,
    errorCount: errors.length,
    duplicateCandidateCount: dupCandidates.length,
    errors: errors.slice(0, 50), // ilk 50 hata yeterli, tumu UI'yi bogmasin
  };
}
