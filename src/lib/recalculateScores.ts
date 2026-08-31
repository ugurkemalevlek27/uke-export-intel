// Bir proje icindeki tum firmalar icin Firsat Skorunu (bkz. lib/scoring.ts) yeniden hesaplar
// ve company_projects tablosuna yazar.
//
// ONEMLI: Bu fonksiyon HEM web arayuzunden yapilan import (src/app/(app)/import/actions.ts)
// HEM DE scripts/seed.ts tarafindan cagrilir - boylece skor hesaplama mantigi tek bir yerde
// durur (CLAUDE.md: "frontend/backend'de farkli formul kullanma" ilkesiyle ayni ruh).
// Onceden bu hesaplama sadece seed.ts icinde vardi; web'den yapilan importlarda firma
// Firsat Skoru hic hesaplanmiyordu (Firmalar sayfasinda "Not Available" gorunmesinin sebebi buydu).

import { db } from "@/db";
import { tradeRecords, companyProjects } from "@/db/schema";
import { calculateOpportunityScore } from "./scoring";
import { eq, sql } from "drizzle-orm";

export async function recalculateProjectScores(projectId: number): Promise<number> {
  const agg = await db
    .select({
      companyId: tradeRecords.companyId,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      transactionCount: sql<number>`COUNT(*)`,
      distinctSuppliers: sql<number>`COUNT(DISTINCT ${tradeRecords.exporterNameRaw})`,
      lastTransactionDate: sql<string | null>`MAX(${tradeRecords.transactionDate})`,
    })
    .from(tradeRecords)
    .where(eq(tradeRecords.projectId, projectId))
    .groupBy(tradeRecords.companyId);

  if (agg.length === 0) return 0;

  const maxValue = Math.max(...agg.map((a) => Number(a.totalValueUsd) || 0), 1);

  // Tarihi olmayan (Not Available) kayitlar icin guvenli varsayilan: "bugun" kabul edilir,
  // yani eksik tarih firmanin skorunu yapay olarak dusurmez ya da yukseltmez.
  const knownDates = agg
    .map((a) => (a.lastTransactionDate ? new Date(a.lastTransactionDate).getTime() : null))
    .filter((t): t is number => t !== null && !isNaN(t));
  const datasetMaxDateMs = knownDates.length > 0 ? Math.max(...knownDates) : Date.now();

  const daysSinceList = agg.map((a) => {
    if (!a.lastTransactionDate) return 0;
    const t = new Date(a.lastTransactionDate).getTime();
    if (isNaN(t)) return 0;
    return Math.round((datasetMaxDateMs - t) / (1000 * 60 * 60 * 24));
  });
  const maxDaysSince = Math.max(...daysSinceList, 1);

  let updated = 0;
  for (let i = 0; i < agg.length; i++) {
    const row = agg[i];
    if (!row.companyId) continue;

    const score = calculateOpportunityScore({
      totalValueUsd: Number(row.totalValueUsd) || 0,
      transactionCount: Number(row.transactionCount) || 0,
      distinctSuppliers: Number(row.distinctSuppliers) || 0,
      daysSinceLastTransaction: daysSinceList[i],
      maxValueUsdInDataset: maxValue,
      maxDaysSinceLastTransactionInDataset: maxDaysSince,
    });

    const breakdown = JSON.stringify(score);

    await db
      .insert(companyProjects)
      .values({
        companyId: row.companyId,
        projectId,
        leadScore: score.total,
        leadScoreLabel: score.label,
        leadScoreBreakdown: breakdown,
      })
      .onConflictDoUpdate({
        target: [companyProjects.companyId, companyProjects.projectId],
        set: {
          leadScore: score.total,
          leadScoreLabel: score.label,
          leadScoreBreakdown: breakdown,
          updatedAt: new Date(),
        },
      });
    updated++;
  }

  return updated;
}
