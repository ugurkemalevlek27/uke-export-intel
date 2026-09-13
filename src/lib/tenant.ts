// Kiraci (tenant) kapsami — TEK ve YETKILI kaynak.
//
// TEMEL KURAL: Bir istegin hangi sirketin verisini gorecegi ASLA kullanicinin
// gonderdigi bir degerden (URL, form alani, query string, header) turetilmez.
// Daima SUNUCUDA, kullanicinin veritabanindaki kaydindan cozulur.
//
// MIMARI: Bu sistemde "sirket/client/tenant" = organizations tablosundaki bir
// satir. Her tablo zaten organization_id tasir ve tum sorgular bu kolonla
// sinirlanir (bkz. lib/filters.ts tradeWhere). Bu dosya yalnizca "bu istek
// icin hangi organizationId gecerli?" sorusunu cevaplar.
//
// TEK ISTISNA — platform yoneticisi (UKE): super_admin rolundeki kullanici
// birden fazla kiraciyi yonetir ve aralarinda gecis yapabilir. Bu gecis bir
// cerezde tutulur AMA cereze guvenilmez: her istekte kullanicinin gercekten
// super_admin olup olmadigi ve secilen organizasyonun var olup olmadigi
// veritabanindan dogrulanir. super_admin olmayan bir kullanicida cerez
// TAMAMEN YOK SAYILIR - yani cerezi elle degistirmek hicbir sey degistirmez.

import { cookies } from "next/headers";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "./auth";
import { normalizeRole, type Role } from "./roles";

/** Platform yoneticisinin sectigi kiraciyi tasiyan cerez. */
export const TENANT_COOKIE = "uke_tenant";

export interface TenantContext {
  /** Bu istekte gecerli olan kiraci. TUM sorgular bunu kullanmalidir. */
  organizationId: number;
  organizationName: string;
  /** Kullanicinin KENDI kiracisi (super_admin baskasina gecmis olabilir). */
  homeOrganizationId: number;
  role: Role;
  userId: number;
  /** Birden fazla kiraci gorebilen platform yoneticisi mi? */
  isPlatformAdmin: boolean;
  /** Su an kendi kiracisi disinda bir kiraciya bakiyor mu? */
  isImpersonating: boolean;
}

/**
 * Bir kullanicinin birden fazla kiraciya erisebilmesi YALNIZCA super_admin
 * rolune baglidir. Rol veritabanindan okunur, oturum jetonundan degil.
 */
function canSwitchTenant(role: Role): boolean {
  return role === "super_admin";
}

/**
 * Bu istek icin gecerli kiraci baglamini cozer.
 *
 * Oturum yoksa null doner (Proxy zaten /login'e yonlendirir; yine de guvenli
 * tarafta kalinir).
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getSession();
  if (!session) return null;

  // Rol ve kiraci DAIMA veritabanindan okunur: jetondaki deger eski kalmis
  // olabilir (kullanici baska kiraciya tasinmis ya da rolu dusurulmus olabilir).
  const [u] = await db
    .select({ organizationId: users.organizationId, role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!u) return null; // kullanici silinmis: erisim yok

  const role = normalizeRole(u.role);
  const homeOrganizationId = u.organizationId;
  const isPlatformAdmin = canSwitchTenant(role);

  let organizationId = homeOrganizationId;

  if (isPlatformAdmin) {
    const store = await cookies();
    const raw = store.get(TENANT_COOKIE)?.value;
    const requested = raw === undefined ? NaN : Number(raw);
    if (Number.isInteger(requested) && requested !== homeOrganizationId) {
      // Secilen kiraci GERCEKTEN var mi? Yoksa kendi kiracisina duser.
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, requested))
        .limit(1);
      if (org) organizationId = org.id;
    }
  }

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return {
    organizationId,
    organizationName: org?.name ?? "—",
    homeOrganizationId,
    role,
    userId: session.userId,
    isPlatformAdmin,
    isImpersonating: organizationId !== homeOrganizationId,
  };
}

/**
 * Sorgularda kullanilacak organizationId. Oturum yoksa hata firlatir —
 * "kapsamsiz sorgu" calistirilmasindansa istegin patlamasi tercih edilir.
 */
export async function requireOrganizationId(): Promise<number> {
  const ctx = await getTenantContext();
  if (!ctx) throw new Error("Oturum bulunamadı.");
  return ctx.organizationId;
}

/** Kullanicinin gecis yapabilecegi kiracilar (super_admin degilse yalnizca kendisi). */
export async function listAccessibleTenants(): Promise<{ id: number; name: string }[]> {
  const ctx = await getTenantContext();
  if (!ctx) return [];
  if (!ctx.isPlatformAdmin) {
    return [{ id: ctx.organizationId, name: ctx.organizationName }];
  }
  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .orderBy(organizations.name);
}
