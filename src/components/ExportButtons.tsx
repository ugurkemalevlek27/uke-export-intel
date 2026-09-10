/**
 * Excel / CSV disa aktarma butonlari.
 *
 * Mevcut filtreler query string olarak aynen aktarilir; yani kullanicinin
 * ekranda gordugu veri kumesi ne ise dosyaya o iner.
 */
export function ExportButtons({ dataset, query }: { dataset: string; query: string }) {
  const base = `/api/export${query ? query + "&" : "?"}dataset=${dataset}`;
  return (
    <div className="flex gap-2 text-xs">
      <a
        href={`${base}&format=xlsx`}
        className="border border-slate-300 rounded px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
      >
        Excel indir
      </a>
      <a
        href={`${base}&format=csv`}
        className="border border-slate-300 rounded px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
      >
        CSV indir
      </a>
    </div>
  );
}
