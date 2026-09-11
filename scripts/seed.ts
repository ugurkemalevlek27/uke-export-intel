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
import { organizations, users, projects } from "../src/db/schema";
import { importTradeDataRows } from "../src/lib/importTradeData";
import { recalculateProjectScores } from "../src/lib/recalculateScores";
import { eq, and } from "drizzle-orm";

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
      if (val && typeof val === "object" && "text" in val) {
        val = (val as { text: unknown }).text; // rich text hucreleri
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
  // Not: importTradeDataRows artik her import sonunda bunu otomatik yapiyor
  // (bkz. src/lib/recalculateScores.ts) - burada sadece garanti olsun diye
  // bir kez daha (tum dosyalar yuklendikten sonra) cagiriyoruz.
  console.log("Firsat Skorlari hesaplaniyor...");
  const updatedCount = await recalculateProjectScores(project.id);
  console.log(`Tamamlandi. ${updatedCount} firma icin Firsat Skoru hesaplandi.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("HATA:", err);
  process.exit(1);
});
