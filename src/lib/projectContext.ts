// Aktif proje (client workspace) context'i - Phase 1
//
// Sistem ileride ayni organizasyon altinda birden fazla musteri projesi barindiracak:
//   "ACC Ambalaj - USA", "Coral Paints - Russia", "G-SORB - Spain" ...
// Secilen proje TUM analiz ekranlarina context olarak gecer.
//
// GUVENLIK: Cookie'deki proje id'sine ASLA guvenilmez. Her okumada, projenin
// gercekten oturumdaki organizasyona ait oldugu veritabanindan dogrulanir.
// Aksi halde kullanici cookie'yi elle degistirerek baska bir organizasyonun
// projesini secebilirdi (IDOR).

import { cookies } from "next/headers";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";

export const ACTIVE_PROJECT_COOKIE = "uke_active_project";

export interface ProjectSummary {
  id: number;
  name: string;
  clientName: string | null;
  productGroup: string | null;
  status: string;
}

/** Bu organizasyonun projelerini listeler (proje secici icin). */
export async function listProjects(organizationId: number): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      productGroup: projects.productGroup,
      status: projects.status,
    })
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .orderBy(asc(projects.name));
  return rows;
}

/**
 * Aktif proje id'sini dondurur.
 *
 * - Cookie yoksa veya "all" ise: undefined (= tum projeler, organizasyon geneli).
 * - Cookie varsa: projenin bu organizasyona ait oldugu DOGRULANIR; degilse undefined.
 *
 * Donen deger dogrudan TradeFilters.projectId olarak kullanilabilir.
 */
export async function getActiveProjectId(organizationId: number): Promise<number | undefined> {
  const store = await cookies();
  const raw = store.get(ACTIVE_PROJECT_COOKIE)?.value;
  if (!raw || raw === "all") return undefined;
  if (!/^\d+$/.test(raw)) return undefined;

  const projectId = Number(raw);
  const [owned] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);

  return owned ? owned.id : undefined;
}

/** Aktif projenin detayini dondurur (baslikta gostermek icin). */
export async function getActiveProject(
  organizationId: number
): Promise<ProjectSummary | null> {
  const id = await getActiveProjectId(organizationId);
  if (id === undefined) return null;
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      productGroup: projects.productGroup,
      status: projects.status,
    })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}
