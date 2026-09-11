"use server";

import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { importTradeDataRows } from "@/lib/importTradeData";
import { suggestMapping, missingRequired, IMPORT_FIELDS, type ImportField } from "@/lib/columnMapping";
import { getSession } from "@/lib/auth";
import { normalizeRole, can } from "@/lib/roles";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// ---------------------------------------------------------------------------
// Dosya okuma
// ---------------------------------------------------------------------------

async function parseXlsxBuffer(buffer: Buffer): Promise<Record<string, unknown>[]> {
  // exceljs'in Buffer overload'i bu ortamdaki @types/node surumleriyle catisiyor;
  // gecici dosyaya yazip readFile ile okumak dogrulanmis yol.
  const tmpPath = join(tmpdir(), `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  await writeFile(tmpPath, buffer);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(tmpPath);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => (h ? String(h).trim() : ""));

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    const values = row.values as unknown[];
    for (let col = 1; col < headers.length + 1; col++) {
      const header = headers[col];
      if (!header) continue;
      let val = values[col];
      // ExcelJS zengin metin (rich text) hucrelerini { text: string } olarak dondurur.
      if (val && typeof val === "object" && "text" in val) {
        val = (val as { text: unknown }).text;
      }
      obj[header] = val ?? null;
    }
    rows.push(obj);
  });
  return rows;
}

function parseCsvBuffer(buffer: Buffer): Record<string, unknown>[] {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
}

async function readFileRows(file: File): Promise<Record<string, unknown>[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  return isCsv ? parseCsvBuffer(buffer) : parseXlsxBuffer(buffer);
}

/** Oturum + yetki + proje sahipligi kontrolu (Server Function'lar Proxy disinda calisabilir). */
async function authorize(projectId: number) {
  const session = await getSession();
  if (!session) return { error: "Oturum bulunamadı." as const };

  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!can.importData(normalizeRole(dbUser?.role))) {
    return { error: "Veri içe aktarma yetkiniz yok." as const };
  }

  const [owned] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, session.organizationId)));
  if (!owned) return { error: "Geçersiz proje." as const };

  return { session };
}

// ---------------------------------------------------------------------------
// ADIM 1-3: Onizleme + sutun eslestirme onerisi + dogrulama
// ---------------------------------------------------------------------------

export interface PreviewState {
  error?: string;
  preview?: {
    fileName: string;
    headers: string[];
    sampleRows: Record<string, string>[];
    suggested: Partial<Record<ImportField, string>>;
    totalRows: number;
  };
}

export async function previewFileAction(
  _prev: PreviewState | undefined,
  formData: FormData
): Promise<PreviewState> {
  const projectId = Number(formData.get("projectId"));
  if (!projectId) return { error: "Lütfen bir proje seçin." };
  const auth = await authorize(projectId);
  if ("error" in auth) return { error: auth.error };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Lütfen bir dosya seçin." };

  let rows: Record<string, unknown>[];
  try {
    rows = await readFileRows(file);
  } catch {
    return { error: "Dosya okunamadı. Geçerli bir .xlsx veya .csv dosyası yükleyin." };
  }
  if (rows.length === 0) return { error: "Dosyada veri satırı bulunamadı." };

  const headers = Object.keys(rows[0]);
  const sampleRows = rows.slice(0, 20).map((r) => {
    const o: Record<string, string> = {};
    for (const h of headers) {
      const v = r[h];
      o[h] = v === null || v === undefined ? "" : String(v).slice(0, 120);
    }
    return o;
  });

  return {
    preview: {
      fileName: file.name,
      headers,
      sampleRows,
      suggested: suggestMapping(headers),
      totalRows: rows.length,
    },
  };
}

// ---------------------------------------------------------------------------
// ADIM 4: Ice aktarma
// ---------------------------------------------------------------------------

export interface ImportActionState {
  error?: string;
  success?: {
    fileName: string;
    rowCount: number;
    successCount: number;
    errorCount: number;
    skippedDuplicateCount: number;
    duplicateCandidateCount: number;
    errors: { rowNumber: number; reason: string }[];
  };
}

export async function importFileAction(
  _prev: ImportActionState | undefined,
  formData: FormData
): Promise<ImportActionState> {
  const projectId = Number(formData.get("projectId"));
  if (!projectId) return { error: "Lütfen bir proje seçin." };
  const auth = await authorize(projectId);
  if ("error" in auth) return { error: auth.error };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Lütfen bir dosya seçin." };

  // Sihirbazdan gelen sutun eslestirmesi
  let mapping: Partial<Record<ImportField, string>> | undefined;
  const mappingRaw = formData.get("mapping");
  if (typeof mappingRaw === "string" && mappingRaw.trim() !== "") {
    try {
      const parsed = JSON.parse(mappingRaw) as Record<string, unknown>;
      mapping = {};
      for (const f of IMPORT_FIELDS) {
        const v = parsed[f];
        if (typeof v === "string" && v !== "") mapping[f] = v;
      }
    } catch {
      return { error: "Sütun eşleştirmesi okunamadı." };
    }
  }

  let rows: Record<string, unknown>[];
  try {
    rows = await readFileRows(file);
  } catch {
    return { error: "Dosya okunamadı. Geçerli bir .xlsx veya .csv dosyası yükleyin." };
  }
  if (rows.length === 0) return { error: "Dosyada veri satırı bulunamadı." };

  const effective = mapping ?? suggestMapping(Object.keys(rows[0]));
  const missing = missingRequired(effective);
  if (missing.length > 0) {
    return { error: `Zorunlu alanlar eşleştirilmedi: ${missing.join(", ")}` };
  }

  const result = await importTradeDataRows({
    organizationId: auth.session.organizationId,
    projectId,
    sourceFile: file.name,
    uploadedBy: auth.session.email,
    rows,
    mapping: effective,
  });

  revalidatePath("/");
  revalidatePath("/companies");
  revalidatePath("/data/history");

  return {
    success: {
      fileName: file.name,
      rowCount: result.rowCount,
      successCount: result.successCount,
      errorCount: result.errorCount,
      skippedDuplicateCount: result.skippedDuplicateCount,
      duplicateCandidateCount: result.duplicateCandidateCount,
      errors: result.errors.slice(0, 20),
    },
  };
}

// ---------------------------------------------------------------------------
// Proje olusturma
// ---------------------------------------------------------------------------

export async function createProjectAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!can.manageProjects(normalizeRole(dbUser?.role))) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.insert(projects).values({
    organizationId: session.organizationId,
    name,
    clientName: String(formData.get("clientName") ?? "").trim() || null,
    productGroup: String(formData.get("productGroup") ?? "").trim() || null,
    createdBy: session.userId,
    hsCodes: [],
    targetCountries: [],
  });

  revalidatePath("/import");
  revalidatePath("/", "layout");
}
