import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getSupplierDetail } from "@/lib/analytics";
import { PageHeader, KpiCard, ScoreBadge, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplier: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  const organizationId = session!.organizationId;

  const { supplier: encoded } = await params;
  const supplier = decodeURIComponent(encoded);

  const sp = await searchParams;
  const parsed = parseTradeFilters(sp);
  const activeProjectId = await getActiveProjectId(organizationId);
  const filters = { ...parsed, projectId: parsed.projectId ?? activeProjectId };

  const detail = await getSupplierDetail(organizationId, supplier, filters);
  const { kpis, byCountry, topCustomers, opportunityMarkets, opportunityLeads } = detail;
  const q = filtersToQuery(filters);

  if (kpis.transactionCount === 0) {
    return (
      <div className="p-8 max-w-6xl">
        <PageHeader title={supplier} description="Tedarikçi performans raporu" />
        <EmptyState text="Bu tedarikçi için seçili filtrelerde kayıt bulunamadı." />
        <Link href={`/trade/suppliers${q}`} className="text-sm text-slate-600 hover:underline">
          ← Tedarikçi Analizine dön
        </Link>
      </div>
    );
  }

  const bestRank = byCountry.length > 0 ? Math.min(...byCountry.map((c) => c.rank)) : null;

  return (
    <div className="p-8 max-w-6xl">
      <Link href={`/trade/suppliers${q}`} className="text-xs text-slate-500 hover:underline">
        ← Tedarikçi Analizi
      </Link>
      <div className="mt-2">
        <PageHeader title={supplier} description="Tedarikçi performans raporu" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard label="TOPLAM SATIŞ" value={formatUsd(kpis.totalValueUsd)} />
        <KpiCard label="MÜŞTERİ" value={String(kpis.customerCount)} />
        <KpiCard label="ÜLKE" value={String(kpis.countryCount)} />
        <KpiCard label="ÜRÜN (GTİP)" value={String(kpis.productCount)} />
        <KpiCard label="İŞLEM" value={kpis.transactionCount.toLocaleString("tr-TR")} />
        <KpiCard
          label="EN İYİ SIRA"
          value={bestRank ? `${bestRank}.` : "-"}
          sub={bestRank ? "girdiği pazarlarda" : undefined}
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Pazar Payı ve Sıralama</h2>
        <p className="text-xs text-slate-400 mb-4">
          Sattığı her ülkede toplam pazar içindeki payı ve rakipleri arasındaki sırası.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-medium">Ülke</th>
                <th className="pb-2 font-medium text-right">Satış</th>
                <th className="pb-2 font-medium text-right">Pazar Büyüklüğü</th>
                <th className="pb-2 font-medium text-right">Pazar Payı</th>
                <th className="pb-2 font-medium text-right">Sıralama</th>
              </tr>
            </thead>
            <tbody>
              {byCountry.map((c) => (
                <tr key={c.country} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5">
                    <Link
                      href={`/trade/countries/${encodeURIComponent(c.country)}${q}`}
                      className="text-slate-800 hover:underline"
                    >
                      {c.country}
                    </Link>
                  </td>
                  <td className="py-2.5 text-right font-medium text-slate-900 tabular-nums">
                    {formatUsd(c.myValueUsd)}
                  </td>
                  <td className="py-2.5 text-right text-slate-500 tabular-nums">
                    {formatUsd(c.countryTotalUsd)}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-800 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(2, c.sharePct))}%` }}
                        />
                      </div>
                      <span className="text-slate-700 font-medium w-12 text-right tabular-nums">
                        %{c.sharePct.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right text-slate-600 tabular-nums">
                    <span className="font-semibold text-slate-900">{c.rank}.</span>
                    <span className="text-slate-400"> / {c.competitorCount}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {opportunityMarkets.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Henüz Girilmemiş Pazarlar</h2>
          <p className="text-xs text-slate-400 mb-4">
            Verideki bu ülkelerde bu tedarikçinin hiç satışı görünmüyor.
          </p>
          <div className="space-y-2.5">
            {opportunityMarkets.map((m) => (
              <div key={m.country} className="flex items-center justify-between text-sm">
                <Link
                  href={`/trade/countries/${encodeURIComponent(m.country)}${q}`}
                  className="text-slate-800 hover:underline"
                >
                  {m.country}
                </Link>
                <span className="text-slate-500 tabular-nums">
                  {formatUsd(m.totalValueUsd)} · {m.companyCount} alıcı firma
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Panel title="Mevcut Müşterileri">
          <ol className="space-y-2">
            {topCustomers.map((c, i) => (
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
                  {c.leadScore != null && <ScoreBadge score={c.leadScore} label={c.leadScoreLabel} />}
                </span>
                <span className="font-medium text-slate-900 shrink-0 tabular-nums">
                  {formatUsd(c.totalValueUsd)}
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel
          title="Satış Fırsatı"
          subtitle="Aynı ürünü alan, bu tedarikçiden almayan firmalar — Fırsat Skoruna göre sıralı"
        >
          {opportunityLeads.length === 0 ? (
            <p className="text-sm text-slate-400">Fırsat bulunamadı.</p>
          ) : (
            <ol className="space-y-2">
              {opportunityLeads.map((c, i) => (
                <li key={c.companyId} className="flex items-center justify-between text-sm gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-400 w-5 shrink-0 tabular-nums">{i + 1}.</span>
                    <Link href={`/companies/${c.companyId}`} className="text-slate-800 hover:underline truncate">
                      {c.name}
                    </Link>
                    {c.leadScore != null && <ScoreBadge score={c.leadScore} label={c.leadScoreLabel} />}
                  </span>
                  <span className="font-medium text-slate-900 shrink-0 tabular-nums">
                    {formatUsd(c.totalValueUsd)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}
