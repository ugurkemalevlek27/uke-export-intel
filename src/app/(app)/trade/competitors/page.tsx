import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getCompetitorRanking, getCompetitorMatrix, getTradeKpis, getFilterOptions } from "@/lib/analytics";
import { GlobalFilterBar } from "@/components/GlobalFilterBar";
import { PageHeader, KpiCard, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

/**
 * Rakip Analizi (Phase 3)
 *
 * Tedarikci Analizi "bir tedarikciyi derinlemesine" incelerken, bu ekran
 * rakipleri YAN YANA karsilastirir: hangi rakip hangi pazarda / üründe guclu?
 * Matris, ileride network graph'a donusturulebilecek sekilde (rakip -> boyut
 * iliskisi) yapilandirilmistir.
 */
export default async function CompetitorsPage({
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

  const dimRaw = Array.isArray(sp.dim) ? sp.dim[0] : sp.dim;
  const dimension: "country" | "hs4" = dimRaw === "hs4" ? "hs4" : "country";

  const [kpis, ranking, matrix, filterOptions] = await Promise.all([
    getTradeKpis(organizationId, filters),
    getCompetitorRanking(organizationId, filters, 15),
    getCompetitorMatrix(organizationId, filters, dimension, 10, 8),
    getFilterOptions(organizationId, filters),
  ]);

  const q = filtersToQuery(filters);
  const maxCell = Math.max(...matrix.cells.flat(), 1);

  return (
    <div className="p-8 max-w-[1400px]">
      <PageHeader
        title="Rakip Analizi"
        description="Rakip tedarikçilerin hangi pazarda ve üründe güçlü olduğunun karşılaştırması."
      />

      <GlobalFilterBar options={filterOptions} />

      {kpis.transactionCount === 0 ? (
        <EmptyState text="Bu filtrelerle eşleşen kayıt yok." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <KpiCard label="RAKİP SAYISI" value={kpis.exporterCount.toLocaleString("tr-TR")} />
            <KpiCard label="TOPLAM PAZAR" value={formatUsd(kpis.totalValueUsd)} />
            <KpiCard label="ALICI FİRMA" value={kpis.importerCount.toLocaleString("tr-TR")} />
            <KpiCard label="ÜLKE" value={String(kpis.countryCount)} />
            <KpiCard label="ÜRÜN (GTİP)" value={String(kpis.hsCodeCount)} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Rakip Yoğunluk Matrisi</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Koyu hücre = o rakibin o {dimension === "country" ? "pazarda" : "üründe"} yüksek satışı.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Link
                  href={`/trade/competitors${filtersToQuery(filters, { dim: "country" })}`}
                  className={`px-2 py-1 rounded border ${
                    dimension === "country"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Ülkeye göre
                </Link>
                <Link
                  href={`/trade/competitors${filtersToQuery(filters, { dim: "hs4" })}`}
                  className={`px-2 py-1 rounded border ${
                    dimension === "hs4"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  GTİP&apos;e göre
                </Link>
              </div>
            </div>

            {matrix.competitors.length === 0 ? (
              <EmptyState text="Matris için yeterli veri yok." />
            ) : (
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left text-xs text-slate-400 font-medium pb-2 pr-4 sticky left-0 bg-white">
                        Rakip
                      </th>
                      {matrix.columns.map((c) => (
                        <th key={c} className="text-xs text-slate-400 font-medium pb-2 px-2 whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                      <th className="text-xs text-slate-400 font-medium pb-2 pl-4 text-right whitespace-nowrap">
                        Toplam
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.competitors.map((comp, ri) => (
                      <tr key={comp}>
                        <td className="pr-4 py-1 max-w-[260px] truncate sticky left-0 bg-white" title={comp}>
                          <Link
                            href={`/trade/suppliers/${encodeURIComponent(comp)}${q}`}
                            className="text-slate-800 hover:underline text-xs"
                          >
                            {comp}
                          </Link>
                        </td>
                        {matrix.cells[ri].map((v, ci) => {
                          const intensity = v / maxCell;
                          return (
                            <td key={ci} className="px-1 py-1">
                              <div
                                className="rounded text-[10px] text-center py-1.5 px-1 tabular-nums whitespace-nowrap"
                                style={{
                                  backgroundColor:
                                    v === 0 ? "#f8fafc" : `rgba(20, 88, 110, ${0.12 + intensity * 0.8})`,
                                  color: intensity > 0.45 ? "#ffffff" : "#334155",
                                }}
                                title={`${comp} · ${matrix.columns[ci]}: ${formatUsd(v)}`}
                              >
                                {v === 0 ? "—" : formatUsd(v)}
                              </div>
                            </td>
                          );
                        })}
                        <td className="pl-4 py-1 text-right font-medium text-slate-900 text-xs tabular-nums whitespace-nowrap">
                          {formatUsd(matrix.rowTotals[ri])}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200">
                      <td className="pr-4 pt-2 text-xs text-slate-400 sticky left-0 bg-white">Sütun toplamı</td>
                      {matrix.columnTotals.map((t, i) => (
                        <td key={i} className="px-1 pt-2 text-[10px] text-slate-500 text-center tabular-nums">
                          {formatUsd(t)}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Rakip Sıralaması</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 font-medium text-right w-10">#</th>
                    <th className="pb-2 font-medium">Rakip</th>
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
                      <td className="py-2.5 text-right text-slate-600 tabular-nums">
                        %{r.marketSharePct.toFixed(1)}
                      </td>
                      <td className="py-2.5 text-right text-slate-500 tabular-nums">{r.customerCount}</td>
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
