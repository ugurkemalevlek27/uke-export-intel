// Sayfa gecislerinde iskelet (skeleton) — bos ekran yerine yapi gosterilir.
export default function AppLoading() {
  return (
    <div className="p-8 max-w-6xl animate-pulse">
      <div className="h-6 w-52 bg-slate-200 rounded mb-2" />
      <div className="h-4 w-80 bg-slate-100 rounded mb-8" />
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="h-3 w-16 bg-slate-100 rounded mb-3" />
            <div className="h-6 w-24 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-4 bg-slate-100 rounded" style={{ width: `${95 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
