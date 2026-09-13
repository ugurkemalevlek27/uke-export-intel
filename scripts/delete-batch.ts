/**
 * Belirli bir yukleme partisini geri alir (Veri Yonetimi panelindeki "Sil"
 * isleminin komut satiri karsiligi).
 *
 * Panel ile AYNI korumalari uygular:
 *   - Yalnizca verilen parti id'lerine dokunur.
 *   - Uzerinde insan emegi (CRM verisi) olan firmalari SILMEZ.
 *   - Tek transaction: ya hepsi ya hicbiri.
 *
 * Calistirma:  npx tsx --env-file=.env scripts/delete-batch.ts 12 13
 *              npx tsx --env-file=.env scripts/delete-batch.ts 12 13 --dry-run
 */

import { db } from "../src/db";
import { tradeRecords, companies, companyProjects, importBatches } from "../src/db/schema";
import { inArray, sql, eq } from "drizzle-orm";
import { recalculateProjectScores } from "../src/lib/recalculateScores";

const DRY = process.argv.includes("--dry-run");
const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);

async function main() {
  if (ids.length === 0) throw new Error("En az bir parti id'si verin. Orn: ... delete-batch.ts 12 13");

  const batches = await db
    .select({
      id: importBatches.id,
      fileName: importBatches.fileName,
      projectId: importBatches.projectId,
      organizationId: importBatches.organizationId,
    })
    .from(importBatches)
    .where(inArray(importBatches.id, ids));

  if (batches.length === 0) throw new Error("Verilen id'lerle parti bulunamadi.");

  console.log("Silinecek partiler:");
  for (const b of batches) console.log(`  #${b.id} ${b.fileName} (proje ${b.projectId})`);

  const [{ n: kayit }] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(tradeRecords)
    .where(inArray(tradeRecords.importBatchId, ids));
  console.log(`\nTicaret kaydi: ${Number(kayit).toLocaleString("tr-TR")}`);

  // Oksuz kalacak firmalar: SADECE bu partilerden gelen ve hicbir CRM verisi olmayanlar.
  const orphans = await db.execute(sql`
    SELECT c.id, c.name FROM ${companies} c
    WHERE EXISTS (SELECT 1 FROM ${tradeRecords} t
                  WHERE t.company_id = c.id AND t.import_batch_id IN ${ids})
      AND NOT EXISTS (SELECT 1 FROM ${tradeRecords} t
                      WHERE t.company_id = c.id AND t.import_batch_id NOT IN ${ids})
      AND NOT EXISTS (SELECT 1 FROM ${companyProjects} cp
                      WHERE cp.company_id = c.id
                        AND (cp.lead_status <> 'yeni' OR cp.notes IS NOT NULL
                             OR cp.sales_owner IS NOT NULL OR cp.last_contact_date IS NOT NULL
                             OR cp.next_followup_date IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM activities a
                      JOIN ${companyProjects} cp2 ON cp2.id = a.company_project_id
                      WHERE cp2.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM contacts k WHERE k.company_id = c.id)
  `);
  const orphanIds = (orphans.rows as { id: number }[]).map((r) => r.id);

  const [{ n: bagli }] = await db
    .select({ n: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})` })
    .from(tradeRecords)
    .where(inArray(tradeRecords.importBatchId, ids));

  console.log(`Bagli firma: ${bagli} | oksuz kalip silinecek: ${orphanIds.length} | korunacak: ${Number(bagli) - orphanIds.length}`);

  if (DRY) { console.log("\n(kuru calistirma - hicbir sey silinmedi)"); return; }

  await db.transaction(async (tx) => {
    await tx.delete(tradeRecords).where(inArray(tradeRecords.importBatchId, ids));
    if (orphanIds.length) {
      await tx.delete(companyProjects).where(inArray(companyProjects.companyId, orphanIds));
      await tx.delete(companies).where(inArray(companies.id, orphanIds));
    }
    await tx.delete(importBatches).where(inArray(importBatches.id, ids));
  });
  console.log("\nSilindi.");

  const projeler = [...new Set(batches.map((b) => b.projectId).filter((p): p is number => p !== null))];
  for (const p of projeler) {
    await recalculateProjectScores(p);
    console.log(`  proje ${p}: skorlar yeniden hesaplandi`);
  }

  const ozet = await db.execute(sql`
    SELECT importer_country AS ulke, COUNT(*)::int AS n
    FROM ${tradeRecords} GROUP BY 1 ORDER BY 2 DESC
  `);
  console.log("\nKalan veri:");
  console.table(ozet.rows);
}

main().then(() => process.exit(0)).catch((e) => { console.error("HATA:", e.message); process.exit(1); });
