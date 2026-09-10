import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getHsBreakdown, getTradeKpis, getFilterOptions, type HsLevel } from "@/lib/analytics";
import { GlobalFilterBar } from "@/components/GlobalFilterBar";
import { ExportButtons } from "@/components/ExportButtons";
import { PageHeader, KpiCard, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

const LEVELS: { value: HsLevel; label: string; hint: string }[] = [
  { value: "hs2", label: "HS2", hint: "fasıl" },
  { value: "hs4", label: "HS4", hint: "pozisyon" },
  { value: "hs6", label: "HS6", hint: "alt pozisyon" },
  { value: "full", label: "Tam GTİP", hint: "12 hane" },
];

export default async function ProductsPage({
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

  const levelRaw = Array.isArray(sp.level) ? sp.level[0] : sp.level;
  const level: HsLevel =
    levelRaw === "hs2" || levelRaw === "hs4" || levelRaw === "full" ? levelRaw : "hs6";

  const [rows, kpis, filterOptions] = await Promise.all([
    getHsBreakdown(organizationId, filters, level, 200),
    getTradeKpis(organizationId, filters),
    getFilterOptions(organizationId, filters),
  ]);

  const q = filtersToQuery(filters);
  const total = rows.reduce((a, r) => a + r.totalValueUsd, 0);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Ürün / GTİP Analizi"
        description="Gümrük tarife pozisyonu bazında ithalat dağılımı."
      />

      <GlobalFilterBar options={filterOptions} />

      {kpis.transactionCount === 0 ? (
        <EmptyState text="Bu filtrelerle eşleşen kayıt yok." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="TOPLAM DEĞER" value={formatUsd(kpis.totalValueUsd)} />
            <KpiCard label="GTİP SAYISI" value={kpis.hsCodeCount.toLocaleString("tr-TR")} />
            <KpiCard label="İTHALATÇI" value={kpis.importerCount.toLocaleString("tr-TR")} />
            <KpiCard label="TEDARİKÇİ" value={kpis.exporterCount.toLocaleString("tr-TR")} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Kırılım:</span>
                {LEVELS.map((l) => (
                  <Link
                    key={l.value}
                    href={`/trade/products${filtersToQuery(filters, { level: l.value })}`}
                    title={l.hint}
                    className={`px-2 py-1 rounded border ${
                      level === l.value
                        ? "bg-slate-900 text-white border-slate-900"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
              <ExportButtons dataset="products" query={q} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 font-medium">GTİP</th>
                    <th className="pb-2 font-medium text-right">Ticaret Değeri</th>
                    <th className="pb-2 font-medium text-right">Pay</th>
                    <th className="pb-2 font-medium text-right">İşlem</th>
                    <th className="pb-2 font-medium text-right">İthalatçı</th>
                    <th className="pb-2 font-medium text-right">Tedarikçi</th>
                    <th className="pb-2 font-medium text-right">Ülke</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code ?? "unknown"} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 font-mono text-xs">
                        {r.code && level === "full" ? (
                          <Link
                            href={`/trade/products/${encodeURIComponent(r.code)}${q}`}
                            className="text-slate-800 hover:underline"
                          >
                            {r.code}
                          </Link>
                        ) : r.code ? (
                          <Link
                            href={`/trade/products${filtersToQuery({ ...filters, [level]: r.code }, { level: "full" })}`}
                            className="text-slate-800 hover:underline"
                          >
                            {r.code}
                          </Link>
                        ) : (
                          <span className="text-slate-400">Not Available</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-medium text-slate-900 tabular-nums">
                        {formatUsd(r.totalValueUsd)}
                      </td>
                      <td className="py-2.5 text-right text-slate-600 tabular-nums">
                        %{total > 0 ? ((r.totalValueUsd / total) * 100).toFixed(1) : "0.0"}
                      </td>
                      <td className="py-2.5 text-right text-slate-500 tabular-nums">
                        {r.transactionCount.toLocaleString("tr-TR")}
                      </td>
                      <td className="py-2.5 text-right text-slate-500 tabular-nums">{r.importerCount}</td>
                      <td className="py-2.5 text-right text-slate-500 tabular-nums">{r.exporterCount}</td>
                      <td className="py-2.5 text-right text-slate-500 tabular-nums">{r.countryCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {level === "full"
                ? "Tam GTİP koduna tıklayarak detay analizine gidebilirsiniz."
                : "Bir koda tıklayarak o kırılımın tam GTİP dağılımını görebilirsiniz."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
