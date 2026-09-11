import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getTargetMarkets, getFilterOptions, getTradeKpis } from "@/lib/analytics";
import { WEIGHTS } from "@/lib/targetMarketScoring";
import { GlobalFilterBar } from "@/components/GlobalFilterBar";
import { PageHeader, KpiCard, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

/**
 * Hedef Pazar Analizi (Phase 3)
 *
 * Hangi pazarın daha iyi ihracat fırsatı sunduğunu, YALNIZCA yüklenen ticaret
 * verisinden hesaplanan açıklanabilir bir skorla sıralar. Her ülkenin skorunun
 * hangi faktörden kaç puan aldığı ekranda açıkça gösterilir - skor kara kutu
 * değildir.
 */
export default async function TargetMarketsPage({
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

  const [markets, kpis, filterOptions] = await Promise.all([
    getTargetMarkets(organizationId, filters),
    getTradeKpis(organizationId, filters),
    getFilterOptions(organizationId, filters),
  ]);

  const q = filtersToQuery(filters);
  const high = markets.filter((m) => m.score.total >= 70).length;

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Hedef Pazarlar"
        description="Yüklenen ticaret verisine göre hangi pazarın daha iyi ihracat fırsatı sunduğu."
      />

      <GlobalFilterBar options={filterOptions} />

      {markets.length === 0 ? (
        <EmptyState text="Bu filtrelerle eşleşen pazar yok." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="DEĞERLENDİRİLEN PAZAR" value={String(markets.length)} />
            <KpiCard label="YÜKSEK FIRSAT" value={String(high)} sub="70+ puan" />
            <KpiCard label="TOPLAM HACİM" value={formatUsd(kpis.totalValueUsd)} />
            <KpiCard label="ALICI FİRMA" value={kpis.importerCount.toLocaleString("tr-TR")} />
          </div>

          <div className="space-y-4">
            {markets.map((m) => (
              <div key={m.country} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="flex items-start justify-between gap-4 p-5 pb-4 flex-wrap">
                  <div className="min-w-0">
                    <Link
                      href={`/trade/countries/${encodeURIComponent(m.country)}${q}`}
                      className="text-base font-semibold text-slate-900 hover:underline"
                    >
                      {m.country}
                    </Link>
                    <p className="text-xs text-slate-500 mt-1">
                      {formatUsd(m.totalValueUsd)} · {m.importerCount} alıcı firma ·{" "}
                      {m.supplierCount} tedarikçi · ortalama işlem {formatUsd(m.avgShipmentValueUsd)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-baseline gap-1.5 justify-end">
                      <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                        {m.score.total}
                      </span>
                      <span className="text-sm text-slate-400">/ 100</span>
                    </div>
                    <span
                      className={`inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                        m.score.total >= 70
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : m.score.total >= 45
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      {m.score.label}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                  <p className="text-[11px] font-medium text-slate-500 mb-3">
                    Skor nasıl oluştu?
                  </p>
                  <div className="grid md:grid-cols-2 gap-x-8 gap-y-2.5">
                    {m.score.factors.map((f) => (
                      <div key={f.key}>
                        <div className="flex justify-between text-xs mb-1 gap-3">
                          <span className="text-slate-700">{f.label}</span>
                          <span className="text-slate-500 tabular-nums shrink-0">
                            {f.score} / {f.max}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-800 rounded-full"
                            style={{ width: `${Math.max(1, (f.score / f.max) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[10.5px] text-slate-400 mt-1">{f.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Skor hakkında</h2>
            <p className="text-xs text-slate-500 mb-3">
              Skor deterministiktir: aynı veriden her zaman aynı sonuç çıkar, tahmin içermez.
              Ağırlıklar <code className="bg-slate-100 px-1 rounded">src/lib/targetMarketScoring.ts</code>{" "}
              dosyasından değiştirilebilir.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
              {Object.entries(WEIGHTS).map(([k, v]) => (
                <span key={k} className="tabular-nums">
                  {WEIGHT_LABELS[k] ?? k}: <strong className="text-slate-700">{v}</strong>
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Nüfus, GSYH, gümrük vergisi gibi dış göstergeler sisteme bağlı olmadığı için skora
              dahil edilmemiştir — eksik veri tahmin edilerek doldurulmaz.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const WEIGHT_LABELS: Record<string, string> = {
  marketSize: "Pazar Büyüklüğü",
  growth: "Büyüme",
  importerBase: "Alıcı Tabanı",
  shipmentActivity: "İşlem Aktivitesi",
  supplierDiversity: "Tedarikçi Çeşitliliği",
  sourcePresence: "Türkiye Payı",
  recency: "Güncellik",
};
