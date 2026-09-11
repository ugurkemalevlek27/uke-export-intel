"use client";

import { useActionState } from "react";
import { changeOwnPasswordAction } from "./actions";

const inputCls = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changeOwnPasswordAction, undefined);

  return (
    <form action={formAction} className="grid sm:grid-cols-3 gap-2 max-w-2xl">
      <input
        name="currentPassword"
        type="password"
        required
        placeholder="Mevcut şifre"
        autoComplete="current-password"
        className={inputCls}
      />
      <input
        name="newPassword"
        type="password"
        required
        minLength={10}
        placeholder="Yeni şifre (en az 10)"
        autoComplete="new-password"
        className={inputCls}
      />
      <input
        name="confirmPassword"
        type="password"
        required
        minLength={10}
        placeholder="Yeni şifre (tekrar)"
        autoComplete="new-password"
        className={inputCls}
      />
      <div className="sm:col-span-3 flex items-center gap-3">
        <button
          disabled={pending}
          className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Değiştiriliyor..." : "Şifreyi Değiştir"}
        </button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">Şifreniz güncellendi.</span>}
      </div>
    </form>
  );
}
