import { getSession } from "@/lib/auth";
import { getCompanyDetail } from "@/lib/queries";
import { ScoreBadge, formatUsd, EmptyState } from "@/components/ui";
import { notFound } from "next/navigation";
import { updateCrmFields } from "./actions";

const STATUS_OPTIONS = [
  "yeni", "arastiriliyor", "karar_verici_bulundu", "ilk_temas", "follow_up", "ilgilendi",
  "katalog_gonderildi", "numune_talebi", "fiyat_talebi", "teklif_gonderildi", "pazarlik",
  "siparis_bekleniyor", "siparis_alindi", "uretim", "sevkiyat", "tahsilat", "tekrar_siparis",
  "kaybedildi", "beklemede", "uygun_degil",
];

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const detail = await getCompanyDetail(session!.organizationId, Number(id));
  if (!detail) notFound();

  const { company, companyProject, records, byYear, bySupplier, byProduct } = detail;
  const breakdown = companyProject?.leadScoreBreakdown
    ? JSON.parse(companyProject.leadScoreBreakdown)
    : null;

  const boundUpdate = companyProject ? updateCrmFields.bind(null, companyProject.id) : null;

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{company.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {company.country ?? "Unknown"} · {company.companyType ?? "Not Available"}
          </p>
          {company.rawNameVariants && company.rawNameVariants.length > 1 && (
            <p className="text-xs text-slate-400 mt-1">
              Bilinen diğer yazımlar: {company.rawNameVariants.join(", ")}
            </p>
          )}
        </div>
        <ScoreBadge score={companyProject?.leadScore ?? null} label={companyProject?.leadScoreLabel ?? null} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Fırsat Skoru Açıklaması */}
          {breakdown && (
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">
                Fırsat Skoru Neden {companyProject!.leadScore}/100?
              </h2>
              <div className="space-y-2 text-sm">
                <ScoreBar label="Hacim" value={breakdown.volumeScore} max={40} />
                <ScoreBar label="Sipariş Sıklığı" value={breakdown.frequencyScore} max={25} />
                <ScoreBar label="Tedarikçi Çeşitliliği" value={breakdown.supplierDiversityScore} max={15} />
                <ScoreBar label="Güncellik" value={breakdown.recencyScore} max={20} />
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Bu skor bir karar destek göstergesidir, kesin bir gerçek değildir.
              </p>
            </div>
          )}

          {/* Yıllara Göre İthalat */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Yıllara Göre İthalat</h2>
            {byYear.length === 0 ? (
              <EmptyState text="Veri yok" />
            ) : (
              <div className="flex gap-4 items-end h-28">
                {byYear.map((y) => {
                  const max = Math.max(...byYear.map((x) => Number(x.totalValueUsd)));
                  const h = Math.max(6, (Number(y.totalValueUsd) / max) * 100);
                  return (
                    <div key={y.year} className="flex flex-col items-center gap-1">
                      <div className="text-xs text-slate-500">{formatUsd(Number(y.totalValueUsd))}</div>
                      <div className="w-10 bg-slate-800 rounded-t" style={{ height: `${h}px` }} />
                      <div className="text-xs text-slate-400">{y.year}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ürünler */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Satın Aldığı Ürünler</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">GTİP</th>
                  <th className="pb-2 font-medium">Ürün</th>
                  <th className="pb-2 font-medium text-right">Değer</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((p, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-500 font-mono text-xs">{p.hsCode}</td>
                    <td className="py-2 text-slate-700">{p.product}</td>
                    <td className="py-2 text-slate-600 text-right">{formatUsd(Number(p.totalValueUsd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tedarikçiler */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Tedarikçileri (Türkiye)</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">Tedarikçi</th>
                  <th className="pb-2 font-medium text-right">Sevkiyat</th>
                  <th className="pb-2 font-medium text-right">Değer</th>
                </tr>
              </thead>
              <tbody>
                {bySupplier.map((s, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-700">{s.supplier}</td>
                    <td className="py-2 text-slate-500 text-right">{s.shipmentCount}</td>
                    <td className="py-2 text-slate-600 text-right">{formatUsd(Number(s.totalValueUsd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Son Sevkiyatlar */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Sevkiyat Geçmişi (son 15)</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">Tarih</th>
                  <th className="pb-2 font-medium">Ürün</th>
                  <th className="pb-2 font-medium text-right">Değer</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 15).map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 text-slate-500">
                      {r.transactionDate ? new Date(r.transactionDate).toLocaleDateString("tr-TR") : "Not Available"}
                    </td>
                    <td className="py-1.5 text-slate-700">{r.productDescription}</td>
                    <td className="py-1.5 text-slate-600 text-right">{formatUsd(Number(r.valueUsd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CRM Paneli */}
        <div>
          <div className="bg-white rounded-lg border border-slate-200 p-5 sticky top-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Satış / CRM Bilgileri</h2>
            {boundUpdate ? (
              <form action={boundUpdate} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Lead Durumu</label>
                  <select
                    name="leadStatus"
                    defaultValue={companyProject?.leadStatus ?? "yeni"}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Satış Temsilcisi</label>
                  <input
                    name="salesOwner"
                    defaultValue={companyProject?.salesOwner ?? ""}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Sonraki Takip Tarihi</label>
                  <input
                    type="date"
                    name="nextFollowupDate"
                    defaultValue={companyProject?.nextFollowupDate ?? ""}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notlar</label>
                  <textarea
                    name="notes"
                    defaultValue={companyProject?.notes ?? ""}
                    rows={4}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-800">
                  Kaydet
                </button>
              </form>
            ) : (
              <p className="text-sm text-slate-400">Bu firma henüz bir projeye bağlı değil.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-500">
          {value} / {max}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-slate-700 rounded-full" style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}
