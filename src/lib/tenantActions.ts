"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTenantContext, TENANT_COOKIE } from "./tenant";

/**
 * Platform yoneticisinin (UKE) aktif kiraciyi degistirmesi.
 *
 * GUVENLIK: Yetki kontrolu BURADA yapilir, arayuzde degil. Bu bir Server
 * Function'dir ve Proxy zincirinin disinda cagrilabilir; bu yuzden "bu
 * kullanici gercekten super_admin mi?" sorusu her cagriyla veritabanindan
 * yeniden sorulur. super_admin olmayan bir kullanici bu fonksiyonu dogrudan
 * cagirsa bile cerez YAZILMAZ - ve yazilsa bile getTenantContext onu yok sayar.
 * Yani koruma iki kat: burada ve okuma tarafinda.
 */
export async function setActiveTenantAction(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  if (!ctx) return;
  if (!ctx.isPlatformAdmin) return; // sessizce yok say - bilgi sizdirma

  const raw = String(formData.get("organizationId") ?? "").trim();
  if (!/^\d+$/.test(raw)) return;
  const requested = Number(raw);

  // Secilen kiraci gercekten var mi?
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, requested))
    .limit(1);
  if (!org) return;

  const store = await cookies();
  store.set(TENANT_COOKIE, String(org.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  // Kiraci degisti: proje secimi artik gecersiz (baska kiracinin projesiydi).
  const { ACTIVE_PROJECT_COOKIE } = await import("./projectContext");
  store.delete(ACTIVE_PROJECT_COOKIE);

  revalidatePath("/", "layout");
}
