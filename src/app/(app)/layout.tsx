import { getSession, destroySession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { navigationFor } from "@/lib/navigation";
import { normalizeRole, ROLE_LABELS_TR } from "@/lib/roles";
import { listProjects, getActiveProjectId } from "@/lib/projectContext";
import { setActiveProjectAction } from "@/lib/projectActions";
import { Sidebar } from "@/components/Sidebar";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { MobileNavToggle } from "@/components/MobileNavToggle";
import { getTenantContext, listAccessibleTenants } from "@/lib/tenant";
import { setActiveTenantAction } from "@/lib/tenantActions";
import { TenantSwitcher } from "@/components/TenantSwitcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Rol JWT'de tutulmuyor (V1 token'lari role icermiyor); veritabanindan okunur.
  // Boylece rol degisikligi kullanicinin yeniden giris yapmasini gerektirmez.
  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const role = normalizeRole(dbUser?.role);

  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");
  const organizationId = tenant.organizationId;
  // Kiraci listesi YALNIZCA platform yoneticisi icin anlamli; digerlerinde tek oge doner.
  const tenants = tenant.isPlatformAdmin ? await listAccessibleTenants() : [];

  const [projects, activeProjectId] = await Promise.all([
    listProjects(organizationId),
    getActiveProjectId(organizationId),
  ]);

  const groups = navigationFor(role);

  async function logout() {
    "use server";
    await destroySession();
    redirect("/login");
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50">
      <MobileNavToggle>
        <div className="hidden lg:block px-5 py-4 border-b border-slate-800">
          <div className="text-[10px] tracking-widest text-slate-400 font-medium">UKE GLOBAL</div>
          <div className="text-sm font-semibold">Export Intelligence</div>
        </div>

        {tenant.isPlatformAdmin && (
          <TenantSwitcher
            tenants={tenants}
            activeId={organizationId}
            action={setActiveTenantAction}
          />
        )}

        <ProjectSwitcher
          projects={projects}
          activeProjectId={activeProjectId ?? null}
          action={setActiveProjectAction}
        />

        <Sidebar groups={groups} />

        <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-400">
          <div className="truncate text-slate-300">{session.name ?? session.email}</div>
          <div className="text-[10px] text-slate-500 mb-2">{ROLE_LABELS_TR[role]}</div>
          <div className="flex items-center gap-3">
            <Link href="/admin/settings" className="text-slate-400 hover:text-white transition-colors">
              Hesabım
            </Link>
            <span className="text-slate-700">·</span>
            <form action={logout}>
              <button className="text-slate-400 hover:text-white transition-colors">Çıkış Yap</button>
            </form>
          </div>
        </div>
      </MobileNavToggle>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
