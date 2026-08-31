export function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="text-xs font-medium text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export function ScoreBadge({ score, label }: { score: number | null; label: string | null }) {
  if (score === null) {
    return <span className="text-xs text-slate-400">Not Available</span>;
  }
  const colors: Record<string, string> = {
    "Yuksek Potansiyel": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Orta Potansiyel": "bg-amber-50 text-amber-700 border-amber-200",
    "Dusuk Potansiyel": "bg-slate-100 text-slate-500 border-slate-200",
  };
  const labelTr: Record<string, string> = {
    "Yuksek Potansiyel": "Yüksek Potansiyel",
    "Orta Potansiyel": "Orta Potansiyel",
    "Dusuk Potansiyel": "Düşük Potansiyel",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${colors[label ?? ""] ?? ""}`}>
      <span className="font-semibold">{score}</span>
      <span className="opacity-70">/ 100</span>
      <span className="opacity-60">·</span>
      <span>{labelTr[label ?? ""] ?? label}</span>
    </span>
  );
}

export function formatUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
      {text}
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
    </div>
  );
}
