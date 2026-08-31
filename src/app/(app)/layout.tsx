import { getSession, destroySession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/companies", label: "Firmalar" },
  { href: "/import", label: "Veri İçe Aktar" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  async function logout() {
    "use server";
    await destroySession();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="text-[11px] tracking-widest text-slate-400 font-medium">UKE GLOBAL</div>
          <div className="text-sm font-semibold">Export Intelligence</div>
        </div>
        <nav className="flex-1 py-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-5 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-slate-800 text-xs text-slate-400">
          <div className="mb-2 truncate">{session.name ?? session.email}</div>
          <form action={logout}>
            <button className="text-slate-400 hover:text-white transition-colors">Çıkış Yap</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
