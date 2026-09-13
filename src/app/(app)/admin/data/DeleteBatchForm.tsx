"use client";

import { useActionState, useState } from "react";
import { deleteImportBatchAction, type DeleteBatchState } from "./actions";

/**
 * Tek bir yukleme partisini geri alma formu.
 *
 * Iki kademeli onay: once "Sil" ile acilir, sonra dosya adi BIREBIR yazilir.
 * Islem geri alinamaz oldugu icin tek tikla silinmesi bilerek zorlastirildi.
 */
export function DeleteBatchForm({
  batchId,
  fileName,
  recordCount,
}: {
  batchId: number;
  fileName: string;
  recordCount: number;
}) {
  const [state, formAction, pending] = useActionState<DeleteBatchState | undefined, FormData>(
    deleteImportBatchAction,
    undefined
  );
  const [open, setOpen] = useState(false);

  if (state?.success) {
    const s = state.success;
    return (
      <div className="text-xs text-emerald-700">
        Silindi: {s.deletedRecords.toLocaleString("tr-TR")} kayıt
        {s.deletedCompanies > 0 && `, ${s.deletedCompanies} firma`}
        {s.keptCompanies > 0 && ` — ${s.keptCompanies} firma CRM verisi olduğu için korundu`}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-red-600 hover:text-red-800 hover:underline"
      >
        Sil
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 bg-red-50 border border-red-200 rounded-md p-3">
      <input type="hidden" name="batchId" value={batchId} />
      <p className="text-xs text-red-900">
        <strong>{recordCount.toLocaleString("tr-TR")}</strong> ticaret kaydı kalıcı olarak
        silinecek. Bu işlem geri alınamaz.
      </p>
      <p className="text-xs text-red-800">
        Onaylamak için dosya adını yazın: <code className="font-mono">{fileName}</code>
      </p>
      <input
        name="confirmText"
        autoComplete="off"
        placeholder={fileName}
        className="w-full border border-red-300 rounded px-2 py-1 text-xs text-slate-900 bg-white"
      />
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Siliniyor…" : "Kalıcı olarak sil"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-600 px-3 py-1.5 rounded hover:bg-slate-100"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
