import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getSupplierList, getTradeKpis, getFilterOptions, getCompetitorRanking } from "@/lib/analytics";
import { GlobalFilterBar } from "@/components/GlobalFilterBar";
import { ExportButtons } from "@/components/ExportButtons";
import { PageHeader, KpiCard, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

/**
 * Tedarikci Analizi (Phase 2)
 *
 * Rakip platformdaki "Predo Analizi"nin karsiligi, ancak tek bir "kendi firmamiz"
 * yerine veri icindeki HERHANGI bir tedarikci secilebilir - boylece hem kendi/musteri
 * performansi hem rakip analizi ayni ekranda yapilir.
 */
export default async function SuppliersPage({
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

  const [ranking, kpis, filterOptions] = await Promise.all([
    getCompetitorRanking(organizationId, filters, 100),
    getTradeKpis(organizationId, filters),
    getFilterOptions(organizationId, filters),
  ]);
  const list = await getSupplierList(organizationId, filters, 100);
  const customersByName = new Map(list.map((s) => [s.name, s]));

  const q = filtersToQuery(filters);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Tedarikçi Analizi"
        description="Bu pazara satış yapan tedarikçiler, pazar payları ve sıralamaları."
      />

      <GlobalFilterBar options={filterOptions} />

      {kpis.transactionCount === 0 ? (
        <EmptyState text="Bu filtrelerle eşleşen kayıt yok." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="TEDARİKÇİ SAYISI" value={kpis.exporterCount.toLocaleString("tr-TR")} />
            <KpiCard label="TOPLAM PAZAR" value={formatUsd(kpis.totalValueUsd)} />
            <KpiCard label="ALICI FİRMA" value={kpis.importerCount.toLocaleString("tr-TR")} />
            <KpiCard label="ÜLKE" value={String(kpis.countryCount)} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Pazar Payı Sıralaması</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Performans raporu için bir tedarikçiye tıklayın.
                </p>
              </div>
              <ExportButtons dataset="suppliers" query={q} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 font-medium text-right w-10">#</th>
                    <th className="pb-2 font-medium">Tedarikçi</th>
                    <th className="pb-2 font-medium text-right">Satış</th>
                    <th className="pb-2 font-medium text-right">Pazar Payı</th>
                    <th className="pb-2 font-medium text-right">Müşteri</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <tr key={r.exporterName} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 text-right text-slate-400 tabular-nums pr-3">{r.rank}</td>
                      <td className="py-2.5">
                        <Link
                          href={`/trade/suppliers/${encodeURIComponent(r.exporterName)}${q}`}
                          className="text-slate-800 hover:underline"
                        >
                          {r.exporterName}
                        </Link>
                      </td>
                      <td className="py-2.5 text-right font-medium text-slate-900 tabular-nums">
                        {formatUsd(r.totalValueUsd)}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-slate-800 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(2, r.marketSharePct))}%` }}
                            />
                          </div>
                          <span className="text-slate-700 font-medium w-12 text-right tabular-nums">
                            %{r.marketSharePct.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-slate-500 tabular-nums">
                        {customersByName.get(r.exporterName)?.customerCount ?? r.customerCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
