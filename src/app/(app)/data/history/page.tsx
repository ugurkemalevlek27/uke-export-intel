import { getActiveProjectId } from "@/lib/projectContext";
import { db } from "@/db";
import { importBatches, projects } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { PageHeader, KpiCard, EmptyState } from "@/components/ui";
import Link from "next/link";
import { guardPage } from "@/lib/pageGuard";
import { AccessDenied } from "@/components/AccessDenied";

/**
 * Ice Aktarma Gecmisi (Phase 4)
 *
 * Her yukleme kayit altina alinir (provenance): hangi dosya, ne zaman, kim
 * tarafindan, kac satir, kaci atlandi ve hangi sutun eslestirmesi kullanildi.
 * "Bu rakam hangi dosyadan geldi?" sorusunun cevabi buradan izlenir.
 */
export default async function ImportHistoryPage() {
  const guard = await guardPage("importData");
  if (!guard.allowed) return <AccessDenied title="İçe Aktarma Geçmişi" role={guard.role} needed="veri içe aktarma" />;
  const session = guard.session;
  const organizationId = session!.organizationId;
  const projectId = await getActiveProjectId(organizationId);

  const where =
    projectId === undefined
      ? eq(importBatches.organizationId, organizationId)
      : and(eq(importBatches.organizationId, organizationId), eq(importBatches.projectId, projectId))!;

  const [batches, projectList, totals] = await Promise.all([
    db.select().from(importBatches).where(where).orderBy(desc(importBatches.createdAt)).limit(100),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.organizationId, organizationId)),
    db
      .select({
        files: sql<string>`COUNT(*)`,
        rows: sql<string>`COALESCE(SUM(${importBatches.successCount}), 0)`,
        skipped: sql<string>`COALESCE(SUM(${importBatches.skippedDuplicateCount}), 0)`,
        errors: sql<string>`COALESCE(SUM(${importBatches.errorCount}), 0)`,
      })
      .from(importBatches)
      .where(where)
      .then((r) => r[0]),
  ]);

  const projectName = new Map(projectList.map((p) => [p.id, p.name]));

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="İçe Aktarma Geçmişi"
        description="Yüklenen her dosyanın kaydı — hangi rakamın hangi dosyadan geldiği buradan izlenir."
      />

      {batches.length === 0 ? (
        <EmptyState text="Henüz dosya yüklenmemiş. Veri İçe Aktar sayfasından başlayın." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="YÜKLENEN DOSYA" value={Number(totals?.files ?? 0).toLocaleString("tr-TR")} />
            <KpiCard label="EKLENEN SATIR" value={Number(totals?.rows ?? 0).toLocaleString("tr-TR")} />
            <KpiCard
              label="ATLANAN (DUPLICATE)"
              value={Number(totals?.skipped ?? 0).toLocaleString("tr-TR")}
            />
            <KpiCard label="HATALI SATIR" value={Number(totals?.errors ?? 0).toLocaleString("tr-TR")} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 pr-4 font-medium">Dosya</th>
                  <th className="pb-2 pr-4 font-medium">Proje</th>
                  <th className="pb-2 pr-4 font-medium">Yükleyen</th>
                  <th className="pb-2 pr-4 font-medium text-right">Satır</th>
                  <th className="pb-2 pr-4 font-medium text-right">Eklenen</th>
                  <th className="pb-2 pr-4 font-medium text-right">Atlanan</th>
                  <th className="pb-2 pr-4 font-medium text-right">Hatalı</th>
                  <th className="pb-2 font-medium text-right">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-800 max-w-[260px] truncate" title={b.fileName}>
                      {b.fileName}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500">
                      {b.projectId ? projectName.get(b.projectId) ?? `#${b.projectId}` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500 max-w-[180px] truncate">{b.uploadedBy ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-500 tabular-nums">
                      {(b.rowCount ?? 0).toLocaleString("tr-TR")}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-900 font-medium tabular-nums">
                      {(b.successCount ?? 0).toLocaleString("tr-TR")}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {(b.skippedDuplicateCount ?? 0) > 0 ? (
                        <span className="text-amber-700">{b.skippedDuplicateCount!.toLocaleString("tr-TR")}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {(b.errorCount ?? 0) > 0 ? (
                        <span className="text-red-600">{b.errorCount!.toLocaleString("tr-TR")}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-slate-400 text-xs tabular-nums">
                      {b.createdAt ? new Date(b.createdAt).toLocaleString("tr-TR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            &quot;Atlanan&quot; sütunu, daha önce yüklenmiş kayıtlarla birebir aynı olduğu için eklenmeyen
            satırları gösterir — rakamların çift sayılmasını engelleyen koruma.{" "}
            <Link href="/data/quality" className="hover:underline">
              Veri Kalitesi
            </Link>{" "}
            sayfasından detayları inceleyebilirsiniz.
          </p>
        </>
      )}
    </div>
  );
}
