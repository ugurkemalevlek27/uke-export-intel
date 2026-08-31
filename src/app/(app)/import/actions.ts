"use server";

import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { importTradeDataRows } from "@/lib/importTradeData";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

async function parseXlsxBuffer(buffer: Buffer): Promise<Record<string, unknown>[]> {
  // exceljs'in Buffer overload'i bu ortamdaki @types/node surumleriyle catisiyor;
  // gecici dosyaya yazip readFile ile okumak (seed script'inde de kullanilan,
  // dogrulanmis yol) bu sorunu tamamen atlar.
  const tmpPath = join(tmpdir(), `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  await writeFile(tmpPath, buffer);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(tmpPath);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
  const sheet = wb.worksheets[0];
  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => (h ? String(h).trim() : ""));

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    const values = row.values as unknown[];
    for (let col = 1; col < values.length; col++) {
      const header = headers[col];
      if (!header) continue;
      let val = values[col];
      if (val && typeof val === "object" && "text" in (val as any)) {
        val = (val as any).text;
      }
      obj[header] = val;
    }
    rows.push(obj);
  });
  return rows;
}

function parseCsvBuffer(buffer: Buffer): Record<string, unknown>[] {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
}

export interface ImportActionState {
  error?: string;
  success?: {
    fileName: string;
    rowCount: number;
    successCount: number;
    errorCount: number;
    duplicateCandidateCount: number;
  };
}

export async function importFileAction(
  _prev: ImportActionState | undefined,
  formData: FormData
): Promise<ImportActionState> {
  const session = await getSession();
  if (!session) return { error: "Oturum bulunamadı." };

  const file = formData.get("file") as File | null;
  const projectId = Number(formData.get("projectId"));

  if (!file || file.size === 0) return { error: "Lütfen bir dosya seçin." };
  if (!projectId) return { error: "Lütfen bir proje seçin." };

  // Secilen projenin gercekten bu kullanicinin organizasyonuna ait oldugunu dogrula
  // (Server Function'lar Proxy'den bagimsiz calisabildigi icin bu kontrol burada sart).
  const [ownedProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, session.organizationId)));
  if (!ownedProject) return { error: "Geçersiz proje." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const isCsv = file.name.toLowerCase().endsWith(".csv");

  let rows: Record<string, unknown>[];
  try {
    rows = isCsv ? parseCsvBuffer(buffer) : await parseXlsxBuffer(buffer);
  } catch {
    return { error: "Dosya okunamadı. Lütfen geçerli bir .xlsx veya .csv dosyası yükleyin." };
  }

  if (rows.length === 0) {
    return { error: "Dosyada veri satırı bulunamadı." };
  }

  const result = await importTradeDataRows({
    organizationId: session.organizationId,
    projectId,
    sourceFile: file.name,
    uploadedBy: session.email,
    rows,
  });

  revalidatePath("/");
  revalidatePath("/companies");

  return {
    success: {
      fileName: file.name,
      rowCount: result.rowCount,
      successCount: result.successCount,
      errorCount: result.errorCount,
      duplicateCandidateCount: result.duplicateCandidateCount,
    },
  };
}

export async function createProjectAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.insert(projects).values({
    organizationId: session.organizationId,
    name,
    hsCodes: [],
    targetCountries: [],
  });

  revalidatePath("/import");
}
