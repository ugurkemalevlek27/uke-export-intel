"use client";

import { useActionState } from "react";
import { importFileAction, ImportActionState } from "./actions";

export default function ImportForm({ projects }: { projects: { id: number; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ImportActionState | undefined, FormData>(
    importFileAction,
    undefined
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">2. Dosya Yükle</h2>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Proje</label>
          <select
            name="projectId"
            required
            disabled={projects.length === 0}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Dosya (.xlsx veya .csv)</label>
          <input
            type="file"
            name="file"
            accept=".xlsx,.csv"
            required
            disabled={projects.length === 0}
            className="w-full text-sm"
          />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.success && (
          <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md p-3">
            <p className="font-medium">{state.success.fileName} içe aktarıldı.</p>
            <p className="mt-1 text-emerald-700">
              {state.success.successCount} / {state.success.rowCount} satır başarılı
              {state.success.errorCount > 0 && `, ${state.success.errorCount} satır atlandı`}
              {state.success.duplicateCandidateCount > 0 &&
                ` — ${state.success.duplicateCandidateCount} olası duplicate firma tespit edildi`}
              .
            </p>
          </div>
        )}
        <button
          type="submit"
          disabled={pending || projects.length === 0}
          className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "İşleniyor..." : "İçe Aktar"}
        </button>
      </form>
    </div>
  );
}
