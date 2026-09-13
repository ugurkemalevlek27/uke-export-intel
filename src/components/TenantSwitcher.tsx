"use client";

import { useRef } from "react";

/**
 * Kiraci (sirket) secici — YALNIZCA platform yoneticisine (UKE) gosterilir.
 *
 * Bu bilesen bir KOLAYLIKTIR, guvenlik siniri DEGILDIR: gorunmemesi erisimi
 * engellemez. Gercek kontrol sunucuda (lib/tenant.ts + lib/tenantActions.ts)
 * yapilir; super_admin olmayan birinin gonderdigi secim yok sayilir.
 */
export function TenantSwitcher({
  tenants,
  activeId,
  action,
}: {
  tenants: { id: number; name: string }[];
  activeId: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="px-5 py-3 border-b border-slate-800">
      <label className="block text-[10px] tracking-widest text-amber-400/80 font-medium mb-1.5">
        ŞİRKET (UKE YÖNETİCİ)
      </label>
      <select
        name="organizationId"
        defaultValue={String(activeId)}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded px-2 py-1.5 focus:outline-none focus:border-amber-500"
      >
        {tenants.map((t) => (
          <option key={t.id} value={t.id} className="bg-slate-800 text-slate-100">
            {t.name}
          </option>
        ))}
      </select>
    </form>
  );
}
