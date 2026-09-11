/**
 * Tek tikla PDF rapor indirme butonu.
 * Mevcut filtreler query string olarak aktarilir - rapor, ekranda gorunen
 * veri kumesinin aynisindan uretilir.
 */
export function ReportButton({
  type,
  param,
  query,
  label = "PDF Rapor",
}: {
  type: "country" | "company";
  param: string;
  query: string;
  label?: string;
}) {
  const key = type === "country" ? "country" : "companyId";
  const href = `/api/report${query ? query + "&" : "?"}type=${type}&${key}=${encodeURIComponent(param)}`;
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 bg-slate-900 text-white rounded-md px-3 py-1.5 text-xs font-medium hover:bg-slate-800"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
      </svg>
      {label}
    </a>
  );
}
