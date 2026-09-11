// Yönetim > Projeler (Phase 5)
//
// Her proje bir "client workspace"tir: veriler, lead'ler ve skorlar proje
// bazinda ayrilir. Bu ekran projelerin kaynak veri hacmini de gosterir,
// boylece hangi calisma dolu hangisi bos net gorulur.

import { db } from "@/db";
import { projects, tradeRecords, companyProjects, importBatches } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { PageHeader, EmptyState, formatUsd } from "@/components/ui";
import { createProjectAction, updateProjectAction } from "./actions";
import { guardPage } from "@/lib/pageGuard";
import { AccessDenied } from "@/components/AccessDenied";

const STATUS_LABELS: Record<string, string> = {
  active: "Aktif",
  paused: "Duraklatıldı",
  completed: "Tamamlandı",
  archived: "Arşivlendi",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
  archived: "bg-slate-100 text-slate-400 border-slate-200",
};

const inputCls = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export default async function AdminProjectsPage() {
  const guard = await guardPage("manageProjects");
  if (!guard.allowed)
    return <AccessDenied title="Projeler" role={guard.role} needed="proje yönetimi" />;

  const organizationId = guard.session.organizationId;

  // Tek sorguda proje + hacim ozeti (client-side aggregate YAPILMAZ).
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      productGroup: projects.productGroup,
      description: projects.description,
      status: sql<string>`${projects.status}::text`,
      dateFrom: projects.dateFrom,
      dateTo: projects.dateTo,
      targetCountries: projects.targetCountries,
      hsCodes: projects.hsCodes,
      createdAt: projects.createdAt,
      recordCount: sql<string>`(
        SELECT COUNT(*) FROM ${tradeRecords}
        WHERE ${tradeRecords.projectId} = ${projects.id}
          AND ${tradeRecords.organizationId} = ${organizationId}
      )`,
      totalValueUsd: sql<string>`(
        SELECT COALESCE(SUM(${tradeRecords.valueUsd}), 0) FROM ${tradeRecords}
        WHERE ${tradeRecords.projectId} = ${projects.id}
          AND ${tradeRecords.organizationId} = ${organizationId}
      )`,
      leadCount: sql<string>`(
        SELECT COUNT(*) FROM ${companyProjects}
        WHERE ${companyProjects.projectId} = ${projects.id}
      )`,
      importCount: sql<string>`(
        SELECT COUNT(*) FROM ${importBatches}
        WHERE ${importBatches.projectId} = ${projects.id}
      )`,
    })
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .orderBy(desc(projects.createdAt));

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title="Projeler"
        description="Her proje ayrı bir müşteri/çalışma alanıdır. Veriler ve lead'ler projeler arasında karışmaz."
      />

      <details className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <summary className="text-sm font-semibold text-slate-900 cursor-pointer hover:text-slate-700">
          + Yeni proje oluştur
        </summary>
        <form action={createProjectAction} className="mt-4 grid sm:grid-cols-2 gap-2">
          <input name="name" required placeholder="Proje adı * (örn. Boya - Azerbaycan)" className={inputCls} />
          <input name="clientName" placeholder="Müşteri (örn. Coral Paints)" className={inputCls} />
          <input name="productGroup" placeholder="Ürün grubu (örn. Su bazlı boya)" className={inputCls} />
          <input name="targetCountries" placeholder="Hedef ülkeler (virgülle: AZ, GE, KZ)" className={inputCls} />
          <input name="hsCodes" placeholder="GTİP kodları (virgülle: 320890, 320820)" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" name="dateFrom" className={inputCls} title="Veri başlangıcı" />
            <input type="date" name="dateTo" className={inputCls} title="Veri bitişi" />
          </div>
          <textarea name="description" rows={2} placeholder="Açıklama" className={`${inputCls} sm:col-span-2`} />
          <div className="sm:col-span-2">
            <button className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800">
              Proje Oluştur
            </button>
          </div>
        </form>
      </details>

      {rows.length === 0 ? (
        <EmptyState text="Henüz proje yok. Yukarıdaki formdan ilk projenizi oluşturun." />
      ) : (
        <div className="space-y-4">
          {rows.map((p) => {
            const records = Number(p.recordCount) || 0;
            const value = Number(p.totalValueUsd) || 0;
            return (
              <div key={p.id} className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold text-slate-900">{p.name}</h2>
                      <span
                        className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${
                          STATUS_TONE[p.status] ?? STATUS_TONE.archived
                        }`}
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {[p.clientName, p.productGroup].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {(p.targetCountries?.length || p.hsCodes?.length) && (
                      <p className="text-xs text-slate-400 mt-1">
                        {p.targetCountries?.length ? `Ülkeler: ${p.targetCountries.join(", ")}` : ""}
                        {p.targetCountries?.length && p.hsCodes?.length ? " · " : ""}
                        {p.hsCodes?.length ? `GTİP: ${p.hsCodes.join(", ")}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-6 text-right flex-wrap">
                    <Metric label="Kayıt" value={records.toLocaleString("tr-TR")} />
                    <Metric label="Hacim" value={records > 0 ? formatUsd(value) : "—"} />
                    <Metric label="Lead" value={Number(p.leadCount).toLocaleString("tr-TR")} />
                    <Metric label="Yükleme" value={Number(p.importCount).toLocaleString("tr-TR")} />
                  </div>
                </div>

                <details className="mt-3 border-t border-slate-100 pt-3">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-900">
                    Düzenle
                  </summary>
                  <form
                    action={updateProjectAction.bind(null, p.id)}
                    className="mt-3 grid sm:grid-cols-2 gap-2"
                  >
                    <input name="name" defaultValue={p.name} required className={inputCls} />
                    <select name="status" defaultValue={p.status} className={inputCls}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <input name="clientName" defaultValue={p.clientName ?? ""} placeholder="Müşteri" className={inputCls} />
                    <input name="productGroup" defaultValue={p.productGroup ?? ""} placeholder="Ürün grubu" className={inputCls} />
                    <input
                      name="targetCountries"
                      defaultValue={(p.targetCountries ?? []).join(", ")}
                      placeholder="Hedef ülkeler"
                      className={inputCls}
                    />
                    <input
                      name="hsCodes"
                      defaultValue={(p.hsCodes ?? []).join(", ")}
                      placeholder="GTİP kodları"
                      className={inputCls}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" name="dateFrom" defaultValue={p.dateFrom ?? ""} className={inputCls} />
                      <input type="date" name="dateTo" defaultValue={p.dateTo ?? ""} className={inputCls} />
                    </div>
                    <textarea
                      name="description"
                      rows={2}
                      defaultValue={p.description ?? ""}
                      placeholder="Açıklama"
                      className={`${inputCls} sm:col-span-2`}
                    />
                    <div className="sm:col-span-2">
                      <button className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-slate-800">
                        Kaydet
                      </button>
                      <span className="ml-3 text-xs text-slate-400">
                        Proje silinmez — kullanılmayan projeyi &quot;Arşivlendi&quot; yapın.
                      </span>
                    </div>
                  </form>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}
