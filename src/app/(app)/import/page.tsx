import { db } from "@/db";
import { projects} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { PageHeader} from "@/components/ui";
import { can } from "@/lib/roles";
import { createProjectAction } from "./actions";
import ImportWizard from "./ImportWizard";
import Link from "next/link";
import { guardPage } from "@/lib/pageGuard";
import { AccessDenied } from "@/components/AccessDenied";

export default async function ImportPage() {
  const guard = await guardPage("importData");
  if (!guard.allowed)
    return <AccessDenied title="Veri İçe Aktar" role={guard.role} needed="veri içe aktarma" />;

  const organizationId = guard.session.organizationId;
  const role = guard.role;

  const projectList = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      productGroup: projects.productGroup,
    })
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .orderBy(asc(projects.name));

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader
        title="Veri İçe Aktar"
        description="Ticaret/gümrük verisi içeren Excel (.xlsx) veya CSV dosyanızı yükleyin. Sütunlar herhangi bir isimde olabilir — eşleştirmeyi siz onaylarsınız."
      />

      {can.manageProjects(role) && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Proje (Client Workspace)</h2>
          <p className="text-xs text-slate-400 mb-3">
            Her müşteri/çalışma için ayrı proje açın — veriler birbirine karışmaz.
          </p>
          {projectList.length === 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5 mb-3">
              Henüz proje yok. Dosya yükleyebilmek için önce bir proje oluşturun.
            </p>
          )}
          <form action={createProjectAction} className="grid md:grid-cols-4 gap-2">
            <input
              name="name"
              required
              placeholder="Proje adı (örn. Ambalaj - Kazakistan)"
              className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="clientName"
              placeholder="Müşteri (örn. ACC Ambalaj)"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button className="bg-slate-100 text-slate-700 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-200">
              Proje Oluştur
            </button>
          </form>
          {projectList.length > 0 && (
            <p className="text-xs text-slate-400 mt-3">
              Mevcut projeler: {projectList.map((p) => p.name).join(" · ")}
            </p>
          )}
        </div>
      )}

      <ImportWizard projects={projectList} />

      <p className="mt-4 text-xs text-slate-400">
        Yüklenen her dosya kayıt altına alınır.{" "}
        <Link href="/data/history" className="hover:underline">
          İçe Aktarma Geçmişi
        </Link>{" "}
        sayfasından geçmiş yüklemeleri görebilirsiniz.
      </p>
    </div>
  );
}
