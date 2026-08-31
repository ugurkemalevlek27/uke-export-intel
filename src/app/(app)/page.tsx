import { getSession } from "@/lib/auth";
import { getDashboardStats } from "@/lib/queries";
import { KpiCard, ScoreBadge, PageHeader, formatUsd, EmptyState } from "@/components/ui";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getSession();
  const stats = await getDashboardStats(session!.organizationId);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Dashboard"
        description="Şirketinizin ihracat istihbaratı ve satış fırsatlarına genel bakış"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Toplam Firma" value={String(stats.totalCompanies)} />
        <KpiCard
          label="Yüksek Potansiyelli Lead"
          value={String(stats.highPotentialCount)}
          sub={`${stats.totalCompanies} firma içinde`}
        />
        <KpiCard label="Toplam İthalat Hacmi" value={formatUsd(stats.totalValueUsd)} />
        <KpiCard label="Toplam Sevkiyat Kaydı" value={stats.totalRecords.toLocaleString("tr-TR")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Ülkelere Göre İthalat Hacmi</h2>
          {stats.byCountry.length === 0 ? (
            <EmptyState text="Henüz veri yok. Veri İçe Aktar sayfasından başlayın." />
          ) : (
            <div className="space-y-3">
              {stats.byCountry.map((c) => {
                const max = Number(stats.byCountry[0]?.totalValueUsd ?? 1);
                const pct = Math.max(4, (Number(c.totalValueUsd) / max) * 100);
                return (
                  <div key={c.country}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-700 font-medium">{c.country}</span>
                      <span className="text-slate-500">
                        {formatUsd(Number(c.totalValueUsd))} · {c.companyCount} firma
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-800 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">En Yüksek Potansiyelli Firmalar</h2>
            <Link href="/companies" className="text-xs text-slate-500 hover:text-slate-900">
              Tümünü gör →
            </Link>
          </div>
          {stats.topCompanies.length === 0 ? (
            <EmptyState text="Henüz firma yok." />
          ) : (
            <div className="space-y-2">
              {stats.topCompanies.map((c) => (
                <Link
                  key={c.id}
                  href={`/companies/${c.id}`}
                  className="flex items-center justify-between py-2 px-2 -mx-2 rounded hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.country}</div>
                  </div>
                  <ScoreBadge score={c.leadScore} label={c.leadScoreLabel} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {stats.recentImports.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 mt-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Son İçe Aktarmalar</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-medium">Dosya</th>
                <th className="pb-2 font-medium">Satır</th>
                <th className="pb-2 font-medium">Başarılı</th>
                <th className="pb-2 font-medium">Olası Duplicate</th>
                <th className="pb-2 font-medium">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentImports.map((imp) => (
                <tr key={imp.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 text-slate-700">{imp.fileName}</td>
                  <td className="py-2 text-slate-500">{imp.rowCount}</td>
                  <td className="py-2 text-slate-500">{imp.successCount}</td>
                  <td className="py-2 text-slate-500">{imp.duplicateCount}</td>
                  <td className="py-2 text-slate-400 text-xs">
                    {imp.createdAt ? new Date(imp.createdAt).toLocaleDateString("tr-TR") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
