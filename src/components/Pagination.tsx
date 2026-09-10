import Link from "next/link";

/**
 * Sunucu tarafi sayfalama kontrolleri.
 * hrefFor(page) cagiran ekran tarafindan verilir; boylece mevcut filtreler
 * (URL query parametreleri) sayfa degistirirken korunur.
 */
export function Pagination({
  page,
  pageSize,
  totalRows,
  totalPages,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return (
      <p className="mt-4 text-xs text-slate-400 tabular-nums">
        {totalRows.toLocaleString("tr-TR")} kayıt
      </p>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalRows);

  return (
    <div className="flex items-center justify-between mt-4 text-sm gap-4 flex-wrap">
      <span className="text-slate-500 tabular-nums">
        {from.toLocaleString("tr-TR")}–{to.toLocaleString("tr-TR")} / {totalRows.toLocaleString("tr-TR")}
        <span className="text-slate-400"> · sayfa {page}/{totalPages}</span>
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={hrefFor(page - 1)} className="border border-slate-300 bg-white rounded-md px-3 py-1.5 hover:bg-slate-50">
            ← Önceki
          </Link>
        )}
        {page < totalPages && (
          <Link href={hrefFor(page + 1)} className="border border-slate-300 bg-white rounded-md px-3 py-1.5 hover:bg-slate-50">
            Sonraki →
          </Link>
        )}
      </div>
    </div>
  );
}
