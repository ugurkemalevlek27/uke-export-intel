"use client";

import { useRef } from "react";
import type { ProjectSummary } from "@/lib/projectContext";

/**
 * Aktif proje (client workspace) secici.
 *
 * Secim degistiginde form otomatik gonderilir; server action cookie'yi yazar ve
 * layout revalidate edilir - boylece TUM analiz ekranlari yeni proje context'i
 * ile yeniden render olur.
 *
 * "Tüm Projeler" secenegi organizasyon geneli analiz demektir (projectId yok).
 */
export function ProjectSwitcher({
  projects,
  activeProjectId,
  action,
}: {
  projects: ProjectSummary[];
  activeProjectId: number | null;
  action: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="px-4 py-3 border-b border-slate-800">
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        Aktif Proje
      </label>
      <select
        name="projectId"
        defaultValue={activeProjectId === null ? "all" : String(activeProjectId)}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm px-2.5 py-1.5 focus:outline-none focus:border-slate-500"
      >
        <option value="all">Tüm Projeler</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.clientName ? `${p.clientName} — ${p.name}` : p.name}
          </option>
        ))}
      </select>
      <noscript>
        <button className="mt-1.5 w-full text-xs bg-slate-700 text-white rounded py-1">
          Değiştir
        </button>
      </noscript>
    </form>
  );
}
