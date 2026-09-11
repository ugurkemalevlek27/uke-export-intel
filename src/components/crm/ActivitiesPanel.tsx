// Firma sayfasi: Aktivite gecmisi + yeni aktivite kaydi (Phase 4)

import type { ActivityRow, ContactRow } from "@/lib/crm";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from "@/lib/crm";
import { createActivityAction } from "@/app/(app)/companies/[id]/actions";

const inputCls = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export function ActivitiesPanel({
  companyProjectId,
  activities,
  contacts,
  canEdit,
}: {
  companyProjectId: number | null;
  activities: ActivityRow[];
  contacts: ContactRow[];
  canEdit: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Aktiviteler</h2>
        <span className="text-xs text-slate-400">{activities.length} kayıt</span>
      </div>

      {companyProjectId === null ? (
        <p className="text-sm text-slate-400 mt-3">
          Aktivite kaydı için firmanın bir projeye bağlı olması gerekir.
        </p>
      ) : (
        <>
          {canEdit && (
            <details className="mt-3 border border-slate-100 rounded-md p-3">
              <summary className="text-sm font-medium text-slate-700 cursor-pointer hover:text-slate-900">
                + Aktivite kaydet
              </summary>
              <form
                action={createActivityAction.bind(null, companyProjectId)}
                className="mt-3 grid sm:grid-cols-2 gap-2"
              >
                <label className="block">
                  <span className="block text-xs text-slate-500 mb-1">Tür</span>
                  <select name="activityType" className={inputCls} defaultValue="email">
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTIVITY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-500 mb-1">Tarih</span>
                  <input type="date" name="activityDate" defaultValue={today} className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-500 mb-1">Kişi</span>
                  <select name="contactId" className={inputCls} defaultValue="">
                    <option value="">— seçilmedi —</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || `#${c.id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-500 mb-1">Sonraki takip tarihi</span>
                  <input type="date" name="nextFollowupDate" className={inputCls} />
                </label>
                <input name="result" placeholder="Sonuç (örn. cevap bekleniyor)" className={`${inputCls} sm:col-span-2`} />
                <input name="nextAction" placeholder="Sonraki adım" className={`${inputCls} sm:col-span-2`} />
                <textarea name="notes" rows={2} placeholder="Notlar" className={`${inputCls} sm:col-span-2`} />
                <div className="sm:col-span-2">
                  <button className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-slate-800">
                    Kaydet
                  </button>
                  <span className="ml-3 text-xs text-slate-400">
                    Kaydedince &quot;son temas&quot; tarihi otomatik güncellenir.
                  </span>
                </div>
              </form>
            </details>
          )}

          {activities.length === 0 ? (
            <p className="text-sm text-slate-400 mt-3">Henüz aktivite kaydı yok.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {activities.map((a) => (
                <li key={a.id} className="relative pl-4 border-l-2 border-slate-200">
                  <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-slate-400" />
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">
                      {ACTIVITY_TYPE_LABELS[a.activityType ?? ""] ?? a.activityType ?? "Not"}
                    </span>
                    <span className="text-xs text-slate-400">{fmtDate(a.activityDate)}</span>
                    {a.contactName && <span className="text-xs text-slate-500">· {a.contactName}</span>}
                    {a.userName && <span className="text-xs text-slate-400">· {a.userName}</span>}
                  </div>
                  {a.result && <p className="text-xs text-slate-600 mt-0.5">Sonuç: {a.result}</p>}
                  {a.notes && <p className="text-xs text-slate-500 mt-0.5">{a.notes}</p>}
                  {a.nextAction && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Sonraki adım: {a.nextAction}
                      {a.nextFollowupDate && ` (${a.nextFollowupDate})`}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
