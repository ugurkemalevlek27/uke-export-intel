import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getTradeKpis, getCountryBreakdown, getFilterOptions } from "@/lib/analytics";
import { countryNameToIso2 } from "@/lib/countryCodes";
import { GlobalFilterBar } from "@/components/GlobalFilterBar";
import { ExportWorldMap } from "@/components/WorldMap";
import { ExportButtons } from "@/components/ExportButtons";
import { PageHeader, KpiCard, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

/**
 * Ülke Analizi - Phase 1'de kurulan mimarinin referans uygulamasi.
 *
 * Bu ekran, yeni mimarinin ucunu uca calistigini gosterir:
 *   URL query -> parseTradeFilters -> analytics (organizationId zorunlu) -> UI
 * Hicbir toplama islemi tarayicida yapilmaz.
 */
export default async function CountryAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  const organizationId = session!.organizationId;

  const sp = await searchParams;
  const activeProjectId = await getActiveProjectId(organizationId);

  // Aktif proje context'i filtrelere enjekte edilir (URL'de proje varsa o kazanir).
  const filters = { ...parseTradeFilters(sp), projectId: parseTradeFilters(sp).projectId ?? activeProjectId };

  const [kpis, countries, filterOptions] = await Promise.all([
    getTradeKpis(organizationId, filters),
    getCountryBreakdown(organizationId, filters),
    getFilterOptions(organizationId, filters),
  ]);

  // Harita noktalari: ISO2'ye eslesemeyen ulkeler haritada gosterilmez ama
  // asagidaki tabloda korunur (veri kaybolmaz).
  const mapPoints = countries
    .map((c) => ({ code: countryNameToIso2(c.country), value: c.totalValueUsd, rawCountry: c.country ?? "" }))
    .filter((p): p is { code: string; value: number; rawCountry: string } => !!p.code && !!p.rawCountry);

  const unmapped = countries.length - mapPoints.length;
  const q = filtersToQuery(filters);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Ülke Analizi"
        description="Filtrelenmiş ticaret verisinin ülke bazında dağılımı."
      />

      <GlobalFilterBar options={filterOptions} />

      {kpis.transactionCount === 0 ? (
        <EmptyState text="Bu filtrelerle eşleşen kayıt yok. Filtreleri sıfırlayıp tekrar deneyin." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <KpiCard label="TOPLAM DEĞER" value={formatUsd(kpis.totalValueUsd)} />
            <KpiCard label="SEVKİYAT" value={kpis.totalShipments.toLocaleString("tr-TR")} />
            <KpiCard label="İTHALATÇI" value={kpis.importerCount.toLocaleString("tr-TR")} />
            <KpiCard label="TEDARİKÇİ" value={kpis.exporterCount.toLocaleString("tr-TR")} />
            <KpiCard label="GTİP SAYISI" value={kpis.hsCodeCount.toLocaleString("tr-TR")} />
            <KpiCard label="ORT. SEVKİYAT" value={formatUsd(kpis.avgShipmentValueUsd)} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Dünya Haritası</h2>
            <p className="text-xs text-slate-400 mb-2">
              Bir ülkeye tıklayarak detay analizine gidebilirsiniz.
              {unmapped > 0 && ` (${unmapped} ülke adı harita koduna eşlenemedi, aşağıdaki tabloda listeleniyor.)`}
            </p>
            <ExportWorldMap points={mapPoints} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-900">
                Ülke Kırılımı ({countries.length})
              </h2>
              <ExportButtons dataset="countries" query={q} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 font-medium">Ülke</th>
                    <th className="pb-2 font-medium text-right">Ticaret Değeri</th>
                    <th className="pb-2 font-medium text-right">Pazar Payı</th>
                    <th className="pb-2 font-medium text-right">İşlem</th>
                    <th className="pb-2 font-medium text-right">İthalatçı</th>
                    <th className="pb-2 font-medium text-right">Tedarikçi</th>
                    <th className="pb-2 font-medium text-right">Son İşlem</th>
                    <th className="pb-2 font-medium text-right">Rapor</th>
                  </tr>
                </thead>
                <tbody>
                  {countries.map((c) => (
                    <tr key={c.country ?? "unknown"} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5">
                        {c.country ? (
                          <Link
                            href={`/trade/countries/${encodeURIComponent(c.country)}${q}`}
                            className="text-slate-800 hover:underline"
                          >
                            {c.country}
                          </Link>
                        ) : (
                          <span className="text-slate-400">Not Available</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-medium text-slate-900">
                        {formatUsd(c.totalValueUsd)}
                      </td>
                      <td className="py-2.5 text-right text-slate-600">
                        %{c.marketSharePct.toFixed(1)}
                      </td>
                      <td className="py-2.5 text-right text-slate-500">
                        {c.transactionCount.toLocaleString("tr-TR")}
                      </td>
                      <td className="py-2.5 text-right text-slate-500">{c.importerCount}</td>
                      <td className="py-2.5 text-right text-slate-500">{c.exporterCount}</td>
                      <td className="py-2.5 text-right text-slate-400 text-xs">
                        {c.lastTransactionDate ?? "Not Available"}
                      </td>
                      <td className="py-2.5 text-right">
                        {c.country && (
                          <a
                            href={`/api/report${q ? q + "&" : "?"}type=country&country=${encodeURIComponent(c.country)}`}
                            className="text-xs text-slate-500 hover:text-slate-900 hover:underline whitespace-nowrap"
                          >
                            PDF
                          </a>
                        )}
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
