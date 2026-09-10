"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PublicNavGroup } from "@/lib/navigation";

/**
 * Gruplu ana navigasyon. Menu tanimi lib/navigation.ts'ten prop olarak gelir -
 * bilesen icinde sabit liste yoktur, yeni modul eklemek icin bu dosya
 * degistirilmez.
 */
export function Sidebar({ groups }: { groups: PublicNavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto py-2">
      {groups.map((group, gi) => (
        <div key={group.title ?? `g${gi}`} className="mb-1">
          {group.title && (
            <div className="px-5 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.title}
            </div>
          )}
          {group.items.map((item) => {
            const base = item.href.split("?")[0];
            const isActive =
              base === "/" ? pathname === "/" : pathname === base || pathname.startsWith(base + "/");

            if (item.status === "planned") {
              return (
                <div
                  key={item.href}
                  className="flex items-center justify-between px-5 py-2 text-sm text-slate-600 cursor-not-allowed select-none"
                  title="Bu modül henüz hazır değil"
                >
                  <span>{item.label}</span>
                  <span className="text-[9px] uppercase tracking-wide bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                    Yakında
                  </span>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-5 py-2 text-sm transition-colors border-l-2 ${
                  isActive
                    ? "bg-slate-800 text-white border-white"
                    : "text-slate-300 border-transparent hover:bg-slate-800/60 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
