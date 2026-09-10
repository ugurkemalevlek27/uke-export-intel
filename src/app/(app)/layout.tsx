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

  const [projects, activeProjectId] = await Promise.all([
    listProjects(session.organizationId),
    getActiveProjectId(session.organizationId),
  ]);

  const groups = navigationFor(role);

  async function logout() {
    "use server";
    await destroySession();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 shrink-0 bg-slate-900 text-slate-100 flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-4 border-b border-slate-800">
          <div className="text-[10px] tracking-widest text-slate-400 font-medium">UKE GLOBAL</div>
          <div className="text-sm font-semibold">Export Intelligence</div>
        </div>

        <ProjectSwitcher
          projects={projects}
          activeProjectId={activeProjectId ?? null}
          action={setActiveProjectAction}
        />

        <Sidebar groups={groups} />

        <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-400">
          <div className="truncate text-slate-300">{session.name ?? session.email}</div>
          <div className="text-[10px] text-slate-500 mb-2">{ROLE_LABELS_TR[role]}</div>
          <form action={logout}>
            <button className="text-slate-400 hover:text-white transition-colors">Çıkış Yap</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
