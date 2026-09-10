// Basit, sunucuda render edilen grafikler (Phase 2).
//
// Neden kutuphane degil: bu grafiklerin tamami statik. CSS ile ciziliyorlar,
// dolayisiyla tarayiciya ekstra JavaScript gitmiyor ve ilk render'da hazir
// geliyorlar. Etkilesim gerektiren gelismis grafikler icin ileride recharts
// (zaten bagimlilikta) client component olarak kullanilabilir.

import { formatUsd } from "./ui";

/** Donem bazli dikey cubuk grafik (aylik/yillik trend). */
export function TrendBars({
  points,
  emptyText = "Tarihi olan kayıt yok.",
}: {
  points: { period: string; totalValueUsd: number; transactionCount: number }[];
  emptyText?: string;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-400">{emptyText}</p>;
  }
  const max = Math.max(...points.map((p) => p.totalValueUsd), 1);

  return (
    <div className="flex items-end gap-1 h-40 pb-6">
      {points.map((p) => (
        <div
          key={p.period}
          className="flex-1 h-full flex flex-col items-center justify-end group"
          title={`${p.period}: ${formatUsd(p.totalValueUsd)} · ${p.transactionCount} işlem`}
        >
          <div
            className="w-full bg-slate-800 rounded-t group-hover:bg-slate-600 transition-colors"
            style={{ height: `${Math.max(2, (p.totalValueUsd / max) * 100)}%` }}
          />
          <span className="text-[9px] text-slate-400 mt-1 rotate-45 origin-left whitespace-nowrap">
            {p.period}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Yatay dagilim cubuklari (ulke / GTIP / tedarikci dagilimi). */
export function DistributionBars({
  rows,
  emptyText = "Veri yok.",
}: {
  rows: { label: string; value: number; sub?: string; href?: string }[];
  emptyText?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">{emptyText}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs mb-1 gap-3">
            <span className="text-slate-700 font-medium truncate">{r.label}</span>
            <span className="text-slate-500 shrink-0 tabular-nums">
              {formatUsd(r.value)}
              {r.sub ? ` · ${r.sub}` : ""}
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-800 rounded-full"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
