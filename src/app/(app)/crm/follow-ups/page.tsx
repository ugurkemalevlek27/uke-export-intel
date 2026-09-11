// CRM > Takipler (Phase 4)
//
// Takip tarihi gecmis veya yaklasan lead'ler. Gecikmisler en ustte.
// Satir icinde hizli durum/tarih guncellemesi yapilabilir.

import { getActiveProjectId } from "@/lib/projectContext";
import { getFollowUps } from "@/lib/crm";
import { LEAD_STATUS_LABELS } from "@/lib/leadStatus";
import { PageHeader, ScoreBadge, EmptyState } from "@/components/ui";
import { quickUpdateLeadAction } from "@/app/(app)/companies/[id]/actions";
import Link from "next/link";
import { ExportButtons } from "@/components/ExportButtons";
import { guardPage } from "@/lib/pageGuard";
import { AccessDenied } from "@/components/AccessDenied";

const STATUS_OPTIONS = Object.keys(LEAD_STATUS_LABELS);

export default async function FollowUpsPage() {
  const guard = await guardPage("editCrm");
  if (!guard.allowed) return <AccessDenied title="Takipler" role={guard.role} needed="CRM" />;
  const session = guard.session;
  const organizationId = session!.organizationId;
  const projectId = await getActiveProjectId(organizationId);

  // guardPage zaten editCrm yetkisini dogruladi.
  const canEdit = true;

  const rows = await getFollowUps(organizationId, projectId, 30);
  const overdue = rows.filter((r) => r.overdue);
  const today = rows.filter((r) => r.daysUntil === 0);
  const upcoming = rows.filter((r) => r.daysUntil > 0);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Takipler"
          description="Takip tarihi geçmiş veya önümüzdeki 30 gün içinde gelen lead'ler."
        />
        <ExportButtons dataset="follow-ups" query="" />
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Gecikmiş" value={overdue.length} tone="alert" />
        <Stat label="Bugün" value={today.length} />
        <Stat label="Yaklaşan (30 gün)" value={upcoming.length} />
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Takip tarihi girilmiş lead bulunamadı. Firma sayfasındaki 'Sonraki Takip Tarihi' alanını doldurarak buraya ekleyebilirsiniz." />
      ) : (
        <div className="space-y-8">
          <Section title="Gecikmiş" rows={overdue} canEdit={canEdit} />
          <Section title="Bugün" rows={today} canEdit={canEdit} />
          <Section title="Yaklaşan" rows={upcoming} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}

type Row = Awaited<ReturnType<typeof getFollowUps>>[number];

function Section({ title, rows, canEdit }: { title: string; rows: Row[]; canEdit: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-900 mb-2">
        {title} <span className="text-slate-400 font-normal">({rows.length})</span>
      </h2>
      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.companyProjectId} className="px-5 py-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <Link
                  href={`/companies/${r.companyId}`}
                  className="text-sm font-medium text-slate-900 hover:underline"
                >
                  {r.companyName}
                </Link>
                <div className="text-xs text-slate-500 mt-0.5">
                  {[r.country, LEAD_STATUS_LABELS[r.leadStatus] ?? r.leadStatus, r.salesOwner]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-slate-500 tabular-nums">{r.nextFollowupDate}</div>
                  <div
                    className={`text-[11px] ${r.overdue ? "text-red-600" : "text-slate-400"}`}
                  >
                    {r.overdue
                      ? `${Math.abs(r.daysUntil)} gün gecikti`
                      : r.daysUntil === 0
                        ? "bugün"
                        : `${r.daysUntil} gün kaldı`}
                  </div>
                </div>
                <ScoreBadge score={r.leadScore} label={r.leadScoreLabel} />
              </div>
            </div>

            {canEdit && (
              <form
                action={quickUpdateLeadAction.bind(null, r.companyProjectId)}
                className="mt-2 flex gap-2 flex-wrap items-center"
              >
                <select
                  name="leadStatus"
                  defaultValue={r.leadStatus}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  name="nextFollowupDate"
                  defaultValue={r.nextFollowupDate}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                <button className="bg-slate-100 text-slate-700 rounded-md px-3 py-1 text-xs font-medium hover:bg-slate-200">
                  Güncelle
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "alert" }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div
        className={`text-2xl font-semibold tabular-nums mt-1 ${
          tone === "alert" && value > 0 ? "text-red-600" : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
