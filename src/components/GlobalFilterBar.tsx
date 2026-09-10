"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface FilterOptions {
  importerCountries: string[];
  exporterCountries: string[];
  hs4Codes: string[];
}

/**
 * Tum analiz ekranlarinda ortak calisan global filtre cubugu.
 *
 * - Filtreler URL query parametrelerine yazilir: sayfa yenilenince kaybolmaz,
 *   link paylasilabilir.
 * - Bos birakilan alanlar URL'e HIC yazilmaz (temiz link).
 * - "project" parametresine dokunulmaz: aktif proje sol menudeki secici ile
 *   yonetilir ve filtre sifirlansa bile korunur.
 * - Filtreleme veritabaninda yapilir (bkz. lib/filters.ts) - bu bilesen sadece
 *   URL'i gunceller, veri cekmez.
 */
export function GlobalFilterBar({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = (k: string) => searchParams.get(k) ?? "";

  const activeCount = [
    "dateFrom", "dateTo", "importerCountry", "exporterCountry",
    "hsCode", "hs2", "hs4", "hs6", "importer", "exporter", "product",
  ].filter((k) => get(k) !== "").length;

  const [open, setOpen] = useState(activeCount > 0);

  function apply(formData: FormData) {
    const params = new URLSearchParams();

    // Aktif proje ve sekme gibi filtre disi parametreler korunur
    for (const keep of ["project", "tab"]) {
      const v = searchParams.get(keep);
      if (v) params.set(keep, v);
    }

    for (const [key, value] of formData.entries()) {
      const v = String(value).trim();
      if (v !== "") params.set(key, v);
    }

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function reset() {
    const params = new URLSearchParams();
    for (const keep of ["project", "tab"]) {
      const v = searchParams.get(keep);
      if (v) params.set(keep, v);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm"
      >
        <span className="font-medium text-slate-800">
          Filtreler
          {activeCount > 0 && (
            <span className="ml-2 text-xs bg-slate-900 text-white rounded-full px-2 py-0.5">
              {activeCount} aktif
            </span>
          )}
        </span>
        <span className="text-slate-400 text-xs">{open ? "Gizle ▲" : "Göster ▼"}</span>
      </button>

      {open && (
        <form action={apply} className="border-t border-slate-100 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Başlangıç Tarihi">
              <input type="date" name="dateFrom" defaultValue={get("dateFrom")} className={inputCls} />
            </Field>
            <Field label="Bitiş Tarihi">
              <input type="date" name="dateTo" defaultValue={get("dateTo")} className={inputCls} />
            </Field>
            <Field label="İthalatçı Ülke">
              <Select name="importerCountry" value={get("importerCountry")} options={options.importerCountries} />
            </Field>
            <Field label="İhracatçı Ülke">
              <Select name="exporterCountry" value={get("exporterCountry")} options={options.exporterCountries} />
            </Field>
            <Field label="GTİP (HS4)">
              <Select name="hs4" value={get("hs4")} options={options.hs4Codes} />
            </Field>
            <Field label="GTİP (tam kod)">
              <input name="hsCode" defaultValue={get("hsCode")} placeholder="örn. 320890910029" className={inputCls} />
            </Field>
            <Field label="İthalatçı Firma">
              <input name="importer" defaultValue={get("importer")} placeholder="firma adında ara" className={inputCls} />
            </Field>
            <Field label="Tedarikçi">
              <input name="exporter" defaultValue={get("exporter")} placeholder="tedarikçi adında ara" className={inputCls} />
            </Field>
            <div className="col-span-2 md:col-span-4">
              <Field label="Ürün Açıklaması">
                <input name="product" defaultValue={get("product")} placeholder="ürün açıklamasında ara" className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800">
              Filtreleri Uygula
            </button>
            <button
              type="button"
              onClick={reset}
              className="border border-slate-300 text-slate-700 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Sıfırla
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:border-slate-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Select({ name, value, options }: { name: string; value: string; options: string[] }) {
  return (
    <select name={name} defaultValue={value} className={inputCls}>
      <option value="">Tümü</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
