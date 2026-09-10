import { getSession } from "@/lib/auth";
import { getActiveProjectId, getActiveProject } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getDashboardOverview, getFilterOptions } from "@/lib/analytics";
import { getCountryMapData } from "@/lib/queries";
import { GlobalFilterBar } from "@/components/GlobalFilterBar";
import { ExportWorldMap } from "@/components/WorldMap";
import { TrendBars, DistributionBars } from "@/components/charts";
import { PageHeader, KpiCard, ScoreBadge, EmptyState, formatUsd } from "@/components/ui";
import { LEAD_STATUS_LABELS } from "@/lib/leadStatus";
import Link from "next/link";

/**
 * Dashboard V2 (Phase 2)
 *
 * Yonetici ozeti ekrani: filtrelenmis veri kumesi uzerinden KPI'lar, trend,
 * dagilimlar ve dogrudan aksiyon alinabilecek "en iyi firsatlar" tablosu.
 * Tum hesaplamalar veritabaninda yapilir.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  const organizationId = session!.organizationId;

  const sp = await searchParams;
  const parsed = parseTradeFilters(sp);
  const activeProjectId = await getActiveProjectId(organizationId);
  const filters = { ...parsed, projectId: parsed.projectId ?? activeProjectId };

  const [overview, filterOptions, mapPoints, activeProject] = await Promise.all([
    getDashboardOverview(organizationId, filters),
    getFilterOptions(organizationId, filters),
    getCountryMapData(organizationId, filters.projectId),
    getActiveProject(organizationId),
  ]);

  const { kpis } = overview;
  const q = filtersToQuery(filters);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Dashboard"
        description={
          activeProject
            ? `${activeProject.clientName ? activeProject.clientName + " — " : ""}${activeProject.name} projesinin ihracat istihbaratı özeti`
            : "Tüm projelerin ihracat istihbaratı özeti"
        }
      />

      <GlobalFilterBar options={filterOptions} />

      {kpis.transactionCount === 0 ? (
        <EmptyState text="Bu filtrelerle eşleşen kayıt yok. Veri İçe Aktar sayfasından başlayabilir veya filtreleri sıfırlayabilirsiniz." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <KpiCard label="TOPLAM TİCARET" value={formatUsd(kpis.totalValueUsd)} />
            <KpiCard label="FİRMA" value={overview.companyCount.toLocaleString("tr-TR")} />
            <KpiCard label="ÜLKE" value={kpis.countryCount.toLocaleString("tr-TR")} />
            <KpiCard label="SEVKİYAT" value={kpis.totalShipments.toLocaleString("tr-TR")} />
            <KpiCard
              label="YÜKSEK FIRSAT"
              value={overview.highOpportunityCount.toLocaleString("tr-TR")}
              sub="70+ puanlı firma"
            />
            <KpiCard
              label="AKTİF LEAD"
              value={overview.activeLeadCount.toLocaleString("tr-TR")}
              sub="kapanmamış"
            />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Ticaret Trendi</h2>
            <p className="text-xs text-slate-400 mb-4">
              {kpis.firstTransactionDate ?? "Not Available"} — {kpis.lastTransactionDate ?? "Not Available"}
            </p>
            <TrendBars points={overview.trend} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Ülke Dağılımı</h2>
                <Link href={`/trade/countries${q}`} className="text-xs text-slate-500 hover:text-slate-900">
                  Ülke Analizi →
                </Link>
              </div>
              <DistributionBars
                rows={overview.topCountries.slice(0, 8).map((c) => ({
                  label: c.country ?? "Not Available",
                  value: c.totalValueUsd,
                  sub: `%${c.marketSharePct.toFixed(1)}`,
                }))}
              />
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">GTİP Dağılımı</h2>
                <Link href={`/trade/products${q}`} className="text-xs text-slate-500 hover:text-slate-900">
                  Ürün Analizi →
                </Link>
              </div>
              <DistributionBars
                rows={overview.topHs.map((h) => ({
                  label: h.code ?? "Not Available",
                  value: h.totalValueUsd,
                  sub: `${h.importerCount} firma`,
                }))}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Dünya Haritası</h2>
            <p className="text-xs text-slate-400 mb-2">Bir ülkeye tıklayarak detaylı analize gidebilirsiniz.</p>
            <ExportWorldMap points={mapPoints} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">En İyi Fırsatlar</h2>
                <p className="text-xs text-slate-400 mt-0.5">Fırsat Skoruna göre sıralı</p>
              </div>
              <Link href="/companies" className="text-xs text-slate-500 hover:text-slate-900">
                Tüm firmalar →
              </Link>
            </div>
            {overview.topOpportunities.length === 0 ? (
              <EmptyState text="Henüz firma yok." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="pb-2 font-medium">Firma</th>
                      <th className="pb-2 font-medium">Ülke</th>
                      <th className="pb-2 pr-4 font-medium text-right">Ticaret Değeri</th>
                      <th className="pb-2 pr-6 font-medium text-right">İşlem</th>
                      <th className="pb-2 font-medium">Fırsat Skoru</th>
                      <th className="pb-2 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.topOpportunities.map((o) => (
                      <tr key={o.companyId} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5">
                          <Link href={`/companies/${o.companyId}`} className="text-slate-800 hover:underline font-medium">
                            {o.name}
                          </Link>
                        </td>
                        <td className="py-2.5 text-slate-500">{o.country ?? "Unknown"}</td>
                        <td className="py-2.5 pr-4 text-right font-medium text-slate-900 tabular-nums">
                          {formatUsd(o.totalValueUsd)}
                        </td>
                        <td className="py-2.5 pr-6 text-right text-slate-500 tabular-nums">{o.transactionCount}</td>
                        <td className="py-2.5">
                          <ScoreBadge score={o.leadScore} label={o.leadScoreLabel} />
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {o.leadStatus ? LEAD_STATUS_LABELS[o.leadStatus] ?? o.leadStatus : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
