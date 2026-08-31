"use server";

import { db } from "@/db";
import { companyProjects, companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";

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

  const leadStatus = String(formData.get("leadStatus") ?? "yeni");
  const salesOwner = String(formData.get("salesOwner") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const nextFollowupDate = String(formData.get("nextFollowupDate") ?? "");

  await db
    .update(companyProjects)
    .set({
      leadStatus: leadStatus as any,
      salesOwner: salesOwner || null,
      notes: notes || null,
      nextFollowupDate: nextFollowupDate || null,
      lastContactDate: new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(companyProjects.id, companyProjectId));

  revalidatePath("/companies");
}
