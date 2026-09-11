// CRM > Lead'ler (Phase 4)
//
// Satis hunisi (pipeline) ozeti + lead listesi. Tum sorgular organizationId ile
// scope edilir ve aktif proje (client workspace) context'ine gore filtrelenir.

import { getActiveProjectId } from "@/lib/projectContext";
import { getLeadPipeline, getLeads } from "@/lib/crm";
import { LEAD_STATUS_LABELS } from "@/lib/leadStatus";
import { PageHeader, ScoreBadge, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";
import { ExportButtons } from "@/components/ExportButtons";
import { guardPage } from "@/lib/pageGuard";
import { AccessDenied } from "@/components/AccessDenied";

// Huninin mantiksal sirasi (kazanilan/kaybedilen en sonda).
const PIPELINE_ORDER = [
  "yeni",
  "arastiriliyor",
  "karar_verici_bulundu",
  "ilk_temas",
  "follow_up",
  "ilgilendi",
  "katalog_gonderildi",
  "numune_talebi",
  "fiyat_talebi",
  "teklif_gonderildi",
  "pazarlik",
  "siparis_bekleniyor",
  "siparis_alindi",
  "uretim",
  "sevkiyat",
  "tahsilat",
  "tekrar_siparis",
  "beklemede",
  "kaybedildi",
  "uygun_degil",
];

const CLOSED = new Set(["kaybedildi", "uygun_degil"]);

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const guard = await guardPage("editCrm");
  if (!guard.allowed) return <AccessDenied title="Lead'ler" role={guard.role} needed="CRM" />;
  const session = guard.session;
  const organizationId = session!.organizationId;
  const projectId = await getActiveProjectId(organizationId);
  const sp = await searchParams;
  const status = sp.status && sp.status in LEAD_STATUS_LABELS ? sp.status : undefined;

  const [pipeline, leads] = await Promise.all([
    getLeadPipeline(organizationId, projectId),
    getLeads(organizationId, { projectId, status }),
  ]);

  const byStatus = new Map(pipeline.map((p) => [p.leadStatus, p]));
  const total = pipeline.reduce((s, p) => s + p.count, 0);
  const active = pipeline.filter((p) => !CLOSED.has(p.leadStatus)).reduce((s, p) => s + p.count, 0);
  const won = byStatus.get("siparis_alindi")?.count ?? 0;
  const maxCount = Math.max(1, ...pipeline.map((p) => p.count));

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Lead'ler"
          description="Aktif projedeki firmaların satış hunisindeki dağılımı ve skor sıralaması."
        />
        <ExportButtons dataset="leads" query="" />
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Toplam Lead" value={total.toLocaleString("tr-TR")} />
        <Stat label="Aktif (kapanmamış)" value={active.toLocaleString("tr-TR")} />
        <Stat label="Sipariş Alındı" value={won.toLocaleString("tr-TR")} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Satış Hunisi</h2>
        {total === 0 ? (
          <EmptyState text="Aktif projede henüz lead yok." />
        ) : (
          <div className="space-y-1.5">
            {PIPELINE_ORDER.filter((s) => byStatus.has(s)).map((s) => {
              const row = byStatus.get(s)!;
              const pct = (row.count / maxCount) * 100;
              return (
                <Link
                  key={s}
                  href={status === s ? "/crm/leads" : `/crm/leads?status=${s}`}
                  className="flex items-center gap-3 group"
                >
                  <span
                    className={`w-44 shrink-0 text-xs ${
                      status === s ? "text-slate-900 font-medium" : "text-slate-600"
                    }`}
                  >
                    {LEAD_STATUS_LABELS[s]}
                  </span>
                  <span className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                    <span
                      className={`block h-full rounded ${
                        CLOSED.has(s) ? "bg-slate-300" : "bg-slate-800"
                      } group-hover:opacity-80`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-14 text-right text-xs text-slate-600 tabular-nums">
                    {row.count}
                  </span>
                  <span className="w-28 text-right text-xs text-slate-400 tabular-nums">
                    {row.totalValueUsd > 0 ? formatUsd(row.totalValueUsd) : "—"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Bir aşamaya tıklayarak listeyi filtreleyebilirsiniz. Tutar sütunu, girilmiş
          &quot;tahmini değer&quot; alanlarının toplamıdır — girilmemişse boş görünür.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            {status ? LEAD_STATUS_LABELS[status] : "Tüm Lead'ler"}
          </h2>
          {status && (
            <Link href="/crm/leads" className="text-xs text-slate-500 hover:underline">
              Filtreyi temizle
            </Link>
          )}
        </div>
        {leads.length === 0 ? (
          <div className="p-5">
            <EmptyState text="Bu kritere uyan lead bulunamadı." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Firma</th>
                  <th className="text-left font-medium px-3 py-2">Ülke</th>
                  <th className="text-left font-medium px-3 py-2">Durum</th>
                  <th className="text-left font-medium px-3 py-2">Temsilci</th>
                  <th className="text-left font-medium px-3 py-2">Takip</th>
                  <th className="text-right font-medium px-5 py-2">Fırsat Skoru</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((l) => (
                  <tr key={l.companyProjectId} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/companies/${l.companyId}`}
                        className="text-slate-900 hover:underline"
                      >
                        {l.companyName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{l.country ?? "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {LEAD_STATUS_LABELS[l.leadStatus] ?? l.leadStatus}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{l.salesOwner ?? "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                      {l.nextFollowupDate ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <ScoreBadge score={l.leadScore} label={l.leadScoreLabel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">{value}</div>
    </div>
  );
}
