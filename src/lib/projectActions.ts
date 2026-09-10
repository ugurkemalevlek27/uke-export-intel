"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/projectContext";

/**
 * Aktif projeyi degistirir.
 *
 * Server Function'lar Proxy zincirinin disinda calisabildigi icin yetki kontrolu
 * burada tekrar yapilir: secilen proje bu kullanicinin organizasyonuna ait degilse
 * cookie yazilmaz.
 */
export async function setActiveProjectAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const raw = String(formData.get("projectId") ?? "").trim();
  const store = await cookies();

  if (raw === "" || raw === "all") {
    store.set(ACTIVE_PROJECT_COOKIE, "all", { path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
    return;
  }

  if (!/^\d+$/.test(raw)) return;
  const projectId = Number(raw);

  const [owned] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, session.organizationId)))
    .limit(1);
  if (!owned) return; // baska organizasyonun projesi - sessizce yok say

  store.set(ACTIVE_PROJECT_COOKIE, String(projectId), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
