import { db } from "@/db";
import { companies, companyProjects, tradeRecords, projects, importBatches } from "@/db/schema";
import { and, eq, sql, desc, isNull } from "drizzle-orm";

export async function getDashboardStats(organizationId: number) {
  const [totals] = await db
    .select({
      totalCompanies: sql<number>`COUNT(DISTINCT ${companies.id})`,
      totalValueUsd: sql<string>`COALESCE(SUM(${tradeRecords.valueUsd}), 0)`,
      totalRecords: sql<number>`COUNT(${tradeRecords.id})`,
    })
    .from(tradeRecords)
    .leftJoin(companies, eq(companies.id, tradeRecords.companyId))
    .where(eq(tradeRecords.organizationId, organizationId));

  const [{ highPotentialCount }] = await db
    .select({ highPotentialCount: sql<number>`COUNT(*)` })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(and(eq(companies.organizationId, organizationId), eq(companyProjects.leadScoreLabel, "Yuksek Potansiyel")));

  const byCountry = await db
    .select({
      country: tradeRecords.importerCountry,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      companyCount: sql<number>`COUNT(DISTINCT ${tradeRecords.companyId})`,
    })
    .from(tradeRecords)
    .where(eq(tradeRecords.organizationId, organizationId))
    .groupBy(tradeRecords.importerCountry)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`));

  const topCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      country: companies.country,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
    })
    .from(companyProjects)
    .innerJoin(companies, eq(companies.id, companyProjects.companyId))
    .where(eq(companies.organizationId, organizationId))
    .orderBy(desc(companyProjects.leadScore))
    .limit(8);

  const recentImports = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.organizationId, organizationId))
    .orderBy(desc(importBatches.createdAt))
    .limit(5);

  return {
    totalCompanies: Number(totals?.totalCompanies ?? 0),
    totalValueUsd: Number(totals?.totalValueUsd ?? 0),
    totalRecords: Number(totals?.totalRecords ?? 0),
    highPotentialCount: Number(highPotentialCount ?? 0),
    byCountry,
    topCompanies,
    recentImports,
  };
}

export interface CompanyListFilters {
  search?: string;
  country?: string;
  minScore?: number;
  status?: string;
}

export async function getCompaniesList(organizationId: number, filters: CompanyListFilters = {}) {
  const conditions = [eq(companies.organizationId, organizationId)];

  if (filters.country) {
    conditions.push(eq(companies.country, filters.country));
  }
  if (filters.status) {
    conditions.push(eq(companyProjects.leadStatus, filters.status as any));
  }

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      country: companies.country,
      companyType: companies.companyType,
      leadScore: companyProjects.leadScore,
      leadScoreLabel: companyProjects.leadScoreLabel,
      leadStatus: companyProjects.leadStatus,
      salesOwner: companyProjects.salesOwner,
      nextFollowupDate: companyProjects.nextFollowupDate,
      possibleDuplicateOfId: companies.possibleDuplicateOfId,
    })
    .from(companies)
    .leftJoin(companyProjects, eq(companyProjects.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(companyProjects.leadScore));

  let filtered = rows;
  if (filters.search) {
    const s = filters.search.toLowerCase();
    filtered = filtered.filter((r) => r.name.toLowerCase().includes(s));
  }
  if (filters.minScore !== undefined) {
    filtered = filtered.filter((r) => (r.leadScore ?? 0) >= filters.minScore!);
  }
  return filtered;
}

export async function getCompanyDetail(organizationId: number, companyId: number) {
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.organizationId, organizationId)));
  if (!company) return null;

  const [cp] = await db
    .select()
    .from(companyProjects)
    .where(eq(companyProjects.companyId, companyId));

  const records = await db
    .select()
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, companyId))
    .orderBy(desc(tradeRecords.transactionDate));

  const byYear = await db
    .select({
      year: sql<string>`EXTRACT(YEAR FROM ${tradeRecords.transactionDate})`,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
    })
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, companyId))
    .groupBy(sql`EXTRACT(YEAR FROM ${tradeRecords.transactionDate})`);

  const bySupplier = await db
    .select({
      supplier: tradeRecords.exporterNameRaw,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
      shipmentCount: sql<number>`COUNT(*)`,
    })
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, companyId))
    .groupBy(tradeRecords.exporterNameRaw)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`));

  const byProduct = await db
    .select({
      product: tradeRecords.productDescription,
      hsCode: tradeRecords.hsCode,
      totalValueUsd: sql<string>`SUM(${tradeRecords.valueUsd})`,
    })
    .from(tradeRecords)
    .where(eq(tradeRecords.companyId, companyId))
    .groupBy(tradeRecords.productDescription, tradeRecords.hsCode)
    .orderBy(desc(sql`SUM(${tradeRecords.valueUsd})`))
    .limit(20);

  return { company, companyProject: cp ?? null, records, byYear, bySupplier, byProduct };
}
