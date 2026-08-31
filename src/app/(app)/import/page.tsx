import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { createProjectAction } from "./actions";
import ImportForm from "./ImportForm";

export default async function ImportPage() {
  const session = await getSession();
  const projectList = await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, session!.organizationId));

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader
        title="Veri İçe Aktar"
        description="Ticaret/gümrük verisi içeren bir Excel (.xlsx) veya CSV dosyası yükleyin."
      />

      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">1. Proje Seçin</h2>
        {projectList.length === 0 ? (
          <p className="text-sm text-slate-500 mb-3">Henüz proje yok, önce bir proje oluşturun.</p>
        ) : null}
        <form action={createProjectAction} className="flex gap-2">
          <input
            name="name"
            placeholder="Yeni proje adı (örn. Ambalaj Filmleri - Kazakistan)"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="bg-slate-100 text-slate-700 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-200">
            Proje Oluştur
          </button>
        </form>
      </div>

      <ImportForm projects={projectList.map((p) => ({ id: p.id, name: p.name }))} />

      <div className="mt-6 text-xs text-slate-400 leading-relaxed">
        <p className="font-medium text-slate-500 mb-1">Beklenen sütunlar (herhangi bir sırada olabilir):</p>
        <p>
          HS_Code, Exporter, Country_of_Exporters, Importer, Country_of_Importers, Date,
          Actual_Detailed_Product, Unit_Qty (opsiyonel), Value(USD), Quantity, MT, Shipments
        </p>
      </div>
    </div>
  );
}
