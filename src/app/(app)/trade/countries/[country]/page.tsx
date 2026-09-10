import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getCountryDetail } from "@/lib/analytics";
import { PageHeader, KpiCard, ScoreBadge, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

export default async function CountryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  const organizationId = session!.organizationId;

  const { country: encoded } = await params;
  const country = decodeURIComponent(encoded);

  const sp = await searchParams;
  const parsed = parseTradeFilters(sp);
  const activeProjectId = await getActiveProjectId(organizationId);
  // Bu sayfada ulke zaten path'ten geliyor; filtredeki importerCountry yok sayilir.
  const filters = { ...parsed, projectId: parsed.projectId ?? activeProjectId, importerCountry: undefined };

  const detail = await getCountryDetail(organizationId, country, filters);
  const { kpis, marketSharePct, topImporters, topExporters, hsBreakdown, trend, supplierCountries } = detail;
  const q = filtersToQuery(filters);

  if (kpis.transactionCount === 0) {
    return (
      <div className="p-8 max-w-6xl">
        <PageHeader title={country} description="Ülke detay analizi" />
        <EmptyState text="Bu ülke için seçili filtrelerde kayıt bulunamadı." />
        <Link href={`/trade/countries${q}`} className="text-sm text-slate-600 hover:underline">
          ← Ülke Analizine dön
        </Link>
      </div>
    );
  }

  const maxTrend = Math.max(...trend.map((t) => t.totalValueUsd), 1);

  return (
    <div className="p-8 max-w-6xl">
      <Link href={`/trade/countries${q}`} className="text-xs text-slate-500 hover:underline">
        ← Ülke Analizi
      </Link>
      <div className="mt-2">
        <PageHeader title={country} description="Ülke detay analizi" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard label="TİCARET DEĞERİ" value={formatUsd(kpis.totalValueUsd)} />
        <KpiCard label="PAZAR PAYI" value={`%${marketSharePct.toFixed(1)}`} sub="filtrelenmiş toplam içinde" />
        <KpiCard label="SEVKİYAT" value={kpis.totalShipments.toLocaleString("tr-TR")} />
        <KpiCard label="İTHALATÇI" value={String(kpis.importerCount)} />
        <KpiCard label="TEDARİKÇİ" value={String(kpis.exporterCount)} />
        <KpiCard label="ORT. SEVKİYAT" value={formatUsd(kpis.avgShipmentValueUsd)} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Aylık Ticaret Trendi</h2>
        <p className="text-xs text-slate-400 mb-4">
          İlk işlem: {kpis.firstTransactionDate ?? "Not Available"} · Son işlem:{" "}
          {kpis.lastTransactionDate ?? "Not Available"}
        </p>
        {trend.length === 0 ? (
          <p className="text-sm text-slate-400">Tarihi olan kayıt yok.</p>
        ) : (
          <div className="flex items-end gap-1 h-40 pb-6">
            {trend.map((t) => (
              <div key={t.period} className="flex-1 h-full flex flex-col items-center justify-end group" title={`${t.period}: ${formatUsd(t.totalValueUsd)} (${t.transactionCount} işlem)`}>
                <div
                  className="w-full bg-slate-800 rounded-t group-hover:bg-slate-600 transition-colors"
                  style={{ height: `${Math.max(2, (t.totalValueUsd / maxTrend) * 100)}%` }}
                />
                <span className="text-[9px] text-slate-400 mt-1 rotate-45 origin-left whitespace-nowrap">
                  {t.period}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Panel title="En Büyük İthalatçı Firmalar">
          <ol className="space-y-2">
            {topImporters.map((c, i) => (
              <li key={c.companyId ?? i} className="flex items-center justify-between text-sm gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400 w-5 shrink-0">{i + 1}.</span>
                  {c.companyId ? (
                    <Link href={`/companies/${c.companyId}`} className="text-slate-800 hover:underline truncate">
                      {c.name ?? "Not Available"}
                    </Link>
                  ) : (
                    <span className="text-slate-700 truncate">{c.name ?? "Not Available"}</span>
                  )}
                  {c.leadScore != null && <ScoreBadge score={c.leadScore} label={c.leadScoreLabel} />}
                </span>
                <span className="font-medium text-slate-900 shrink-0">{formatUsd(c.totalValueUsd)}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="En Büyük Tedarikçiler">
          <ol className="space-y-2">
            {topExporters.map((e, i) => (
              <li key={e.name ?? i} className="flex items-center justify-between text-sm gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400 w-5 shrink-0">{i + 1}.</span>
                  <span className="text-slate-700 truncate">{e.name ?? "Not Available"}</span>
                </span>
                <span className="font-medium text-slate-900 shrink-0">{formatUsd(e.totalValueUsd)}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="GTİP Dağılımı">
          <ol className="space-y-2">
            {hsBreakdown.map((h, i) => (
              <li key={h.code ?? i} className="flex items-center justify-between text-sm gap-3">
                <span className="text-slate-700 truncate">{h.code ?? "Not Available"}</span>
                <span className="font-medium text-slate-900 shrink-0">{formatUsd(h.totalValueUsd)}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Tedarikçi Ülke Dağılımı">
          <ol className="space-y-2">
            {supplierCountries.map((s, i) => (
              <li key={s.country ?? i} className="flex items-center justify-between text-sm gap-3">
                <span className="text-slate-700 truncate">{s.country ?? "Not Available"}</span>
                <span className="font-medium text-slate-900 shrink-0">{formatUsd(s.totalValueUsd)}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <p className="text-xs text-slate-400">
        Ekonomik ve demografik ülke göstergeleri (nüfus, GSYH, ithalat hacmi vb.) henüz
        sisteme bağlı değil — bu veriler dış kaynaktan entegre edilene kadar gösterilmiyor.
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}
