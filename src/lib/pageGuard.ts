// Sayfa seviyesi yetki kontrolu (Phase 5)
//
// NEDEN GEREKLI? Navigasyonda bir ogeyi gizlemek yetki DEGILDIR: kullanici
// adresi dogrudan yazarak sayfaya gidebilir. Bu yuzden her korumali sayfa
// sunucu tarafinda tekrar kontrol edilir.
//
// Kullanim (Server Component icinde):
//   const guard = await guardPage("manageUsers");
//   if (!guard.allowed) return <AccessDenied title="Kullanıcılar" />;
//   const { session, role } = guard;

import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeRole, can, type Role } from "@/lib/roles";

export type Capability = keyof typeof can;

export type GuardResult =
  | { allowed: true; session: NonNullable<Awaited<ReturnType<typeof getSession>>>; role: Role }
  | { allowed: false; role: Role };

export async function guardPage(capability: Capability): Promise<GuardResult> {
  const session = await getSession();
  // Oturum yoksa Proxy zaten /login'e yonlendirir; yine de guvenli tarafta kal.
  if (!session) return { allowed: false, role: "viewer" };

  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const role = normalizeRole(u?.role);

  return can[capability](role) ? { allowed: true, session, role } : { allowed: false, role };
}

/** Rolu bilinen bir oturum dondurur (yetki kontrolu yapmadan). */
export async function sessionWithRole() {
  const session = await getSession();
  if (!session) return null;
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  return { session, role: normalizeRole(u?.role) };
}
