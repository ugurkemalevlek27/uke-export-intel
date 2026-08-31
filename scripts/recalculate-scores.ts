// Tek seferlik bakim script'i: mevcut TUM projelerdeki firmalarin Firsat Skorunu
// yeniden hesaplar. Normalde bu, her import isleminden sonra otomatik calisir
// (bkz. src/lib/importTradeData.ts). Bu script, o otomatik hesaplama eklenmeden
// ONCE ice aktarilmis ve skoru hala "Not Available" gorunen projeler icin kullanilir.
//
// Calistirma: npx tsx --env-file=.env scripts/recalculate-scores.ts

import { db } from "../src/db";
import { projects } from "../src/db/schema";
import { recalculateProjectScores } from "../src/lib/recalculateScores";

async function main() {
  console.log("== Firsat Skoru yeniden hesaplama ==");
  const allProjects = await db.select().from(projects);

  if (allProjects.length === 0) {
    console.log("Hic proje bulunamadi.");
    process.exit(0);
  }

  for (const project of allProjects) {
    const updatedCount = await recalculateProjectScores(project.id);
    console.log(`  "${project.name}": ${updatedCount} firma icin skor guncellendi.`);
  }

  console.log("Tamamlandi.");
  process.exit(0);
}

main().catch((err) => {
  console.error("HATA:", err);
  process.exit(1);
});
