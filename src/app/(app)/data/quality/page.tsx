import { getActiveProjectId } from "@/lib/projectContext";
import {
  getQualityOverview,
  getDuplicateCompanyPairs,
  getDuplicateTradeGroups,
  getCompanyNameVariations,
} from "@/lib/dataQuality";
import { PageHeader, EmptyState, formatUsd } from "@/components/ui";
import { mergeCompaniesAction, dismissDuplicateAction, unmergeCompanyAction, listMergedCompanies } from "./actions";
import Link from "next/link";
import { guardPage } from "@/lib/pageGuard";
import { AccessDenied } from "@/components/AccessDenied";

/**
 * Veri Kalitesi (Phase 4)
 *
 * ILKE: Bu ekran sorunlari GOSTERIR, kendiliginden duzeltmez. Ozellikle firma
 * birlestirme her zaman insan onayina baglidir — iki firmanin ayni olup
 * olmadigina makine karar veremez.
 */
export default async function DataQualityPage() {
  const guard = await guardPage("manageDataQuality");
  if (!guard.allowed)
    return <AccessDenied title="Veri Kalitesi" role={guard.role} needed="veri kalitesi yönetimi" />;

  const organizationId = guard.session.organizationId;
  const projectId = await getActiveProjectId(organizationId);
  const canEdit = true; // guardPage zaten dogruladi

  const [issues, dupPairs, dupTrades, variations, merged] = await Promise.all([
    getQualityOverview(organizationId, projectId),
    getDuplicateCompanyPairs(organizationId, 50),
    getDuplicateTradeGroups(organizationId, projectId, 25),
    getCompanyNameVariations(organizationId, 25),
    listMergedCompanies(organizationId),
  ]);

  const problems = issues.filter((i) => i.count > 0);
  const clean = issues.filter((i) => i.count === 0);

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title="Veri Kalitesi"
        description="Yüklenen verideki sorunlar. Hiçbir düzeltme otomatik yapılmaz — kararı siz verirsiniz."
      />

      {problems.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 mb-6">
          <p className="text-sm font-medium text-emerald-900">Tespit edilen sorun yok.</p>
          <p className="text-xs text-emerald-700 mt-1">{issues.length} kontrolün tamamı temiz.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {problems.map((i) => (
            <div
              key={i.key}
              className={`bg-white rounded-lg border p-4 flex items-start justify-between gap-4 border-l-[3px] ${
                i.severity === "high"
                  ? "border-slate-200 border-l-red-500"
                  : i.severity === "medium"
                    ? "border-slate-200 border-l-amber-500"
                    : "border-slate-200 border-l-slate-300"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{i.label}</p>
                <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">{i.description}</p>
              </div>
              <span className="text-lg font-semibold text-slate-900 tabular-nums shrink-0">
                {i.count.toLocaleString("tr-TR")}
              </span>
            </div>
          ))}
        </div>
      )}

      {clean.length > 0 && (
        <p className="text-xs text-slate-400 mb-8">
          Temiz geçen kontroller: {clean.map((c) => c.label).join(" · ")}
        </p>
      )}

      {/* --- Olasi duplicate firmalar --- */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Olası Duplicate Firmalar</h2>
        <p className="text-xs text-slate-400 mb-3">
          Benzer isimli firmalar. <strong>Otomatik birleştirme yapılmaz.</strong> Birleştirirseniz
          ticaret kayıtları hedef firmaya taşınır; kaynak firma silinmez, geri alınabilir.
        </p>
        {dupPairs.length === 0 ? (
          <EmptyState text="Olası duplicate firma yok." />
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {dupPairs.map((p) => (
              <div key={`${p.keptId}-${p.duplicateId}`} className="p-4">
                <div className="grid md:grid-cols-2 gap-4 mb-3">
                  <CompanyCard id={p.duplicateId} name={p.duplicateName} value={p.duplicateValueUsd} label="A" />
                  <CompanyCard id={p.keptId} name={p.keptName} value={p.keptValueUsd} label="B" />
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={mergeCompaniesAction}>
                      <input type="hidden" name="sourceId" value={p.duplicateId} />
                      <input type="hidden" name="targetId" value={p.keptId} />
                      <button className="text-xs border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50">
                        A&apos;yı B&apos;ye birleştir
                      </button>
                    </form>
                    <form action={mergeCompaniesAction}>
                      <input type="hidden" name="sourceId" value={p.keptId} />
                      <input type="hidden" name="targetId" value={p.duplicateId} />
                      <button className="text-xs border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50">
                        B&apos;yi A&apos;ya birleştir
                      </button>
                    </form>
                    <form action={dismissDuplicateAction}>
                      <input type="hidden" name="companyId" value={p.duplicateId} />
                      <button className="text-xs text-slate-500 rounded px-3 py-1.5 hover:bg-slate-50">
                        Farklı firmalar
                      </button>
                    </form>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Birleştirme için yönetici yetkisi gerekir.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Birlestirilmis firmalar --- */}
      {merged.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Birleştirilmiş Firmalar</h2>
          <p className="text-xs text-slate-400 mb-3">
            Bu kayıtlar silinmedi, listelerde gösterilmiyor. Yanlış birleştirme yaptıysanız geri alabilirsiniz.
          </p>
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {merged.map((m) => (
              <div key={m.id} className="p-3 flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-700 truncate">
                  {m.name}
                  <span className="text-slate-400"> → firma #{m.mergedIntoId}</span>
                </span>
                {canEdit && (
                  <form action={unmergeCompanyAction}>
                    <input type="hidden" name="companyId" value={m.id} />
                    <button className="text-xs border border-slate-300 rounded px-3 py-1 hover:bg-slate-50 shrink-0">
                      Geri al
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- Tekrar eden sevkiyatlar --- */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Tekrar Eden Sevkiyat Kayıtları</h2>
        <p className="text-xs text-slate-400 mb-3">
          Birebir aynı içeriğe sahip kayıtlar — genellikle aynı dosyanın iki kez yüklenmesinden kalmış.
          Yeni yüklemelerde bunlar otomatik engelleniyor.
        </p>
        {dupTrades.length === 0 ? (
          <EmptyState text="Tekrar eden sevkiyat kaydı yok." />
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">İthalatçı</th>
                  <th className="pb-2 font-medium">GTİP</th>
                  <th className="pb-2 font-medium">Tarih</th>
                  <th className="pb-2 font-medium text-right">Değer</th>
                  <th className="pb-2 font-medium text-right">Kopya</th>
                  <th className="pb-2 font-medium">Kaynak Dosya</th>
                </tr>
              </thead>
              <tbody>
                {dupTrades.map((g) => (
                  <tr key={g.rowHash} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-700 max-w-[200px] truncate">{g.importerName}</td>
                    <td className="py-2 text-slate-500 font-mono text-xs">{g.hsCode}</td>
                    <td className="py-2 text-slate-500 tabular-nums">{g.transactionDate ?? "—"}</td>
                    <td className="py-2 text-slate-900 text-right font-medium tabular-nums">
                      {formatUsd(Number(g.valueUsd))}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <span className="text-xs bg-red-50 text-red-700 border border-red-200 rounded px-1.5 py-0.5">
                        {g.count}×
                      </span>
                    </td>
                    <td className="py-2 text-slate-400 text-xs max-w-[180px] truncate">
                      {g.sourceFiles.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-3">
              Bu kayıtlar otomatik silinmez — hangisinin gerçek olduğuna karar vermek gerekir.
              Temizlik istiyorsanız söyleyin, kontrollü bir temizleme script&apos;i hazırlayayım.
            </p>
          </div>
        )}
      </section>

      {/* --- Firma adi varyasyonlari --- */}
      {variations.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Firma Adı Varyasyonları</h2>
          <p className="text-xs text-slate-400 mb-3">
            Aynı firmanın veri kaynağında görülen farklı yazımları — zaten tek kayıtta birleştirilmiş.
          </p>
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {variations.map((v) => (
              <div key={v.id} className="p-3 text-sm">
                <Link href={`/companies/${v.id}`} className="text-slate-800 hover:underline font-medium">
                  {v.name}
                </Link>
                <p className="text-xs text-slate-500 mt-0.5">{(v.variants ?? []).join(" · ")}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CompanyCard({ id, name, value, label }: { id: number; name: string; value: number; label: string }) {
  return (
    <div className="border border-slate-200 rounded-md p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{label}</span>
        <Link href={`/companies/${id}`} className="text-sm text-slate-800 hover:underline truncate">
          {name}
        </Link>
      </div>
      <p className="text-xs text-slate-500 tabular-nums">
        {formatUsd(value)} · firma #{id}
      </p>
    </div>
  );
}
