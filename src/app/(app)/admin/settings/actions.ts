"use server";

import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { normalizeRole, can } from "@/lib/roles";

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Oturum bulunamadı.");
  return session;
}

export async function updateOrganizationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!can.manageUsers(normalizeRole(u?.role))) {
    throw new Error("Organizasyon ayarlarını değiştirme yetkiniz yok.");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  // Her zaman oturumun organizasyonu guncellenir; istemciden id alinmaz.
  await db.update(organizations).set({ name }).where(eq(organizations.id, session.organizationId));
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

/**
 * Kullanicinin KENDI sifresini degistirmesi.
 * Mevcut sifre dogrulanmadan degisiklik yapilmaz (oturum calinmasina karsi).
 */
export async function changeOwnPasswordAction(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Oturum bulunamadı." };

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 10) return { error: "Yeni şifre en az 10 karakter olmalı." };
  if (next !== confirm) return { error: "Yeni şifre tekrarı eşleşmiyor." };
  if (next === current) return { error: "Yeni şifre mevcut şifreyle aynı olamaz." };

  const [u] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!u) return { error: "Kullanıcı bulunamadı." };

  const ok = await bcrypt.compare(current, u.passwordHash);
  if (!ok) return { error: "Mevcut şifre hatalı." };

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(next, 10) })
    .where(eq(users.id, session.userId));

  return { ok: true };
}
