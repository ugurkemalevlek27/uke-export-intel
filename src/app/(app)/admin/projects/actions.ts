"use server";

import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { normalizeRole, can } from "@/lib/roles";

const STATUSES = ["active", "paused", "completed", "archived"] as const;
type ProjectStatus = (typeof STATUSES)[number];
function isStatus(v: string): v is ProjectStatus {
  return (STATUSES as readonly string[]).includes(v);
}

/** Oturum + proje yonetimi yetkisi (Server Function'lar Proxy disinda calisabilir). */
async function authorize() {
  const session = await getSession();
  if (!session) throw new Error("Oturum bulunamadı.");
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!can.manageProjects(normalizeRole(u?.role))) {
    throw new Error("Proje yönetimi yetkiniz yok.");
  }
  return session;
}

function str(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
}

/** Virgullu listeyi diziye cevirir ("TR, AZ" -> ["TR","AZ"]). Bos ise null. */
function list(fd: FormData, key: string): string[] | null {
  const raw = str(fd, key);
  if (!raw) return null;
  const arr = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

export async function createProjectAction(formData: FormData) {
  const session = await authorize();
  const name = str(formData, "name");
  if (!name) return;

  await db.insert(projects).values({
    organizationId: session.organizationId,
    name,
    clientName: str(formData, "clientName"),
    productGroup: str(formData, "productGroup"),
    description: str(formData, "description"),
    targetCountries: list(formData, "targetCountries"),
    hsCodes: list(formData, "hsCodes"),
    dateFrom: str(formData, "dateFrom"),
    dateTo: str(formData, "dateTo"),
    createdBy: session.userId,
  });

  revalidatePath("/admin/projects");
  revalidatePath("/", "layout");
}

/**
 * Proje bilgilerini gunceller.
 *
 * NOT: Proje SILINMEZ - "archived" durumu vardir. Bir projeyi silmek ona bagli
 * tum ticaret kayitlarini ve lead gecmisini kopartirdi ("Database verisini silme").
 */
export async function updateProjectAction(projectId: number, formData: FormData) {
  const session = await authorize();

  const [owned] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, session.organizationId)))
    .limit(1);
  if (!owned) throw new Error("Bu projeye erişim yetkiniz yok.");

  const name = str(formData, "name");
  const statusRaw = String(formData.get("status") ?? "");

  await db
    .update(projects)
    .set({
      ...(name ? { name } : {}),
      ...(isStatus(statusRaw) ? { status: statusRaw } : {}),
      clientName: str(formData, "clientName"),
      productGroup: str(formData, "productGroup"),
      description: str(formData, "description"),
      targetCountries: list(formData, "targetCountries"),
      hsCodes: list(formData, "hsCodes"),
      dateFrom: str(formData, "dateFrom"),
      dateTo: str(formData, "dateTo"),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  revalidatePath("/admin/projects");
  revalidatePath("/", "layout");
}
