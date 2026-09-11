"use server";

import { db } from "@/db";
import { companyProjects, companies, contacts, activities, users, isLeadStatus } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { normalizeRole, can } from "@/lib/roles";

export async function updateCrmFields(companyProjectId: number, formData: FormData) {
  // Next.js Server Function'lar Proxy zincirinin disindadir (proxy matcher'i
  // bir yolu haric tutsa bile Server Function orada calisabilir) - bu yuzden
  // yetki kontrolu HER ZAMAN fonksiyonun kendi icinde yapilmali.
  const session = await getSession();
  if (!session) throw new Error("Oturum bulunamadı.");

  // Bu company_project kaydinin gercekten bu kullanicinin organizasyonuna ait
  // oldugunu dogrula (baska bir organizasyonun verisine yazilamaz).
  const [owned] = await db
    .select({ id: companyProjects.id })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(and(eq(companyProjects.id, companyProjectId), eq(companies.organizationId, session.organizationId)));
  if (!owned) throw new Error("Bu kayda erişim yetkiniz yok.");

  const leadStatusRaw = String(formData.get("leadStatus") ?? "yeni");
  // Gecersiz bir durum gonderilirse guvenli varsayilana duser (enum ihlali olmaz).
  const leadStatus = isLeadStatus(leadStatusRaw) ? leadStatusRaw : "yeni";
  const salesOwner = String(formData.get("salesOwner") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const nextFollowupDate = String(formData.get("nextFollowupDate") ?? "");

  await db
    .update(companyProjects)
    .set({
      leadStatus,
      salesOwner: salesOwner || null,
      notes: notes || null,
      nextFollowupDate: nextFollowupDate || null,
      lastContactDate: new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(companyProjects.id, companyProjectId));

  revalidatePath("/companies");
}

// ---------------------------------------------------------------------------
// CRM: Kisiler ve Aktiviteler (Phase 4)
//
// NOT: Kayit SILME islemi bilerek eklenmedi ("Database verisini silme" kurali).
// Yanlis girilen kayit duzenlenebilir; boylece gecmis izi korunur.
// ---------------------------------------------------------------------------

/** Oturum + CRM duzenleme yetkisi. Server Function'lar Proxy disinda calisabilir. */
async function authorizeCrm() {
  const session = await getSession();
  if (!session) throw new Error("Oturum bulunamadı.");
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!can.editCrm(normalizeRole(u?.role))) {
    throw new Error("CRM düzenleme yetkiniz yok.");
  }
  return session;
}

/** companyId gercekten bu organizasyona mi ait? */
async function assertCompanyOwned(organizationId: number, companyId: number) {
  const [owned] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.organizationId, organizationId)))
    .limit(1);
  if (!owned) throw new Error("Bu firmaya erişim yetkiniz yok.");
}

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v === "" ? null : v;
}

export async function createContactAction(companyId: number, formData: FormData) {
  const session = await authorizeCrm();
  await assertCompanyOwned(session.organizationId, companyId);

  const name = str(formData, "name");
  if (!name) return; // isimsiz kisi kaydedilmez

  const isPrimary = formData.get("isPrimary") === "on";
  if (isPrimary) {
    // Firmada tek bir birincil kisi olur.
    await db.update(contacts).set({ isPrimary: false }).where(eq(contacts.companyId, companyId));
  }

  await db.insert(contacts).values({
    organizationId: session.organizationId,
    companyId,
    name,
    position: str(formData, "position"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    whatsapp: str(formData, "whatsapp"),
    linkedin: str(formData, "linkedin"),
    notes: str(formData, "notes"),
    isPrimary,
  });

  revalidatePath(`/companies/${companyId}`);
}

export async function updateContactAction(contactId: number, formData: FormData) {
  const session = await authorizeCrm();

  // Kisi -> firma -> organizasyon zinciri dogrulanir (IDOR korumasi).
  const [owned] = await db
    .select({ companyId: contacts.companyId })
    .from(contacts)
    .innerJoin(companies, eq(companies.id, contacts.companyId))
    .where(and(eq(contacts.id, contactId), eq(companies.organizationId, session.organizationId)))
    .limit(1);
  if (!owned) throw new Error("Bu kişiye erişim yetkiniz yok.");

  const isPrimary = formData.get("isPrimary") === "on";
  if (isPrimary) {
    await db
      .update(contacts)
      .set({ isPrimary: false })
      .where(eq(contacts.companyId, owned.companyId));
  }

  await db
    .update(contacts)
    .set({
      name: str(formData, "name"),
      position: str(formData, "position"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      whatsapp: str(formData, "whatsapp"),
      linkedin: str(formData, "linkedin"),
      notes: str(formData, "notes"),
      isPrimary,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId));

  revalidatePath(`/companies/${owned.companyId}`);
}

/**
 * Aktivite kaydi ekler.
 *
 * Yan etki: companyProjects.lastContactDate aktivite tarihine cekilir ve
 * (verilmisse) nextFollowupDate guncellenir - boylece Takipler ekrani ve
 * firsat skorunun "guncellik" faktoru dogru calisir.
 */
export async function createActivityAction(companyProjectId: number, formData: FormData) {
  const session = await authorizeCrm();

  const [owned] = await db
    .select({ companyId: companyProjects.companyId })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(
      and(
        eq(companyProjects.id, companyProjectId),
        eq(companies.organizationId, session.organizationId)
      )
    )
    .limit(1);
  if (!owned) throw new Error("Bu kayda erişim yetkiniz yok.");

  const activityType = str(formData, "activityType") ?? "note";
  const dateRaw = str(formData, "activityDate");
  const activityDate = dateRaw ? new Date(dateRaw) : new Date();
  const nextFollowupDate = str(formData, "nextFollowupDate");

  // contactId gonderildiyse ayni firmaya ait oldugu dogrulanir.
  let contactId: number | null = null;
  const contactRaw = Number(formData.get("contactId"));
  if (Number.isFinite(contactRaw) && contactRaw > 0) {
    const [c] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactRaw), eq(contacts.companyId, owned.companyId)))
      .limit(1);
    contactId = c?.id ?? null;
  }

  await db.insert(activities).values({
    companyProjectId,
    contactId,
    createdBy: session.userId,
    activityType,
    activityDate: Number.isNaN(activityDate.getTime()) ? new Date() : activityDate,
    result: str(formData, "result"),
    notes: str(formData, "notes"),
    nextAction: str(formData, "nextAction"),
    nextFollowupDate,
  });

  await db
    .update(companyProjects)
    .set({
      lastContactDate: (Number.isNaN(activityDate.getTime()) ? new Date() : activityDate)
        .toISOString()
        .slice(0, 10),
      ...(nextFollowupDate ? { nextFollowupDate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(companyProjects.id, companyProjectId));

  revalidatePath(`/companies/${owned.companyId}`);
  revalidatePath("/crm/activities");
  revalidatePath("/crm/follow-ups");
}

/** Takipler ekranindan hizli durum/tarih guncellemesi. */
export async function quickUpdateLeadAction(companyProjectId: number, formData: FormData) {
  const session = await authorizeCrm();

  const [owned] = await db
    .select({ companyId: companyProjects.companyId })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(
      and(
        eq(companyProjects.id, companyProjectId),
        eq(companies.organizationId, session.organizationId)
      )
    )
    .limit(1);
  if (!owned) throw new Error("Bu kayda erişim yetkiniz yok.");

  const leadStatusRaw = String(formData.get("leadStatus") ?? "");
  const nextFollowupDate = str(formData, "nextFollowupDate");

  await db
    .update(companyProjects)
    .set({
      ...(isLeadStatus(leadStatusRaw) ? { leadStatus: leadStatusRaw } : {}),
      nextFollowupDate,
      updatedAt: new Date(),
    })
    .where(eq(companyProjects.id, companyProjectId));

  revalidatePath("/crm/follow-ups");
  revalidatePath("/crm/leads");
  revalidatePath(`/companies/${owned.companyId}`);
}
