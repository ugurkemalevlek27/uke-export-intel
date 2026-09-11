"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { normalizeRole, can, ROLES, type Role } from "@/lib/roles";

function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}

async function authorize() {
  const session = await getSession();
  if (!session) throw new Error("Oturum bulunamadı.");
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const role = normalizeRole(u?.role);
  if (!can.manageUsers(role)) throw new Error("Kullanıcı yönetimi yetkiniz yok.");
  return { session, role };
}

export async function createUserAction(formData: FormData): Promise<void> {
  const { session, role: myRole } = await authorize();

  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim() || null;
  const roleRaw = String(formData.get("role") ?? "viewer");

  if (!email || !password) return;
  // Zayif sifre kabul edilmez.
  if (password.length < 10) throw new Error("Şifre en az 10 karakter olmalı.");

  // Kendi seviyenden yuksek rol atanamaz (yetki yukseltme engeli).
  const newRole: Role = isRole(roleRaw) ? roleRaw : "viewer";
  if (newRole === "super_admin" && myRole !== "super_admin") {
    throw new Error("Süper yönetici rolünü yalnızca bir süper yönetici atayabilir.");
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw new Error("Bu e-posta zaten kayıtlı.");

  await db.insert(users).values({
    organizationId: session.organizationId, // her zaman kendi organizasyonu
    email,
    name,
    role: newRole,
    passwordHash: await bcrypt.hash(password, 10),
  });

  revalidatePath("/admin/users");
}

export async function updateUserRoleAction(userId: number, formData: FormData): Promise<void> {
  const { session, role: myRole } = await authorize();

  const roleRaw = String(formData.get("role") ?? "");
  if (!isRole(roleRaw)) return;
  if (roleRaw === "super_admin" && myRole !== "super_admin") {
    throw new Error("Süper yönetici rolünü yalnızca bir süper yönetici atayabilir.");
  }

  // Hedef kullanici ayni organizasyonda mi?
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, session.organizationId)))
    .limit(1);
  if (!target) throw new Error("Bu kullanıcıya erişim yetkiniz yok.");

  // KILITLENME KORUMASI: organizasyonda en az bir yonetici kalmali.
  if (userId === session.userId && !can.manageUsers(roleRaw)) {
    const [{ admins }] = await db
      .select({ admins: sql<string>`COUNT(*)` })
      .from(users)
      .where(
        and(
          eq(users.organizationId, session.organizationId),
          ne(users.id, session.userId),
          sql`lower(${users.role}) IN ('admin', 'organization_admin', 'super_admin')`
        )
      );
    if (Number(admins) === 0) {
      throw new Error(
        "Kendi yönetici yetkinizi kaldıramazsınız — organizasyonda başka yönetici yok."
      );
    }
  }

  await db.update(users).set({ role: roleRaw }).where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

/**
 * Sifre sifirlama. Yeni sifreyi YONETICI yazar; sistem sifre uretmez ve
 * hicbir yerde duz metin saklamaz.
 */
export async function resetPasswordAction(userId: number, formData: FormData): Promise<void> {
  const { session } = await authorize();

  const password = String(formData.get("password") ?? "");
  if (password.length < 10) throw new Error("Şifre en az 10 karakter olmalı.");

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, session.organizationId)))
    .limit(1);
  if (!target) throw new Error("Bu kullanıcıya erişim yetkiniz yok.");

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 10) })
    .where(eq(users.id, userId));

  revalidatePath("/admin/users");
}
