import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getTransactionsPage, getFilterOptions, getTradeKpis, TRANSACTION_SORTS, type TransactionSort } from "@/lib/analytics";
import { GlobalFilterBar } from "@/components/GlobalFilterBar";
import { Pagination } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { PageHeader, KpiCard, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

const PAGE_SIZE = 50;

/**
 * Islem Analizi (Phase 2)
 *
 * Sevkiyat seviyesi ham kayitlar. Veri milyonlarca satira cikabilecegi icin
 * sayfalama ve siralama SUNUCUDA yapilir - tarayiciya sayfa basina yalnizca
 * 50 satir gonderilir.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  const organizationId = session!.organizationId;

  const sp = await searchParams;
  const parsed = parseTradeFilters(sp);
  const activeProjectId = await getActiveProjectId(organizationId);
  const filters = { ...parsed, projectId: parsed.projectId ?? activeProjectId };

  const pageRaw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = pageRaw && /^\d+$/.test(pageRaw) ? Number(pageRaw) : 1;

  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort: TransactionSort =
    sortRaw && sortRaw in TRANSACTION_SORTS ? (sortRaw as TransactionSort) : "date_desc";

  const [result, kpis, filterOptions] = await Promise.all([
    getTransactionsPage(organizationId, filters, { page, pageSize: PAGE_SIZE, sort }),
    getTradeKpis(organizationId, filters),
    getFilterOptions(organizationId, filters),
  ]);

  const linkFor = (extra: Record<string, string | undefined>) =>
    `/trade/transactions${filtersToQuery(filters, { sort, ...extra })}`;

  return (
    <div className="p-8 max-w-[1400px]">
      <PageHeader
        title="İşlem Analizi"
        description="Sevkiyat seviyesi ham ticaret kayıtları."
      />

      <GlobalFilterBar options={filterOptions} />

      {result.totalRows === 0 ? (
        <EmptyState text="Bu filtrelerle eşleşen işlem yok." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="İŞLEM SAYISI" value={kpis.transactionCount.toLocaleString("tr-TR")} />
            <KpiCard label="TOPLAM DEĞER" value={formatUsd(kpis.totalValueUsd)} />
            <KpiCard label="SEVKİYAT" value={kpis.totalShipments.toLocaleString("tr-TR")} />
            <KpiCard label="ORT. İŞLEM" value={formatUsd(kpis.avgShipmentValueUsd)} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-500">Sırala:</span>
                <SortLink current={sort} value="date_desc" href={linkFor({ sort: "date_desc" })}>Tarih ↓</SortLink>
                <SortLink current={sort} value="date_asc" href={linkFor({ sort: "date_asc" })}>Tarih ↑</SortLink>
                <SortLink current={sort} value="value_desc" href={linkFor({ sort: "value_desc" })}>Değer ↓</SortLink>
                <SortLink current={sort} value="value_asc" href={linkFor({ sort: "value_asc" })}>Değer ↑</SortLink>
              </div>
              <ExportButtons dataset="transactions" query={filtersToQuery(filters, { sort })} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 pr-4 font-medium">Tarih</th>
                    <th className="pb-2 pr-4 font-medium">İthalatçı</th>
                    <th className="pb-2 pr-4 font-medium">Ülke</th>
                    <th className="pb-2 pr-4 font-medium">Tedarikçi</th>
                    <th className="pb-2 pr-4 font-medium">Menşei</th>
                    <th className="pb-2 pr-4 font-medium">GTİP</th>
                    <th className="pb-2 pr-4 font-medium">Ürün</th>
                    <th className="pb-2 pr-4 font-medium text-right">Miktar</th>
                    <th className="pb-2 pr-4 font-medium text-right">Ağırlık (MT)</th>
                    <th className="pb-2 pr-4 font-medium text-right">Değer (USD)</th>
                    <th className="pb-2 font-medium">Kaynak</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="py-2.5 pr-4 text-slate-500 tabular-nums">{r.transactionDate ?? "—"}</td>
                      <td className="py-2.5 pr-4 max-w-[220px] truncate" title={r.importerName}>
                        {r.companyId ? (
                          <Link href={`/companies/${r.companyId}`} className="text-slate-800 hover:underline">
                            {r.importerName}
                          </Link>
                        ) : (
                          <span className="text-slate-700">{r.importerName}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">{r.importerCountry ?? "—"}</td>
                      <td className="py-2.5 pr-4 max-w-[220px] truncate text-slate-700" title={r.exporterName ?? ""}>
                        {r.exporterName ?? "Not Available"}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">{r.exporterCountry ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-slate-600 font-mono text-xs">{r.hsCode}</td>
                      <td className="py-2.5 pr-4 max-w-[260px] truncate text-slate-500" title={r.productDescription ?? ""}>
                        {r.productDescription ?? "Not Available"}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-500 tabular-nums">
                        {r.quantity ? `${Number(r.quantity).toLocaleString("tr-TR")} ${r.unit && r.unit !== "Not Available" ? r.unit : ""}`.trim() : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-500 tabular-nums">
                        {r.weightMt ? Number(r.weightMt).toLocaleString("tr-TR") : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-medium text-slate-900 tabular-nums">
                        {formatUsd(Number(r.valueUsd))}
                      </td>
                      <td className="py-2.5 text-slate-400 text-xs max-w-[160px] truncate" title={r.sourceFile ?? ""}>
                        {r.sourceFile ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              totalRows={result.totalRows}
              totalPages={result.totalPages}
              hrefFor={(p) => linkFor({ page: p > 1 ? String(p) : undefined })}
            />
          </div>

          <p className="text-xs text-slate-400 mt-3">
            Her kaydın kaynak dosyası saklanır — bir rakamın hangi dosyadan geldiği buradan izlenebilir.
          </p>
        </>
      )}
    </div>
  );
}

function SortLink({
  current,
  value,
  href,
  children,
}: {
  current: string;
  value: string;
  href: string;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <Link
      href={href}
      className={`px-2 py-1 rounded border ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "border-slate-300 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}
