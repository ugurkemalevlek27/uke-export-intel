"use client";

// Mobil menu acma/kapama (Phase 5)
//
// Telefonda sol menu varsayilan olarak GIZLI; bu buton onu ustune bindirerek
// acar. Masaustunde (lg ve uzeri) buton hic gorunmez, menu her zaman acik.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function MobileNavToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Sayfa degisince menuyu kapat (mobilde link'e basinca beklenen davranis).
  // Effect yerine "render sirasinda state duzeltme" kalibi kullaniliyor:
  // React bunu onerir ve fazladan bir render dongusu olusmaz.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Menu acikken arka planin kaymasini engelle.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Mobil ust bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-slate-900 text-white px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={open}
          className="p-1 -ml-1 rounded hover:bg-slate-800"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
        <div className="min-w-0">
          <div className="text-[9px] tracking-widest text-slate-400 font-medium leading-none">
            UKE GLOBAL
          </div>
          <div className="text-sm font-semibold leading-tight">Export Intelligence</div>
        </div>
      </div>

      {/* Arka plan orusu - sadece menu acikken */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/50"
          aria-hidden="true"
        />
      )}

      <div
        className={`${
          open ? "flex" : "hidden"
        } lg:flex fixed lg:sticky inset-y-0 left-0 z-50 w-64 shrink-0 bg-slate-900 text-slate-100 flex-col lg:top-0 h-screen`}
      >
        {children}
      </div>
    </>
  );
}
