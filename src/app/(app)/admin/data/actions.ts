"use server";

import { db } from "@/db";
import {
  users,
  importBatches,
  tradeRecords,
  companies,
  companyProjects,
  activities,
  contacts,
} from "@/db/schema";
import { and, eq, inArray, sql, notExists, exists } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { normalizeRole, can } from "@/lib/roles";
import { recalculateProjectScores } from "@/lib/recalculateScores";
import { requireOrganizationId } from "@/lib/tenant";

/**
 * Veri Yonetimi - yuklenmis bir partinin GERI ALINMASI.
 *
 * NEDEN VAR? Sutun eslestirmesi yanlis yapilmis ya da yarim kalmis bir yukleme
 * analizleri kalici olarak bozar ve duzeltmenin baska yolu yoktur: duzeltilmis
 * dosyayi yeniden yuklemek DUPLICATE korumasina takilmaz, cunku ulke/tarih gibi
 * alanlar "ayni sevkiyat" taniminin (rowHash) parcasidir. Once yanlis parti
 * silinmelidir.
 *
 * GUVENLIK: organizationId DAIMA oturumdan gelir. Kullanicinin gonderdigi
 * batchId yalnizca kendi organizasyonu icinde aranir; baska organizasyonun
 * partisi verildiginde kayit "bulunamadi" olarak doner, silinmez.
 */

async function authorize() {
  const session = await getSession();
  if (!session) throw new Error("Oturum bulunamadı.");
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!can.deleteData(normalizeRole(u?.role))) {
    throw new Error("Veri silme yetkiniz yok. Bu işlem organizasyon yöneticisi gerektirir.");
  }
  return session;
}

export interface DeleteBatchState {
  error?: string;
  success?: {
    fileName: string;
    deletedRecords: number;
    deletedCompanies: number;
    keptCompanies: number;
  };
}

export async function deleteImportBatchAction(
  _prev: DeleteBatchState | undefined,
  formData: FormData
): Promise<DeleteBatchState> {
  try {
    await authorize();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Yetki hatası." };
  }
  const organizationId = await requireOrganizationId();

  const batchId = Number(formData.get("batchId"));
  if (!Number.isInteger(batchId)) return { error: "Geçersiz yükleme kaydı." };

  // Parti YALNIZCA kendi organizasyonu icinde aranir - baska organizasyonun
  // id'si yazilirsa buradan "bulunamadi" doner (veri sizmaz, silinmez).
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.organizationId, organizationId)))
    .limit(1);

  if (!batch) return { error: "Yükleme kaydı bulunamadı." };

  // Onay: kullanici dosya adini birebir yazmali. Yanlislikla silmeyi zorlastirir.
  const confirmText = String(formData.get("confirmText") ?? "").trim();
  if (confirmText !== batch.fileName) {
    return { error: `Onaylamak için dosya adını birebir yazın: ${batch.fileName}` };
  }

  // --- Oksuz kalacak firmalari belirle ------------------------------------
  // Yalnizca bu partiden gelen VE uzerinde hicbir insan emegi (CRM verisi)
  // olmayan firmalar silinir. Lead durumu degismis, notu, satis sahibi,
  // aktivitesi ya da kontagi olan firma BILEREK korunur.
  const orphanRows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.organizationId, organizationId),
        exists(
          db
            .select({ x: sql`1` })
            .from(tradeRecords)
            .where(
              and(eq(tradeRecords.companyId, companies.id), eq(tradeRecords.importBatchId, batchId))
            )
        ),
        notExists(
          db
            .select({ x: sql`1` })
            .from(tradeRecords)
            .where(
              and(
                eq(tradeRecords.companyId, companies.id),
                sql`${tradeRecords.importBatchId} IS DISTINCT FROM ${batchId}`
              )
            )
        ),
        notExists(
          db
            .select({ x: sql`1` })
            .from(companyProjects)
            .where(
              and(
                eq(companyProjects.companyId, companies.id),
                sql`(${companyProjects.leadStatus} <> 'yeni'
                     OR ${companyProjects.notes} IS NOT NULL
                     OR ${companyProjects.salesOwner} IS NOT NULL
                     OR ${companyProjects.lastContactDate} IS NOT NULL
                     OR ${companyProjects.nextFollowupDate} IS NOT NULL)`
              )
            )
        ),
        // activities firmaya DOGRUDAN degil, company_projects uzerinden baglidir.
        notExists(
          db
            .select({ x: sql`1` })
            .from(activities)
            .innerJoin(companyProjects, eq(activities.companyProjectId, companyProjects.id))
            .where(eq(companyProjects.companyId, companies.id))
        ),
        notExists(
          db.select({ x: sql`1` }).from(contacts).where(eq(contacts.companyId, companies.id))
        )
      )
    );

  const orphanIds = orphanRows.map((r) => r.id);

  const [before] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(tradeRecords)
    .where(
      and(eq(tradeRecords.organizationId, organizationId), eq(tradeRecords.importBatchId, batchId))
    );
  const recordCount = Number(before?.n ?? 0);

  // Partiye bagli TUM firmalar (korunanlari raporlayabilmek icin)
  const [linked] = await db
    .select({ n: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})` })
    .from(tradeRecords)
    .where(
      and(eq(tradeRecords.organizationId, organizationId), eq(tradeRecords.importBatchId, batchId))
    );
  const linkedCompanies = Number(linked?.n ?? 0);

  // --- Silme (tek transaction: ya hepsi ya hicbiri) ------------------------
  await db.transaction(async (tx) => {
    await tx
      .delete(tradeRecords)
      .where(
        and(eq(tradeRecords.organizationId, organizationId), eq(tradeRecords.importBatchId, batchId))
      );

    if (orphanIds.length > 0) {
      await tx.delete(companyProjects).where(inArray(companyProjects.companyId, orphanIds));
      await tx
        .delete(companies)
        .where(and(eq(companies.organizationId, organizationId), inArray(companies.id, orphanIds)));
    }

    await tx
      .delete(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.organizationId, organizationId)));
  });

  // Skorlar silinen veriyi yansitmali.
  if (batch.projectId) {
    await recalculateProjectScores(batch.projectId);
  }

  revalidatePath("/admin/data");
  revalidatePath("/data/history");
  revalidatePath("/data/quality");
  revalidatePath("/companies");
  revalidatePath("/");

  return {
    success: {
      fileName: batch.fileName,
      deletedRecords: recordCount,
      deletedCompanies: orphanIds.length,
      keptCompanies: Math.max(0, linkedCompanies - orphanIds.length),
    },
  };
}
