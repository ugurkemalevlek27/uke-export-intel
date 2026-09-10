import { getSession } from "@/lib/auth";
import { getCompaniesList } from "@/lib/queries";
import { getActiveProjectId } from "@/lib/projectContext";
import { PageHeader, ScoreBadge, EmptyState } from "@/components/ui";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  yeni: "Yeni",
  arastiriliyor: "Araştırılıyor",
  karar_verici_bulundu: "Karar Verici Bulundu",
  ilk_temas: "İlk Temas",
  follow_up: "Follow-up",
  ilgilendi: "İlgilendi",
  katalog_gonderildi: "Katalog Gönderildi",
  numune_talebi: "Numune Talebi",
  fiyat_talebi: "Fiyat Talebi",
  teklif_gonderildi: "Teklif Gönderildi",
  pazarlik: "Pazarlık",
  siparis_bekleniyor: "Sipariş Bekleniyor",
  siparis_alindi: "Sipariş Alındı",
  uretim: "Üretim",
  sevkiyat: "Sevkiyat",
  tahsilat: "Tahsilat",
  tekrar_siparis: "Tekrar Sipariş",
  kaybedildi: "Kaybedildi",
  beklemede: "Beklemede",
  uygun_degil: "Uygun Değil",
};

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; minScore?: string; page?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  // Aktif proje (client workspace) context'i - sol menudeki secici belirler.
  const projectId = await getActiveProjectId(session!.organizationId);
  const page = params.page && /^\d+$/.test(params.page) ? Number(params.page) : 1;

  const result = await getCompaniesList(
    session!.organizationId,
    {
      projectId,
      search: params.search,
      minScore: params.minScore ? Number(params.minScore) : undefined,
    },
    { page, pageSize: 50 }
  );
  const companiesList = result.rows;

  const pageLink = (p: number) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.minScore) q.set("minScore", params.minScore);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/companies?${s}` : "/companies";
  };

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Firmalar"
        description={`${result.totalRows.toLocaleString("tr-TR")} firma · sayfa ${result.page}/${result.totalPages}`}
      />

      <form className="flex gap-3 mb-5">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="Firma ara..."
          className="flex-1 max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
        />
        <select
          name="minScore"
          defaultValue={params.minScore}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Tüm Skorlar</option>
          <option value="70">70+ (Yüksek Potansiyel)</option>
          <option value="45">45+ (Orta ve üzeri)</option>
        </select>
        <button className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800">
          Filtrele
        </button>
      </form>

      {companiesList.length === 0 ? (
        <EmptyState text="Bu filtrelere uygun firma bulunamadı." />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium">Firma</th>
                <th className="px-4 py-3 font-medium">Ülke</th>
                <th className="px-4 py-3 font-medium">Fırsat Skoru</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Satış Temsilcisi</th>
              </tr>
            </thead>
            <tbody>
              {companiesList.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/companies/${c.id}`} className="font-medium text-slate-800 hover:underline">
                      {c.name}
                    </Link>
                    {c.possibleDuplicateOfId && (
                      <span className="ml-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                        Olası Duplicate
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.country ?? "Unknown"}</td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={c.leadScore} label={c.leadScoreLabel} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.leadStatus ? STATUS_LABELS[c.leadStatus] ?? c.leadStatus : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{c.salesOwner ?? "Not Available"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-slate-500">
            {(result.page - 1) * result.pageSize + 1}–
            {Math.min(result.page * result.pageSize, result.totalRows)} / {result.totalRows}
          </span>
          <div className="flex gap-2">
            {result.page > 1 && (
              <Link
                href={pageLink(result.page - 1)}
                className="border border-slate-300 rounded-md px-3 py-1.5 hover:bg-white"
              >
                ← Önceki
              </Link>
            )}
            {result.page < result.totalPages && (
              <Link
                href={pageLink(result.page + 1)}
                className="border border-slate-300 rounded-md px-3 py-1.5 hover:bg-white"
              >
                Sonraki →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
