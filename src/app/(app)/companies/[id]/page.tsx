import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, filtersToQuery, type RawSearchParams } from "@/lib/filters";
import { getCompanyIntelligence } from "@/lib/analytics";
import { KpiCard, ScoreBadge, EmptyState, formatUsd } from "@/components/ui";
import { TrendBars, DistributionBars } from "@/components/charts";
import { ReportButton } from "@/components/ReportButton";
import { LEAD_STATUS_LABELS } from "@/lib/leadStatus";
import { notFound } from "next/navigation";
import Link from "next/link";
import { updateCrmFields } from "./actions";
import { getCompanyContacts, getCompanyActivities } from "@/lib/crm";
import { normalizeRole, can } from "@/lib/roles";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ContactsPanel } from "@/components/crm/ContactsPanel";
import { ActivitiesPanel } from "@/components/crm/ActivitiesPanel";

const STATUS_OPTIONS = Object.keys(LEAD_STATUS_LABELS);

/**
 * Company Intelligence (Phase 3)
 *
 * Firma sayfasi artik yalnizca kayit gosteren bir ekran degil; satin alma
 * davranisi, tedarikci yogunlasmasi ve aciklanabilir firsat skoru ile birlikte
 * bir istihbarat profili.
 */
export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const session = await getSession();
  const organizationId = session!.organizationId;

  const sp = await searchParams;
  const parsed = parseTradeFilters(sp);
  const activeProjectId = await getActiveProjectId(organizationId);
  const filters = { ...parsed, projectId: parsed.projectId ?? activeProjectId };

  const ci = await getCompanyIntelligence(organizationId, Number(id), filters);
  if (!ci) notFound();

  const {
    company, crm, kpis, suppliers, supplierConcentrationPct, supplierHhi,
    supplierCountries, products, yearlyTrend, monthlyTrend, recentTransactions,
  } = ci;

  // CRM verileri (Phase 4). Kisiler firma bazli, aktiviteler proje bazlidir.
  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session!.userId))
    .limit(1);
  const canEditCrm = can.editCrm(normalizeRole(dbUser?.role));

  const [contactList, activityList] = await Promise.all([
    getCompanyContacts(organizationId, Number(id)),
    crm ? getCompanyActivities(organizationId, crm.companyProjectId) : Promise.resolve([]),
  ]);

  const breakdown = crm?.leadScoreBreakdown ? safeParse(crm.leadScoreBreakdown) : null;
  const boundUpdate = crm ? updateCrmFields.bind(null, crm.companyProjectId) : null;
  const q = filtersToQuery(filters);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">{company.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {[company.country, company.city, company.companyType, company.sector]
              .filter(Boolean)
              .join(" · ") || "Not Available"}
          </p>
          {company.website && (
            <p className="text-xs text-slate-500 mt-1">{company.website}</p>
          )}
          {company.rawNameVariants && company.rawNameVariants.length > 1 && (
            <p className="text-xs text-slate-400 mt-1">
              Bilinen diğer yazımlar: {company.rawNameVariants.join(", ")}
            </p>
          )}
          {company.possibleDuplicateOfId && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2 inline-block">
              Olası duplicate — birleştirme kararı için Veri Kalitesi modülü bekleniyor
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ScoreBadge score={crm?.leadScore ?? null} label={crm?.leadScoreLabel ?? null} />
          <ReportButton type="company" param={String(company.id)} query={q} label="Firma Raporu (PDF)" />
        </div>
      </div>

      {kpis.transactionCount === 0 ? (
        <EmptyState text="Bu firma için seçili filtrelerde kayıt bulunamadı." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <KpiCard label="TOPLAM İTHALAT" value={formatUsd(kpis.totalValueUsd)} />
            <KpiCard label="İŞLEM" value={kpis.transactionCount.toLocaleString("tr-TR")} />
            <KpiCard label="ORT. İŞLEM" value={formatUsd(kpis.avgShipmentValueUsd)} />
            <KpiCard label="TEDARİKÇİ" value={String(kpis.exporterCount)} />
            <KpiCard label="ÜRÜN (GTİP)" value={String(kpis.hsCodeCount)} />
            <KpiCard label="SEVKİYAT" value={kpis.totalShipments.toLocaleString("tr-TR")} />
          </div>

          <p className="text-xs text-slate-400 mb-6">
            İlk işlem: {kpis.firstTransactionDate ?? "Not Available"} · Son işlem:{" "}
            {kpis.lastTransactionDate ?? "Not Available"}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {breakdown && (
                <Card title={`Fırsat Skoru neden ${crm!.leadScore}/100?`}>
                  <div className="space-y-2 text-sm">
                    <ScoreBar label="Hacim (log ölçekli ithalat değeri)" value={breakdown.volumeScore} max={40} />
                    <ScoreBar label="Sipariş sıklığı" value={breakdown.frequencyScore} max={25} />
                    <ScoreBar label="Tedarikçi çeşitliliği" value={breakdown.supplierDiversityScore} max={15} />
                    <ScoreBar label="Güncellik" value={breakdown.recencyScore} max={20} />
                  </div>
                  <p className="text-xs text-slate-400 mt-3">
                    Skor deterministiktir — aynı veriden her zaman aynı sonuç çıkar. Bir karar
                    destek göstergesidir, kesin gerçek değildir.
                  </p>
                </Card>
              )}

              <Card
                title="Tedarikçi Analizi"
                subtitle="Bu firma kimlerden, ne kadar satın alıyor?"
              >
                <div className="grid grid-cols-3 gap-4 mb-5">
                  <MiniStat
                    label="YOĞUNLAŞMA"
                    value={`%${supplierConcentrationPct.toFixed(1)}`}
                    sub="en büyük tedarikçinin payı"
                  />
                  <MiniStat label="HHI" value={supplierHhi.toLocaleString("tr-TR")} sub={hhiVerdict(supplierHhi)} />
                  <MiniStat label="TEDARİKÇİ" value={String(suppliers.length)} sub="farklı firma" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                        <th className="pb-2 font-medium">Tedarikçi</th>
                        <th className="pb-2 font-medium">Menşei</th>
                        <th className="pb-2 font-medium text-right">Alım</th>
                        <th className="pb-2 font-medium text-right">Pay</th>
                        <th className="pb-2 font-medium text-right">Son Sevkiyat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.slice(0, 15).map((s, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0">
                          <td className="py-2 text-slate-700 max-w-[240px] truncate" title={s.supplier ?? ""}>
                            {s.supplier ?? "Not Available"}
                          </td>
                          <td className="py-2 text-slate-500 text-xs">{s.country ?? "—"}</td>
                          <td className="py-2 text-slate-900 font-medium text-right tabular-nums">
                            {formatUsd(s.totalValueUsd)}
                          </td>
                          <td className="py-2 text-slate-600 text-right tabular-nums">
                            %{s.sharePct.toFixed(1)}
                          </td>
                          <td className="py-2 text-slate-400 text-right text-xs tabular-nums">
                            {s.lastShipment ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  HHI, tedarikçi paylarının karelerinin toplamıdır. 2500 üzeri yüksek yoğunlaşma
                  sayılır: firma tek tedarikçiye bağımlı demektir — yeni tedarikçi için hem risk
                  hem fırsat göstergesi.
                </p>
              </Card>

              <Card title="Satın Aldığı Ürünler">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                        <th className="pb-2 font-medium">GTİP</th>
                        <th className="pb-2 font-medium">Ürün</th>
                        <th className="pb-2 font-medium text-right">Değer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.slice(0, 15).map((p) => (
                        <tr key={p.hsCode} className="border-b border-slate-50 last:border-0">
                          <td className="py-2 font-mono text-xs">
                            <Link href={`/trade/products/${encodeURIComponent(p.hsCode)}${q}`} className="text-slate-700 hover:underline">
                              {p.hsCode}
                            </Link>
                          </td>
                          <td className="py-2 text-slate-600 max-w-[320px] truncate" title={p.description ?? ""}>
                            {p.description ?? "Not Available"}
                          </td>
                          <td className="py-2 text-slate-900 text-right font-medium tabular-nums">
                            {formatUsd(p.totalValueUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {yearlyTrend.length > 1 && (
                <Card title="Yıllık Satın Alma Trendi">
                  <TrendBars points={yearlyTrend} />
                </Card>
              )}

              <Card title="Aylık Satın Alma Trendi">
                <TrendBars points={monthlyTrend} />
              </Card>

              <Card title="Tedarikçi Ülke Dağılımı">
                <DistributionBars
                  rows={supplierCountries.map((s) => ({
                    label: s.country ?? "Not Available",
                    value: s.totalValueUsd,
                  }))}
                />
              </Card>

              <Card title="Son İşlemler" subtitle="En güncel 25 kayıt">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-100">
                        <th className="pb-2 font-medium">Tarih</th>
                        <th className="pb-2 font-medium">Tedarikçi</th>
                        <th className="pb-2 font-medium">GTİP</th>
                        <th className="pb-2 font-medium text-right">Değer</th>
                        <th className="pb-2 font-medium">Kaynak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTransactions.map((r) => (
                        <tr key={r.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-1.5 text-slate-500 tabular-nums">{r.transactionDate ?? "—"}</td>
                          <td className="py-1.5 text-slate-700 max-w-[200px] truncate" title={r.exporterName ?? ""}>
                            {r.exporterName ?? "Not Available"}
                          </td>
                          <td className="py-1.5 text-slate-500 font-mono">{r.hsCode}</td>
                          <td className="py-1.5 text-slate-900 text-right font-medium tabular-nums">
                            {formatUsd(Number(r.valueUsd))}
                          </td>
                          <td className="py-1.5 text-slate-400 max-w-[130px] truncate" title={r.sourceFile ?? ""}>
                            {r.sourceFile ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <ContactsPanel
                companyId={Number(id)}
                contacts={contactList}
                canEdit={canEditCrm}
              />

              <ActivitiesPanel
                companyProjectId={crm?.companyProjectId ?? null}
                activities={activityList}
                contacts={contactList}
                canEdit={canEditCrm}
              />
            </div>

            {/* CRM paneli */}
            <div>
              <div className="bg-white rounded-lg border border-slate-200 p-5 sticky top-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">Satış / CRM</h2>
                {boundUpdate ? (
                  <form action={boundUpdate} className="space-y-3">
                    <Field label="Lead Durumu">
                      <select
                        name="leadStatus"
                        defaultValue={crm?.leadStatus ?? "yeni"}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {LEAD_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Satış Temsilcisi">
                      <input
                        name="salesOwner"
                        defaultValue={crm?.salesOwner ?? ""}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </Field>
                    <Field label="Sonraki Takip Tarihi">
                      <input
                        type="date"
                        name="nextFollowupDate"
                        defaultValue={crm?.nextFollowupDate ?? ""}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </Field>
                    <Field label="Notlar">
                      <textarea
                        name="notes"
                        defaultValue={crm?.notes ?? ""}
                        rows={4}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </Field>
                    <button className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-800">
                      Kaydet
                    </button>
                    {crm?.lastContactDate && (
                      <p className="text-xs text-slate-400">Son temas: {crm.lastContactDate}</p>
                    )}
                  </form>
                ) : (
                  <EmptyState text="Bu firma henüz bir projeye bağlı değil." />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-400 tracking-wide">{label}</div>
      <div className="text-lg font-semibold text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-500 tabular-nums">
          {value} / {max}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-slate-800 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function hhiVerdict(hhi: number): string {
  if (hhi >= 2500) return "yüksek yoğunlaşma";
  if (hhi >= 1500) return "orta yoğunlaşma";
  return "dağınık tedarik";
}

interface Breakdown {
  volumeScore: number;
  frequencyScore: number;
  supplierDiversityScore: number;
  recencyScore: number;
}

function safeParse(json: string): Breakdown | null {
  try {
    const b = JSON.parse(json) as Partial<Breakdown>;
    return {
      volumeScore: b.volumeScore ?? 0,
      frequencyScore: b.frequencyScore ?? 0,
      supplierDiversityScore: b.supplierDiversityScore ?? 0,
      recencyScore: b.recencyScore ?? 0,
    };
  } catch {
    return null;
  }
}
