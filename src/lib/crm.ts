// CRM sorgulari (Phase 4)
//
// GUVENLIK: Kisi ve aktivite kayitlari firma uzerinden organizasyona baglidir.
// Her sorgu organizationId ile scope edilir; yalnizca companyId/companyProjectId
// ile filtrelemek yeterli sayilmaz (savunma derinligi).

import { db } from "@/db";
import { activities, companies, companyProjects, contacts, projects, users } from "@/db/schema";
import { and, asc, desc, eq, lte, sql, isNotNull } from "drizzle-orm";

export interface ContactRow {
  id: number;
  name: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  isPrimary: boolean | null;
  notes: string | null;
}

export async function getCompanyContacts(
  organizationId: number,
  companyId: number
): Promise<ContactRow[]> {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      position: contacts.position,
      email: contacts.email,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
      linkedin: contacts.linkedin,
      isPrimary: contacts.isPrimary,
      notes: contacts.notes,
    })
    .from(contacts)
    .innerJoin(companies, eq(companies.id, contacts.companyId))
    .where(and(eq(contacts.companyId, companyId), eq(companies.organizationId, organizationId)))
    .orderBy(desc(contacts.isPrimary), asc(contacts.name));
}

export interface ActivityRow {
  id: number;
  activityType: string | null;
  activityDate: Date;
  result: string | null;
  notes: string | null;
  nextAction: string | null;
  nextFollowupDate: string | null;
  contactName: string | null;
  userName: string | null;
}

export async function getCompanyActivities(
  organizationId: number,
  companyProjectId: number,
  limit = 50
): Promise<ActivityRow[]> {
  return db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      activityDate: activities.activityDate,
      result: activities.result,
      notes: activities.notes,
      nextAction: activities.nextAction,
      nextFollowupDate: activities.nextFollowupDate,
      contactName: contacts.name,
      userName: users.name,
    })
    .from(activities)
    .innerJoin(companyProjects, eq(companyProjects.id, activities.companyProjectId))
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .leftJoin(contacts, eq(contacts.id, activities.contactId))
    .leftJoin(users, eq(users.id, activities.createdBy))
    .where(
      and(eq(activities.companyProjectId, companyProjectId), eq(companies.organizationId, organizationId))
    )
    .orderBy(desc(activities.activityDate))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Lead pipeline
// ---------------------------------------------------------------------------

export interface PipelineRow {
  leadStatus: string;
  count: number;
  totalValueUsd: number;
}

export async function getLeadPipeline(
  organizationId: number,
  projectId?: number
): Promise<PipelineRow[]> {
  const rows = await db
    .select({
      leadStatus: companyProjects.leadStatus,
      count: sql<string>`COUNT(*)`,
      totalValueUsd: sql<string>`COALESCE(SUM(${companyProjects.estimatedValueUsd}), 0)`,
    })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(
      and(
        eq(companies.organizationId, organizationId),
        sql`${companies.mergedIntoId} IS NULL`,
        ...(projectId === undefined ? [] : [eq(companyProjects.projectId, projectId)])
      )
    )
    .groupBy(companyProjects.leadStatus);

  return rows.map((r) => ({
    leadStatus: String(r.leadStatus),
    count: Number(r.count) || 0,
    totalValueUsd: Number(r.totalValueUsd) || 0,
  }));
}

export interface LeadRow {
  companyProjectId: number;
  companyId: number;
  companyName: string;
  country: string | null;
  projectName: string | null;
  leadStatus: string;
  leadScore: number | null;
  leadScoreLabel: string | null;
  salesOwner: string | null;
  nextFollowupDate: string | null;
  lastContactDate: string | null;
}

export async function getLeads(
  organizationId: number,
  opts: { projectId?: number; status?: string; limit?: number } = {}
): Promise<LeadRow[]> {
  return db
    .select({
      companyProjectId: companyProjects.id,
      companyId: companies.id,
      companyName: companies.name,
      country: companies.country,
      projectName: projects.name,
      leadStatus: sql<string>`${companyProjects.leadStatus}::text`,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
      salesOwner: companyProjects.salesOwner,
      nextFollowupDate: companyProjects.nextFollowupDate,
      lastContactDate: companyProjects.lastContactDate,
    })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .leftJoin(projects, eq(projects.id, companyProjects.projectId))
    .where(
      and(
        eq(companies.organizationId, organizationId),
        sql`${companies.mergedIntoId} IS NULL`,
        ...(opts.projectId === undefined ? [] : [eq(companyProjects.projectId, opts.projectId)]),
        ...(opts.status ? [sql`${companyProjects.leadStatus}::text = ${opts.status}`] : [])
      )
    )
    .orderBy(desc(companyProjects.leadScore))
    .limit(opts.limit ?? 200);
}

// ---------------------------------------------------------------------------
// Aktivite akisi ve takipler
// ---------------------------------------------------------------------------

export async function getRecentActivities(
  organizationId: number,
  projectId: number | undefined,
  limit = 100
) {
  return db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      activityDate: activities.activityDate,
      result: activities.result,
      notes: activities.notes,
      nextAction: activities.nextAction,
      nextFollowupDate: activities.nextFollowupDate,
      companyId: companies.id,
      companyName: companies.name,
      contactName: contacts.name,
      userName: users.name,
    })
    .from(activities)
    .innerJoin(companyProjects, eq(companyProjects.id, activities.companyProjectId))
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .leftJoin(contacts, eq(contacts.id, activities.contactId))
    .leftJoin(users, eq(users.id, activities.createdBy))
    .where(
      and(
        eq(companies.organizationId, organizationId),
        ...(projectId === undefined ? [] : [eq(companyProjects.projectId, projectId)])
      )
    )
    .orderBy(desc(activities.activityDate))
    .limit(limit);
}

export interface FollowUpRow {
  companyProjectId: number;
  companyId: number;
  companyName: string;
  country: string | null;
  leadStatus: string;
  leadScore: number | null;
  leadScoreLabel: string | null;
  salesOwner: string | null;
  nextFollowupDate: string;
  /** Bugune gore gecikmis mi */
  overdue: boolean;
  daysUntil: number;
}

/** Takip tarihi olan lead'ler - gecikmisler once. */
export async function getFollowUps(
  organizationId: number,
  projectId?: number,
  horizonDays = 30
): Promise<FollowUpRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + horizonDays * 86_400_000).toISOString().slice(0, 10);

  const rows = await db
    .select({
      companyProjectId: companyProjects.id,
      companyId: companies.id,
      companyName: companies.name,
      country: companies.country,
      leadStatus: sql<string>`${companyProjects.leadStatus}::text`,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
      salesOwner: companyProjects.salesOwner,
      nextFollowupDate: companyProjects.nextFollowupDate,
    })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(
      and(
        eq(companies.organizationId, organizationId),
        sql`${companies.mergedIntoId} IS NULL`,
        isNotNull(companyProjects.nextFollowupDate),
        lte(companyProjects.nextFollowupDate, horizon),
        ...(projectId === undefined ? [] : [eq(companyProjects.projectId, projectId)])
      )
    )
    .orderBy(asc(companyProjects.nextFollowupDate));

  const todayMs = new Date(today).getTime();
  return rows
    .filter((r): r is typeof r & { nextFollowupDate: string } => !!r.nextFollowupDate)
    .map((r) => {
      const dueMs = new Date(r.nextFollowupDate).getTime();
      const daysUntil = Math.round((dueMs - todayMs) / 86_400_000);
      return {
        companyProjectId: r.companyProjectId,
        companyId: r.companyId,
        companyName: r.companyName,
        country: r.country,
        leadStatus: r.leadStatus,
        leadScore: r.leadScore,
        leadScoreLabel: r.leadScoreLabel,
        salesOwner: r.salesOwner,
        nextFollowupDate: r.nextFollowupDate,
        overdue: daysUntil < 0,
        daysUntil,
      };
    });
}

export const ACTIVITY_TYPES = [
  "email",
  "phone",
  "whatsapp",
  "linkedin",
  "meeting",
  "note",
] as const;

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  email: "E-posta",
  phone: "Telefon",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  meeting: "Toplantı",
  note: "Not",
};
