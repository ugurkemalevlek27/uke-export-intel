import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getProductDetail } from "@/lib/analytics";
import { TrendBars, DistributionBars } from "@/components/charts";
import { PageHeader, KpiCard, ScoreBadge, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ hsCode: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  const organizationId = session!.organizationId;

  const { hsCode: encoded } = await params;
  const hsCode = decodeURIComponent(encoded);

  const sp = await searchParams;
  const parsed = parseTradeFilters(sp);
  const activeProjectId = await getActiveProjectId(organizationId);
  const filters = { ...parsed, projectId: parsed.projectId ?? activeProjectId, hsCode: undefined };

  const detail = await getProductDetail(organizationId, hsCode, filters);
  const { kpis, description, shareOfTotalPct, byCountry, topImporters, topExporters, trend } = detail;
  const q = filtersToQuery(filters);

  if (kpis.transactionCount === 0) {
    return (
      <div className="p-8 max-w-6xl">
        <PageHeader title={`GTİP ${hsCode}`} description="Ürün detay analizi" />
        <EmptyState text="Bu GTİP için seçili filtrelerde kayıt bulunamadı." />
        <Link href={`/trade/products${q}`} className="text-sm text-slate-600 hover:underline">
          ← Ürün Analizine dön
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      <Link href={`/trade/products${q}`} className="text-xs text-slate-500 hover:underline">
        ← Ürün Analizi
      </Link>
      <div className="mt-2 mb-6">
        <h1 className="text-xl font-semibold text-slate-900 font-mono">GTİP {hsCode}</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">{description ?? "Not Available"}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard label="TİCARET DEĞERİ" value={formatUsd(kpis.totalValueUsd)} />
        <KpiCard label="TOPLAM İÇİNDE PAY" value={`%${shareOfTotalPct.toFixed(1)}`} />
        <KpiCard label="İŞLEM" value={kpis.transactionCount.toLocaleString("tr-TR")} />
        <KpiCard label="ÜLKE" value={String(kpis.countryCount)} />
        <KpiCard label="İTHALATÇI" value={String(kpis.importerCount)} />
        <KpiCard label="TEDARİKÇİ" value={String(kpis.exporterCount)} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Aylık Ticaret Trendi</h2>
        <p className="text-xs text-slate-400 mb-4">
          {kpis.firstTransactionDate ?? "Not Available"} — {kpis.lastTransactionDate ?? "Not Available"}
        </p>
        <TrendBars points={trend} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Panel title="Ülke Dağılımı">
          <DistributionBars
            rows={byCountry.map((c) => ({
              label: c.country ?? "Not Available",
              value: c.totalValueUsd,
              sub: `%${c.marketSharePct.toFixed(1)}`,
            }))}
          />
        </Panel>

        <Panel title="En Büyük Tedarikçiler">
          <DistributionBars
            rows={topExporters.map((e) => ({
              label: e.name ?? "Not Available",
              value: e.totalValueUsd,
              sub: `${e.customerCount} müşteri`,
            }))}
          />
        </Panel>

        <div className="md:col-span-2">
          <Panel title="Bu Ürünü En Çok İthal Eden Firmalar">
            <ol className="space-y-2">
              {topImporters.map((c, i) => (
                <li key={c.companyId ?? i} className="flex items-center justify-between text-sm gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-400 w-5 shrink-0 tabular-nums">{i + 1}.</span>
                    {c.companyId ? (
                      <Link href={`/companies/${c.companyId}`} className="text-slate-800 hover:underline truncate">
                        {c.name ?? "Not Available"}
                      </Link>
                    ) : (
                      <span className="text-slate-700 truncate">{c.name ?? "Not Available"}</span>
                    )}
                    <span className="text-slate-400 text-xs shrink-0">{c.country ?? ""}</span>
                    {c.leadScore != null && <ScoreBadge score={c.leadScore} label={c.leadScoreLabel} />}
                  </span>
                  <span className="font-medium text-slate-900 shrink-0 tabular-nums">
                    {formatUsd(c.totalValueUsd)}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
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
