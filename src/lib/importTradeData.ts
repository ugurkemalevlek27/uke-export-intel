// Ticaret verisi import pipeline'i — V2 (Phase 4)
//
// V1'e gore degisenler:
//  1) DUPLICATE KORUMASI: her sevkiyat icin icerik hash'i uretilir; ayni dosya
//     ikinci kez yuklendiginde tekrar eden kayitlar EKLENMEZ, raporlanir.
//     (V1'de bu koruma yoktu ve tum rakamlar ikiye katlaniyordu.)
//  2) TOPLU INSERT: satirlar 500'lu gruplar halinde yazilir. V1'de her satir
//     ayri bir veritabani turuydu (1.933 satir = 1.933 tur).
//  3) HIZLI DUPLICATE FIRMA TARAMASI: V1'de her import'ta TUM firmalar ikili
//     ikili karsilastiriliyordu (O(n^2): 10.000 firmada 50 milyon karsilastirma).
//     Artik yalnizca bu import'ta gorulen firmalar, ayni "blok" icindeki
//     firmalarla karsilastirilir.
//  4) SUTUN ESLESTIRME: baslik adlari sabit listeye bagli degil; sihirbazdan
//     gelen eslestirme kullanilir (yoksa otomatik oneri uygulanir).

import { db } from "@/db";
import { companies, importBatches, tradeRecords } from "@/db/schema";
import { companyMatchKey, normalizeDisplayName } from "./normalize";
import { findPossibleDuplicates } from "./duplicates";
import { recalculateProjectScores } from "./recalculateScores";
import { computeRowHash } from "./rowHash";
import { suggestMapping, type ImportField } from "./columnMapping";
import { eq, and, isNull, inArray } from "drizzle-orm";

/** Tek seferde veritabanina yazilan satir sayisi. */
const INSERT_CHUNK = 500;

/** Duplicate firma taramasinda bir blok icin azami karsilastirma buyuklugu. */
const MAX_BLOCK_SIZE = 400;

/** "1,373" -> 1373 ; 1373 -> 1373 ; bos/gecersiz -> null */
function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/\s/g, "").replace(/,/g, "").trim();
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
  const raw = String(value).trim();
  // GG.AA.YYYY / GG/AA/YYYY gibi Turkce formatlari da destekle
  const tr = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (tr) {
    const [, d, m, y] = tr;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const d = new Date(raw);
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
  /** Ayni icerige sahip oldugu icin ATLANAN satir sayisi */
  skippedDuplicateCount: number;
  /** Olasi duplicate FIRMA adayi sayisi (birlestirme yapilmaz, isaretlenir) */
  duplicateCandidateCount: number;
  errors: ImportRowError[];
}

export interface ImportParams {
  organizationId: number;
  projectId: number;
  sourceFile: string;
  uploadedBy?: string;
  rows: Record<string, unknown>[];
  /** Sihirbazdan gelen sutun eslestirmesi. Verilmezse otomatik oneri kullanilir. */
  mapping?: Partial<Record<ImportField, string>>;
}

export async function importTradeDataRows(params: ImportParams): Promise<ImportResult> {
  const { organizationId, projectId, sourceFile, uploadedBy, rows } = params;

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const mapping = params.mapping ?? suggestMapping(headers);

  const [batch] = await db
    .insert(importBatches)
    .values({
      organizationId,
      projectId,
      fileName: sourceFile,
      uploadedBy: uploadedBy ?? "system",
      rowCount: rows.length,
      columnMapping: JSON.stringify(mapping),
      status: "processing",
    })
    .returning();

  const errors: ImportRowError[] = [];
  let skippedDuplicateCount = 0;

  // --- 1) Satirlari ayikla ve dogrula -------------------------------------
  interface Prepared {
    rowNumber: number;
    hsCode: string;
    importerRaw: string;
    matchKey: string;
    exporter: string;
    exporterCountry: string;
    importerCountry: string;
    transactionDate: string | null;
    productDescription: string;
    unit: string;
    valueUsd: number;
    quantity: number | null;
    weightMt: number | null;
    shipments: number;
    hash: string;
  }

  const prepared: Prepared[] = [];
  const get = (row: Record<string, unknown>, field: ImportField): unknown => {
    const header = mapping[field];
    return header === undefined ? undefined : row[header];
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // Excel'de 1. satir baslik

    const hsCode = get(row, "hsCode") ? String(get(row, "hsCode")).trim() : "";
    const importerRaw = get(row, "importer") ? String(get(row, "importer")).trim() : "";
    const valueUsd = parseNumeric(get(row, "valueUsd"));

    if (!hsCode || !importerRaw || valueUsd === null) {
      const eksik = [
        !hsCode ? "GTİP" : null,
        !importerRaw ? "İthalatçı" : null,
        valueUsd === null ? "Değer (USD)" : null,
      ].filter(Boolean).join(", ");
      errors.push({ rowNumber, reason: `Zorunlu alan eksik/geçersiz: ${eksik} — satır atlandı` });
      continue;
    }

    const importerCountry = cleanCountry(get(row, "importerCountry"));
    const exporter = get(row, "exporter") ? String(get(row, "exporter")).trim() : "Not Available";
    const transactionDate = parseDate(get(row, "date"));
    const quantity = parseNumeric(get(row, "quantity"));

    prepared.push({
      rowNumber,
      hsCode,
      importerRaw,
      matchKey: companyMatchKey(importerRaw),
      exporter,
      exporterCountry: cleanCountry(get(row, "exporterCountry")),
      importerCountry,
      transactionDate,
      productDescription: get(row, "productDescription")
        ? String(get(row, "productDescription")).trim()
        : "Not Available",
      unit: get(row, "unit") ? String(get(row, "unit")).trim() : "Not Available",
      valueUsd,
      quantity,
      weightMt: parseNumeric(get(row, "weightMt")),
      shipments: parseNumeric(get(row, "shipments")) ?? 1,
      hash: computeRowHash({
        projectId,
        hsCode,
        importerNameRaw: importerRaw,
        exporterNameRaw: exporter,
        importerCountry,
        transactionDate,
        valueUsd,
        quantity,
      }),
    });
  }

  // --- 2) Duplicate sevkiyatlari ele ---------------------------------------
  // (a) Veritabaninda zaten var olanlar
  const incomingHashes = Array.from(new Set(prepared.map((p) => p.hash)));
  const existingHashes = new Set<string>();
  for (let i = 0; i < incomingHashes.length; i += 1000) {
    const chunk = incomingHashes.slice(i, i + 1000);
    const found = await db
      .select({ h: tradeRecords.rowHash })
      .from(tradeRecords)
      .where(and(eq(tradeRecords.organizationId, organizationId), inArray(tradeRecords.rowHash, chunk)));
    for (const f of found) if (f.h) existingHashes.add(f.h);
  }

  // (b) Dosyanin KENDI icindeki tekrarlar
  const seenInFile = new Set<string>();
  const toInsert = prepared.filter((p) => {
    if (existingHashes.has(p.hash) || seenInFile.has(p.hash)) {
      skippedDuplicateCount++;
      return false;
    }
    seenInFile.add(p.hash);
    return true;
  });

  // --- 3) Firmalari coz (bul ya da olustur) --------------------------------
  const uniqueImporters = new Map<string, { raw: string; country: string }>();
  for (const p of toInsert) {
    if (!uniqueImporters.has(p.matchKey)) {
      uniqueImporters.set(p.matchKey, { raw: p.importerRaw, country: p.importerCountry });
    }
  }

  const displayNames = Array.from(uniqueImporters.values()).map((v) => normalizeDisplayName(v.raw));
  const companyByName = new Map<string, number>();
  for (let i = 0; i < displayNames.length; i += 500) {
    const chunk = displayNames.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const found = await db
      .select({ id: companies.id, name: companies.name, variants: companies.rawNameVariants })
      .from(companies)
      .where(and(eq(companies.organizationId, organizationId), inArray(companies.name, chunk)));
    for (const f of found) companyByName.set(f.name, f.id);
  }

  const companyIdByMatchKey = new Map<string, number>();
  const newCompanyRows: { organizationId: number; name: string; rawNameVariants: string[]; country: string; source: string; sourceFile: string; importDate: Date }[] = [];

  for (const [key, info] of uniqueImporters) {
    const display = normalizeDisplayName(info.raw);
    const existingId = companyByName.get(display);
    if (existingId) {
      companyIdByMatchKey.set(key, existingId);
    } else {
      newCompanyRows.push({
        organizationId,
        name: display,
        rawNameVariants: [info.raw],
        country: info.country,
        source: "trade_data_import",
        sourceFile,
        importDate: new Date(),
      });
    }
  }

  // Yeni firmalari toplu ekle
  for (let i = 0; i < newCompanyRows.length; i += INSERT_CHUNK) {
    const chunk = newCompanyRows.slice(i, i + INSERT_CHUNK);
    const created = await db.insert(companies).values(chunk).returning({ id: companies.id, name: companies.name });
    for (const c of created) companyByName.set(c.name, c.id);
  }
  for (const [key, info] of uniqueImporters) {
    if (companyIdByMatchKey.has(key)) continue;
    const id = companyByName.get(normalizeDisplayName(info.raw));
    if (id) companyIdByMatchKey.set(key, id);
  }

  // --- 4) Ticaret kayitlarini TOPLU yaz ------------------------------------
  const values = toInsert.map((p) => {
    const hsDigits = p.hsCode.replace(/\D/g, "");
    return {
      organizationId,
      projectId,
      companyId: companyIdByMatchKey.get(p.matchKey) ?? null,
      hsCode: p.hsCode,
      hsCode2: hsDigits.slice(0, 2) || null,
      hsCode4: hsDigits.slice(0, 4) || null,
      hsCode6: hsDigits.slice(0, 6) || null,
      exporterNameRaw: p.exporter,
      exporterCountry: p.exporterCountry,
      importerNameRaw: p.importerRaw,
      importerCountry: p.importerCountry,
      transactionDate: p.transactionDate,
      productDescription: p.productDescription,
      unit: p.unit,
      valueUsd: String(p.valueUsd),
      quantity: p.quantity?.toString() ?? null,
      weightMt: p.weightMt?.toString() ?? null,
      shipments: p.shipments,
      sourceFile,
      importBatchId: batch.id,
      rowHash: p.hash,
    };
  });

  let successCount = 0;
  for (let i = 0; i < values.length; i += INSERT_CHUNK) {
    const chunk = values.slice(i, i + INSERT_CHUNK);
    await db.insert(tradeRecords).values(chunk);
    successCount += chunk.length;
  }

  // --- 5) Olasi duplicate FIRMA taramasi (bloklanmis - hizli) --------------
  const dupCandidateCount = await scanForDuplicateCompanies(
    organizationId,
    Array.from(uniqueImporters.keys())
  );

  await db
    .update(importBatches)
    .set({
      successCount,
      errorCount: errors.length,
      duplicateCount: dupCandidateCount,
      skippedDuplicateCount,
      status: "completed",
    })
    .where(eq(importBatches.id, batch.id));

  // --- 6) Firsat Skorlarini yeniden hesapla --------------------------------
  if (successCount > 0) {
    await recalculateProjectScores(projectId);
  }

  return {
    batchId: batch.id,
    rowCount: rows.length,
    successCount,
    errorCount: errors.length,
    skippedDuplicateCount,
    duplicateCandidateCount: dupCandidateCount,
    errors: errors.slice(0, 50),
  };
}

/**
 * Olasi duplicate firma taramasi — BLOKLANMIS.
 *
 * V1'de organizasyondaki TUM firmalar ikili ikili karsilastiriliyordu; bu
 * O(n^2) Levenshtein demek (10.000 firmada ~50 milyon karsilastirma, import
 * zaman asimina ugrardi). Artik:
 *   - Yalnizca BU import'ta gorulen firmalar taranir.
 *   - Karsilastirma, ayni "blok" (matchKey'in ilk 4 karakteri) icindeki
 *     firmalarla sinirlidir; farkli blokta olanlar zaten benzer olamaz.
 * Birlestirme YAPILMAZ - yalnizca aday olarak isaretlenir (insan onayi sart).
 */
async function scanForDuplicateCompanies(
  organizationId: number,
  touchedMatchKeys: string[]
): Promise<number> {
  if (touchedMatchKeys.length === 0) return 0;

  const blocks = new Set(touchedMatchKeys.map((k) => k.slice(0, 4)).filter((b) => b.length >= 4));
  if (blocks.size === 0) return 0;

  const all = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.organizationId, organizationId), isNull(companies.possibleDuplicateOfId)));

  // Firmalari bloklara ayir
  const byBlock = new Map<string, { id: number; key: string }[]>();
  for (const c of all) {
    const key = companyMatchKey(c.name);
    const block = key.slice(0, 4);
    if (!blocks.has(block)) continue; // bu import'la ilgisi yok
    const list = byBlock.get(block) ?? [];
    list.push({ id: c.id, key });
    byBlock.set(block, list);
  }

  let candidateCount = 0;
  for (const [, list] of byBlock) {
    if (list.length < 2) continue;
    // Asiri buyuk bloklarda taramayi sinirla (performans korumasi)
    const slice = list.slice(0, MAX_BLOCK_SIZE);
    const keyToId = new Map(slice.map((c) => [c.key, c.id]));
    const candidates = findPossibleDuplicates(slice.map((c) => c.key));
    for (const cand of candidates) {
      const idA = keyToId.get(cand.keyA);
      const idB = keyToId.get(cand.keyB);
      if (!idA || !idB || idA === idB) continue;
      await db
        .update(companies)
        .set({ possibleDuplicateOfId: idA, updatedAt: new Date() })
        .where(eq(companies.id, idB));
      candidateCount++;
    }
  }
  return candidateCount;
}
