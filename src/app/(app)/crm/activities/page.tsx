// CRM > Aktiviteler (Phase 4)
// Aktif projedeki tum temas kayitlarinin kronolojik akisi.

import { getActiveProjectId } from "@/lib/projectContext";
import { getRecentActivities, ACTIVITY_TYPE_LABELS } from "@/lib/crm";
import { PageHeader, EmptyState } from "@/components/ui";
import Link from "next/link";
import { ExportButtons } from "@/components/ExportButtons";
import { guardPage } from "@/lib/pageGuard";
import { AccessDenied } from "@/components/AccessDenied";

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

function dayKey(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dt.getTime()) ? "—" : dt.toISOString().slice(0, 10);
}

export default async function ActivitiesPage() {
  const guard = await guardPage("editCrm");
  if (!guard.allowed) return <AccessDenied title="Aktiviteler" role={guard.role} needed="CRM" />;
  const session = guard.session;
  const organizationId = session!.organizationId;
  const projectId = await getActiveProjectId(organizationId);

  const rows = await getRecentActivities(organizationId, projectId, 200);

  // Gune gore grupla (en yeni gun ustte).
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = dayKey(r.activityDate);
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }

  const typeCounts = new Map<string, number>();
  for (const r of rows) {
    const t = r.activityType ?? "note";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Aktiviteler"
          description="Aktif projedeki son 200 temas kaydı. Yeni kayıt firma sayfasından eklenir."
        />
        <ExportButtons dataset="activities" query="" />
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Henüz aktivite kaydı yok. Bir firma sayfasını açıp 'Aktivite kaydet' bölümünden başlayabilirsiniz." />
      ) : (
        <>
          <div className="flex gap-2 flex-wrap mb-6">
            {[...typeCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([t, n]) => (
                <span
                  key={t}
                  className="text-xs bg-white border border-slate-200 rounded-full px-3 py-1 text-slate-600"
                >
                  {ACTIVITY_TYPE_LABELS[t] ?? t}: <span className="tabular-nums">{n}</span>
                </span>
              ))}
          </div>

          <div className="space-y-6">
            {[...groups.entries()].map(([day, items]) => (
              <div key={day}>
                <h2 className="text-xs font-medium text-slate-400 mb-2">
                  {fmtDate(items[0].activityDate)}
                </h2>
                <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {items.map((a) => (
                    <div key={a.id} className="px-5 py-3">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-medium bg-slate-100 text-slate-700 rounded px-2 py-0.5">
                          {ACTIVITY_TYPE_LABELS[a.activityType ?? ""] ?? a.activityType ?? "Not"}
                        </span>
                        <Link
                          href={`/companies/${a.companyId}`}
                          className="text-sm font-medium text-slate-900 hover:underline"
                        >
                          {a.companyName}
                        </Link>
                        {a.contactName && (
                          <span className="text-xs text-slate-500">· {a.contactName}</span>
                        )}
                        {a.userName && <span className="text-xs text-slate-400">· {a.userName}</span>}
                      </div>
                      {a.result && <p className="text-xs text-slate-600 mt-1">Sonuç: {a.result}</p>}
                      {a.notes && <p className="text-xs text-slate-500 mt-0.5">{a.notes}</p>}
                      {a.nextAction && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Sonraki adım: {a.nextAction}
                          {a.nextFollowupDate && ` (${a.nextFollowupDate})`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
