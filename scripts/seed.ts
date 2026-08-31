// Deneme veri yukleme script'i.
// Daha once analiz ettigimiz 3 gercek Excel dosyasini (Azerbaycan - HS 320810/320820/320890)
// sisteme aktarir, "Boya - Azerbaycan (Deneme)" adinda bir proje olusturur ve
// her firma icin Firsat Skorunu hesaplayip company_projects tablosuna yazar.
//
// Calistirma: node --env-file=.env -r tsx/cjs scripts/seed.ts
// (veya: npx tsx --env-file=.env scripts/seed.ts)

import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import { db } from "../src/db";
import {
  organizations,
  users,
  projects,
  companyProjects,
  tradeRecords,
  companies,
} from "../src/db/schema";
import { importTradeDataRows } from "../src/lib/importTradeData";
import { calculateOpportunityScore } from "../src/lib/scoring";
import { eq, and, sql } from "drizzle-orm";

const SAMPLE_FILES = [
  "/root/.claude/uploads/c5472f24-1d86-5cea-88a4-1b8609f053f0/d053a37b-Azerbaycan_320810.xlsx",
  "/root/.claude/uploads/c5472f24-1d86-5cea-88a4-1b8609f053f0/affc1d17-Azerbaycan_320820.xlsx",
  "/root/.claude/uploads/c5472f24-1d86-5cea-88a4-1b8609f053f0/3cbbb533-Azerbaycan_320890.xlsx",
];

async function readXlsxAsRows(path: string): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheet = wb.worksheets[0];
  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => (h ? String(h).trim() : ""));

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // baslik satirini atla
    const obj: Record<string, unknown> = {};
    const values = row.values as unknown[];
    for (let col = 1; col < values.length; col++) {
      const header = headers[col];
      if (!header) continue;
      let val = values[col];
      if (val && typeof val === "object" && "text" in (val as any)) {
        val = (val as any).text; // rich text hucreleri
      }
      obj[header] = val;
    }
    rows.push(obj);
  });
  return rows;
}

async function main() {
  console.log("== UKE Global - Deneme Veri Yukleme ==");

  // 1) Organizasyon
  let [org] = await db.select().from(organizations).where(eq(organizations.name, "UKE Global"));
  if (!org) {
    [org] = await db.insert(organizations).values({ name: "UKE Global" }).returning();
    console.log("Organizasyon olusturuldu:", org.id);
  }

  // 2) Admin kullanici (gecici sifre - ilk girişte degistirilmeli)
  const [existingUser] = await db.select().from(users).where(eq(users.email, "ugurkemalevlek27@gmail.com"));
  if (!existingUser) {
    const passwordHash = await bcrypt.hash("UkeGlobal2026!", 10);
    await db.insert(users).values({
      organizationId: org.id,
      email: "ugurkemalevlek27@gmail.com",
      passwordHash,
      name: "Uğur Kemal Evlek",
      role: "admin",
    });
    console.log("Admin kullanici olusturuldu (gecici sifre: UkeGlobal2026!)");
  }

  // 3) Proje
  let [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, org.id), eq(projects.name, "Boya - Azerbaycan (Deneme)")));
  if (!project) {
    [project] = await db
      .insert(projects)
      .values({
        organizationId: org.id,
        name: "Boya - Azerbaycan (Deneme)",
        description: "CLAUDE.md ornek senaryosu: Azerbaycan boya/vernik ithalatcilari (HS 3208)",
        targetCountries: ["Azerbaijan"],
        hsCodes: ["320810", "320820", "320890"],
      })
      .returning();
    console.log("Proje olusturuldu:", project.id);
  }

  // 4) Her dosyayi import et
  for (const filePath of SAMPLE_FILES) {
    const rows = await readXlsxAsRows(filePath);
    const fileName = filePath.split("/").pop()!;
    const result = await importTradeDataRows({
      organizationId: org.id,
      projectId: project.id,
      sourceFile: fileName,
      uploadedBy: "seed-script",
      rows,
    });
    console.log(
      `  ${fileName}: ${result.successCount}/${result.rowCount} satir basarili, ${result.errorCount} hata, ${result.duplicateCandidateCount} olasi duplicate`
    );
  }

  // 5) Firsat Skoru hesapla (bu proje icindeki her firma icin)
  console.log("Firsat Skorlari hesaplaniyor...");

  const agg = await db
    .select({
      companyId: tradeRecords.companyId,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<number>`COUNT(*)`,
      distinctSuppliers: sql<number>`COUNT(DISTINCT ${tradeRecords.exporterNameRaw})`,
      lastTransactionDate: sql<string>`MAX(${tradeRecords.transactionDate})`,
    })
    .from(tradeRecords)
    .where(eq(tradeRecords.projectId, project.id))
    .groupBy(tradeRecords.companyId);

  const maxValue = Math.max(...agg.map((a) => Number(a.totalValueUsd)));
  const datasetMaxDate = new Date(
    Math.max(...agg.map((a) => new Date(a.lastTransactionDate).getTime()))
  );

  for (const row of agg) {
    if (!row.companyId) continue;
    const lastDate = new Date(row.lastTransactionDate);
    const daysSinceLast = Math.round(
      (datasetMaxDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const allDaysSince = agg.map((a) =>
      Math.round((datasetMaxDate.getTime() - new Date(a.lastTransactionDate).getTime()) / (1000 * 60 * 60 * 24))
    );
    const score = calculateOpportunityScore({
      totalValueUsd: Number(row.totalValueUsd),
      transactionCount: Number(row.transactionCount),
      distinctSuppliers: Number(row.distinctSuppliers),
      daysSinceLastTransaction: daysSinceLast,
      maxValueUsdInDataset: maxValue,
      maxDaysSinceLastTransactionInDataset: Math.max(...allDaysSince, 1),
    });

    const [existingCp] = await db
      .select()
      .from(companyProjects)
      .where(and(eq(companyProjects.companyId, row.companyId), eq(companyProjects.projectId, project.id)));

    const breakdown = JSON.stringify(score);

    if (existingCp) {
      await db
        .update(companyProjects)
        .set({
          leadScore: score.total,
          leadScoreLabel: score.label,
          leadScoreBreakdown: breakdown,
          updatedAt: new Date(),
        })
        .where(eq(companyProjects.id, existingCp.id));
    } else {
      await db.insert(companyProjects).values({
        companyId: row.companyId,
        projectId: project.id,
        leadScore: score.total,
        leadScoreLabel: score.label,
        leadScoreBreakdown: breakdown,
      });
    }
  }

  console.log(`Tamamlandi. ${agg.length} firma icin Firsat Skoru hesaplandi.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("HATA:", err);
  process.exit(1);
});
