import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h1 className="text-lg font-semibold text-slate-900">Kayıt bulunamadı</h1>
        <p className="text-sm text-slate-600 mt-2">
          Aradığınız firma, ülke veya ürün bu organizasyonda yok. Silinmiş, başka bir
          projeye ait ya da adres yanlış yazılmış olabilir.
        </p>
        <div className="flex gap-2 mt-5 flex-wrap">
          <Link
            href="/"
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Dashboard
          </Link>
          <Link
            href="/companies"
            className="border border-slate-300 rounded-md px-4 py-2 text-sm hover:bg-slate-50"
          >
            Firmalar
          </Link>
        </div>
      </div>
    </div>
  );
}
