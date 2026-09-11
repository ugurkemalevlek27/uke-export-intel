"use server";

import { db } from "@/db";
import { companies, companyProjects, tradeRecords, users } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { normalizeRole, can } from "@/lib/roles";
import { recalculateProjectScores } from "@/lib/recalculateScores";

/** Oturum + yetki kontrolu (Server Function'lar Proxy zincirinin disinda calisabilir). */
async function authorize() {
  const session = await getSession();
  if (!session) throw new Error("Oturum bulunamadı.");
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!can.manageDataQuality(normalizeRole(u?.role))) {
    throw new Error("Veri kalitesi düzenleme yetkiniz yok.");
  }
  return session;
}

/**
 * Iki firmayi birlestirir (INSAN ONAYIYLA).
 *
 * - Kaynak firmanin TUM ticaret kayitlari hedef firmaya tasinir.
 * - Kaynak firma SILINMEZ: mergedIntoId ile isaretlenir (geri alinabilir).
 * - Isim varyantlari hedef firmada birlestirilir.
 * - Etkilenen projelerdeki Firsat Skorlari yeniden hesaplanir.
 */
export async function mergeCompaniesAction(formData: FormData) {
  const session = await authorize();

  const sourceId = Number(formData.get("sourceId"));
  const targetId = Number(formData.get("targetId"));
  if (!sourceId || !targetId || sourceId === targetId) return;

  // Her iki firma da bu organizasyona ait olmali (IDOR korumasi)
  const both = await db
    .select({ id: companies.id, name: companies.name, variants: companies.rawNameVariants })
    .from(companies)
    .where(
      and(
        eq(companies.organizationId, session.organizationId),
        sql`${companies.id} IN (${sourceId}, ${targetId})`
      )
    );
  if (both.length !== 2) return;

  const source = both.find((c) => c.id === sourceId)!;
  const target = both.find((c) => c.id === targetId)!;

  // Etkilenen projeleri birlestirmeden ONCE tespit et (skor yeniden hesabi icin)
  const affected = await db
    .selectDistinct({ projectId: tradeRecords.projectId })
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, sourceId));

  // 1) Ticaret kayitlarini hedefe tasi
  await db.update(tradeRecords).set({ companyId: targetId }).where(eq(tradeRecords.companyId, sourceId));

  // 2) Isim varyantlarini birlestir
  const merged = Array.from(
    new Set([...(target.variants ?? []), ...(source.variants ?? []), source.name])
  );
  await db
    .update(companies)
    .set({ rawNameVariants: merged, updatedAt: new Date() })
    .where(eq(companies.id, targetId));

  // 3) Kaynak firmanin proje kayitlarini kaldir (ticaret verisi tasindi, skorlari anlamsiz)
  await db.delete(companyProjects).where(eq(companyProjects.companyId, sourceId));

  // 4) Kaynak firmayi mezar tasi olarak isaretle - SILINMEZ
  await db
    .update(companies)
    .set({
      mergedIntoId: targetId,
      mergedAt: new Date(),
      mergedBy: session.userId,
      possibleDuplicateOfId: null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, sourceId));

  // 5) Etkilenen projelerde skorlari yeniden hesapla
  for (const a of affected) {
    if (a.projectId !== null) await recalculateProjectScores(a.projectId);
  }

  revalidatePath("/data/quality");
  revalidatePath("/companies");
  revalidatePath("/");
}

/** "Bunlar farklı firmalar" - duplicate isaretini kaldirir. */
export async function dismissDuplicateAction(formData: FormData) {
  const session = await authorize();
  const companyId = Number(formData.get("companyId"));
  if (!companyId) return;

  await db
    .update(companies)
    .set({ possibleDuplicateOfId: null, updatedAt: new Date() })
    .where(and(eq(companies.id, companyId), eq(companies.organizationId, session.organizationId)));

  revalidatePath("/data/quality");
}

/**
 * Birlestirmeyi geri alir: ticaret kayitlari kaynak firmaya doner.
 * Mezar tasi yaklasimi sayesinde bu mumkun - hicbir veri silinmedigi icin.
 */
export async function unmergeCompanyAction(formData: FormData) {
  const session = await authorize();
  const companyId = Number(formData.get("companyId"));
  if (!companyId) return;

  const [c] = await db
    .select({ id: companies.id, mergedIntoId: companies.mergedIntoId, name: companies.name })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.organizationId, session.organizationId)))
    .limit(1);
  if (!c || !c.mergedIntoId) return;

  // Kaynak firmanin kendi adiyla yuklenmis kayitlarini geri tasi
  await db
    .update(tradeRecords)
    .set({ companyId })
    .where(
      and(
        eq(tradeRecords.companyId, c.mergedIntoId),
        eq(tradeRecords.importerNameRaw, c.name),
        eq(tradeRecords.organizationId, session.organizationId)
      )
    );

  await db
    .update(companies)
    .set({ mergedIntoId: null, mergedAt: null, mergedBy: null, updatedAt: new Date() })
    .where(eq(companies.id, companyId));

  const affected = await db
    .selectDistinct({ projectId: tradeRecords.projectId })
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, companyId));
  for (const a of affected) {
    if (a.projectId !== null) await recalculateProjectScores(a.projectId);
  }

  revalidatePath("/data/quality");
  revalidatePath("/companies");
}

/** Birlestirilmis (mezar tasi) firmalari listeler - geri alma icin. */
export async function listMergedCompanies(organizationId: number) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      mergedIntoId: companies.mergedIntoId,
      mergedAt: companies.mergedAt,
    })
    .from(companies)
    .where(and(eq(companies.organizationId, organizationId), sql`${companies.mergedIntoId} IS NOT NULL`))
    .limit(50);
}

export { isNull };
