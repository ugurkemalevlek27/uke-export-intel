import { db } from "@/db";
import { importBatches, tradeRecords, projects } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { PageHeader, KpiCard, EmptyState } from "@/components/ui";
import { guardPage } from "@/lib/pageGuard";
import { AccessDenied } from "@/components/AccessDenied";
import { DeleteBatchForm } from "./DeleteBatchForm";
import { requireOrganizationId } from "@/lib/tenant";

/**
 * Veri Yonetimi (Yonetim > Veri Yonetimi)
 *
 * Yuklenen her partinin GERCEK durumu burada gorunur ve gerektiginde geri
 * alinir. "Ice Aktarma Gecmisi" ekranindan farki: orasi bir KAYIT defteridir
 * (ne zaman ne yuklendi), burasi bir YONETIM ekranidir (silme).
 *
 * Partinin "bildirdigi" successCount degil, veritabanindaki GERCEK bagli kayit
 * sayisi gosterilir: yarim kalmis yuklemelerde ikisi birbirini tutmaz ve asil
 * sorun tam olarak orada saklidir.
 */
export default async function DataAdminPage() {
  const guard = await guardPage("deleteData");
  if (!guard.allowed) {
    return <AccessDenied title="Veri Yönetimi" role={guard.role} needed="veri silme" />;
  }
  const organizationId = await requireOrganizationId();

  const [batches, projectList, totals] = await Promise.all([
    db
      .select({
        id: importBatches.id,
        fileName: importBatches.fileName,
        projectId: importBatches.projectId,
        status: importBatches.status,
        rowCount: importBatches.rowCount,
        successCount: importBatches.successCount,
        errorCount: importBatches.errorCount,
        createdAt: importBatches.createdAt,
        uploadedBy: importBatches.uploadedBy,
        // GERCEK bagli kayit sayisi - partinin kendi bildirdigi sayiya guvenilmez.
        actualCount: sql<string>`(
          SELECT COUNT(*) FROM ${tradeRecords}
          WHERE ${tradeRecords.importBatchId} = ${importBatches.id}
        )`,
      })
      .from(importBatches)
      .where(eq(importBatches.organizationId, organizationId))
      .orderBy(desc(importBatches.createdAt))
      .limit(200),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.organizationId, organizationId)),
    db
      .select({
        records: sql<string>`COUNT(*)`,
        companies: sql<string>`COUNT(DISTINCT ${tradeRecords.companyId})`,
      })
      .from(tradeRecords)
      .where(eq(tradeRecords.organizationId, organizationId))
      .then((r) => r[0]),
  ]);

  const projectName = new Map(projectList.map((p) => [p.id, p.name]));
  const sorunlu = batches.filter(
    (b) => b.status !== "completed" || Number(b.actualCount) !== (b.successCount ?? 0)
  );

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Veri Yönetimi"
        description="Yüklenen veriyi buradan kalıcı olarak silebilirsiniz. Silme geri alınamaz."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="TOPLAM KAYIT" value={Number(totals?.records ?? 0).toLocaleString("tr-TR")} />
        <KpiCard label="FİRMA" value={Number(totals?.companies ?? 0).toLocaleString("tr-TR")} />
        <KpiCard label="YÜKLEME" value={String(batches.length)} />
        <KpiCard label="SORUNLU YÜKLEME" value={String(sorunlu.length)} />
      </div>

      {sorunlu.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-6">
          <p className="text-sm font-medium text-amber-900">
            {sorunlu.length} yükleme yarım kalmış ya da bildirdiği sayı tutmuyor
          </p>
          <p className="text-xs text-amber-800 mt-1">
            Durumu &quot;processing&quot; kalmış bir yükleme, işlem tamamlanmadan kesilmiştir:
            satırların bir kısmı yazılmış olabilir. Bu kayıtlar analizlere karışır. Aşağıdaki
            listede &quot;Gerçek&quot; sütunu veritabanındaki asıl satır sayısını gösterir.
          </p>
        </div>
      )}

      {batches.length === 0 ? (
        <EmptyState text="Henüz veri yüklenmemiş — içe aktarma yapıldığında burada listelenir." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr className="text-left">
                <th className="p-3 font-medium">Dosya</th>
                <th className="p-3 font-medium">Proje</th>
                <th className="p-3 font-medium">Durum</th>
                <th className="p-3 font-medium text-right">Bildirilen</th>
                <th className="p-3 font-medium text-right">Gerçek</th>
                <th className="p-3 font-medium">Tarih</th>
                <th className="p-3 font-medium w-72">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const gercek = Number(b.actualCount);
                const tutarsiz = b.status !== "completed" || gercek !== (b.successCount ?? 0);
                return (
                  <tr key={b.id} className="border-t border-slate-100 align-top">
                    <td className="p-3 text-slate-800">{b.fileName}</td>
                    <td className="p-3 text-slate-500 text-xs">
                      {b.projectId ? projectName.get(b.projectId) ?? "—" : "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          b.status === "completed"
                            ? "text-xs text-slate-500"
                            : "text-xs text-amber-700 font-medium"
                        }
                      >
                        {b.status === "completed" ? "tamamlandı" : b.status}
                      </span>
                    </td>
                    <td className="p-3 text-right text-slate-500 tabular-nums">
                      {(b.successCount ?? 0).toLocaleString("tr-TR")}
                    </td>
                    <td
                      className={
                        tutarsiz
                          ? "p-3 text-right font-medium text-amber-700 tabular-nums"
                          : "p-3 text-right text-slate-700 tabular-nums"
                      }
                    >
                      {gercek.toLocaleString("tr-TR")}
                    </td>
                    <td className="p-3 text-slate-400 text-xs whitespace-nowrap">
                      {b.createdAt.toLocaleDateString("tr-TR")}
                    </td>
                    <td className="p-3">
                      <DeleteBatchForm batchId={b.id} fileName={b.fileName} recordCount={gercek} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
