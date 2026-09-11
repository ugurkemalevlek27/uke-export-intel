// Ulke ve Firma PDF raporlari.
//
// Raporlar EKRANDAKI VERININ AYNISINI kullanir: ayni analytics fonksiyonlari,
// ayni filtreler, ayni organizationId scope'u. Yani raporda gorunen rakam,
// ekranda gorunen rakamla birebir aynidir - ayri bir hesaplama yolu yoktur.

import {
  getCountryDetail,
  getCompanyIntelligence,
  type TradeKpis,
} from "./analytics";
import type { TradeFilters } from "./filters";
import { LEAD_STATUS_LABELS } from "./leadStatus";
import {
  createDoc, header, sectionTitle, kpiGrid, table, barList, trendChart, note,
  finalize, toBuffer, fmtUsd, fmtNum, fmtPct, type ReportMeta,
} from "./pdfReport";

const NA = "Not Available";

/** Uygulanan filtreleri rapor basligindaki kapsam kutusu icin metne cevirir. */
export function describeFilters(f: TradeFilters): string[] {
  const parts: string[] = [];
  if (f.dateFrom || f.dateTo) {
    parts.push(`Tarih aralığı: ${f.dateFrom ?? "başlangıç"} — ${f.dateTo ?? "bugün"}`);
  }
  if (f.importerCountry) parts.push(`İthalatçı ülke: ${f.importerCountry}`);
  if (f.exporterCountry) parts.push(`İhracatçı ülke: ${f.exporterCountry}`);
  const hs = f.hsCode ?? f.hs6 ?? f.hs4 ?? f.hs2;
  if (hs) parts.push(`GTİP: ${hs}`);
  if (f.importer) parts.push(`İthalatçı araması: "${f.importer}"`);
  if (f.exporter) parts.push(`Tedarikçi araması: "${f.exporter}"`);
  if (f.productDescription) parts.push(`Ürün araması: "${f.productDescription}"`);
  return parts.length > 0 ? parts : ["Filtre uygulanmadı — tüm kayıtlar"];
}

function kpiItems(k: TradeKpis) {
  return [
    { label: "Toplam Ticaret Değeri", value: fmtUsd(k.totalValueUsd) },
    { label: "İşlem Sayısı", value: fmtNum(k.transactionCount) },
    { label: "Sevkiyat", value: fmtNum(k.totalShipments) },
    { label: "İthalatçı Firma", value: fmtNum(k.importerCount) },
    { label: "Tedarikçi", value: fmtNum(k.exporterCount) },
    { label: "Ortalama İşlem", value: fmtUsd(k.avgShipmentValueUsd) },
  ];
}

// ---------------------------------------------------------------------------
// ULKE RAPORU
// ---------------------------------------------------------------------------

export async function buildCountryReport(
  organizationId: number,
  country: string,
  filters: TradeFilters,
  projectLabel: string
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const scoped: TradeFilters = { ...filters, importerCountry: undefined };
  const detail = await getCountryDetail(organizationId, country, scoped);
  if (detail.kpis.transactionCount === 0) return null;

  const { kpis, marketSharePct, topImporters, topExporters, hsBreakdown, trend, supplierCountries } = detail;

  const meta: ReportMeta = {
    kind: "Ülke Raporu",
    subject: country,
    projectLabel,
    filterLines: describeFilters(scoped),
  };

  const doc = createDoc();
  header(doc, meta);

  sectionTitle(doc, "Genel Görünüm");
  kpiGrid(doc, [
    ...kpiItems(kpis).slice(0, 3),
    { label: "Pazar Payı", value: fmtPct(marketSharePct), sub: "filtrelenmiş toplam içinde" },
    { label: "GTİP Sayısı", value: fmtNum(kpis.hsCodeCount) },
    { label: "Ortalama İşlem", value: fmtUsd(kpis.avgShipmentValueUsd) },
  ]);
  note(
    doc,
    `Veri aralığı: ${kpis.firstTransactionDate ?? NA} — ${kpis.lastTransactionDate ?? NA}. ` +
      `İthalatçı firma: ${fmtNum(kpis.importerCount)}, tedarikçi: ${fmtNum(kpis.exporterCount)}.`
  );

  sectionTitle(doc, "Aylık Ticaret Trendi");
  trendChart(doc, trend);

  sectionTitle(doc, "En Büyük İthalatçı Firmalar", "Fırsat Skoru ile birlikte");
  table(
    doc,
    [
      { header: "Firma", width: 3.2, max: 46 },
      { header: "Ülke", width: 1.3, max: 18 },
      { header: "Ticaret Değeri", width: 1.2, align: "right" },
      { header: "İşlem", width: 0.8, align: "right" },
      { header: "Skor", width: 0.9, align: "right" },
    ],
    topImporters.map((c) => [
      c.name ?? NA,
      c.country ?? NA,
      fmtUsd(c.totalValueUsd),
      fmtNum(c.transactionCount),
      c.leadScore != null ? `${c.leadScore}/100` : "—",
    ])
  );

  sectionTitle(doc, "En Büyük Tedarikçiler");
  table(
    doc,
    [
      { header: "Tedarikçi", width: 3.4, max: 50 },
      { header: "Menşei", width: 1.2, max: 16 },
      { header: "Satış", width: 1.2, align: "right" },
      { header: "Müşteri", width: 0.9, align: "right" },
    ],
    topExporters.map((e) => [
      e.name ?? NA,
      e.country ?? NA,
      fmtUsd(e.totalValueUsd),
      fmtNum(e.customerCount),
    ])
  );

  sectionTitle(doc, "GTİP Dağılımı");
  barList(
    doc,
    hsBreakdown.slice(0, 12).map((h) => ({
      label: h.code ?? NA,
      value: h.totalValueUsd,
      sub: `${fmtNum(h.importerCount)} firma`,
    }))
  );

  sectionTitle(doc, "Tedarikçi Ülke Dağılımı");
  barList(
    doc,
    supplierCountries.slice(0, 10).map((s) => ({
      label: s.country ?? NA,
      value: s.totalValueUsd,
    }))
  );

  note(
    doc,
    "Ekonomik ve demografik ülke göstergeleri (nüfus, GSYH, toplam ithalat hacmi vb.) " +
      "henüz sisteme bağlı değildir ve bu raporda yer almamaktadır."
  );

  finalize(doc, `UKE Global Export Intelligence · ${country} · ${meta.projectLabel}`);
  const buffer = await toBuffer(doc);
  return { buffer, fileName: `ulke-raporu-${slug(country)}` };
}

// ---------------------------------------------------------------------------
// FIRMA RAPORU
// ---------------------------------------------------------------------------

export async function buildCompanyReport(
  organizationId: number,
  companyId: number,
  filters: TradeFilters,
  projectLabel: string
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const ci = await getCompanyIntelligence(organizationId, companyId, filters);
  if (!ci) return null;

  const { company, crm, kpis, suppliers, supplierConcentrationPct, supplierHhi, products, yearlyTrend, monthlyTrend, recentTransactions } = ci;

  const meta: ReportMeta = {
    kind: "Firma İstihbarat Raporu",
    subject: company.name,
    projectLabel,
    filterLines: describeFilters(filters),
  };

  const doc = createDoc();
  header(doc, meta);

  sectionTitle(doc, "Firma Bilgileri");
  table(
    doc,
    [
      { header: "Alan", width: 1.2, max: 28 },
      { header: "Değer", width: 3.8, max: 78 },
    ],
    [
      ["Ülke", company.country ?? NA],
      ["Şehir", company.city ?? NA],
      ["Firma Tipi", company.companyType ?? NA],
      ["Sektör", company.sector ?? NA],
      ["Web Sitesi", company.website ?? NA],
      ["Bilinen Diğer Yazımlar", (company.rawNameVariants ?? []).join(" | ") || NA],
    ]
  );

  sectionTitle(doc, "Satın Alma Görünümü");
  kpiGrid(doc, [
    { label: "Toplam İthalat", value: fmtUsd(kpis.totalValueUsd) },
    { label: "İşlem Sayısı", value: fmtNum(kpis.transactionCount) },
    { label: "Ortalama İşlem", value: fmtUsd(kpis.avgShipmentValueUsd) },
    { label: "Tedarikçi Sayısı", value: fmtNum(kpis.exporterCount) },
    { label: "Ürün (GTİP)", value: fmtNum(kpis.hsCodeCount) },
    { label: "Sevkiyat", value: fmtNum(kpis.totalShipments) },
  ]);
  note(
    doc,
    `İlk işlem: ${kpis.firstTransactionDate ?? NA} · Son işlem: ${kpis.lastTransactionDate ?? NA}`
  );

  // --- Aciklanabilir firsat skoru ---
  if (crm) {
    sectionTitle(doc, "Fırsat Skoru", "Skor deterministiktir; her faktörün katkısı aşağıda ayrı ayrı gösterilir.");
    const b = parseBreakdown(crm.leadScoreBreakdown);
    const scoreRows: (string | number)[][] = b
      ? [
          ["Hacim (log ölçekli ithalat değeri)", `${b.volumeScore} / 40`],
          ["Sıklık (işlem sayısı)", `${b.frequencyScore} / 25`],
          ["Tedarikçi çeşitliliği", `${b.supplierDiversityScore} / 15`],
          ["Güncellik (son işleme yakınlık)", `${b.recencyScore} / 20`],
          ["TOPLAM", `${b.total} / 100`],
        ]
      : [["Skor detayı", "Henüz hesaplanmadı"]];

    table(
      doc,
      [
        { header: "Faktör", width: 3.6, max: 56 },
        { header: "Puan", width: 1.4, align: "right" },
      ],
      scoreRows
    );
    note(
      doc,
      `Değerlendirme: ${crm.leadScoreLabel ?? NA}. ` +
        `Eşikler: 70+ Yüksek Potansiyel, 45–69 Orta Potansiyel, 45 altı Düşük Potansiyel.`
    );
  }

  // --- Tedarikci analizi + yogunlasma ---
  sectionTitle(doc, "Tedarikçi Analizi");
  kpiGrid(doc, [
    {
      label: "Tedarikçi Yoğunlaşması",
      value: fmtPct(supplierConcentrationPct),
      sub: "en büyük tedarikçinin payı",
    },
    {
      label: "HHI",
      value: fmtNum(supplierHhi),
      sub: concentrationVerdict(supplierHhi),
    },
    { label: "Tedarikçi Sayısı", value: fmtNum(suppliers.length) },
  ]);
  table(
    doc,
    [
      { header: "Tedarikçi", width: 3.0, max: 44 },
      { header: "Menşei", width: 1.0, max: 14 },
      { header: "Alım", width: 1.0, align: "right" },
      { header: "Pay", width: 0.7, align: "right" },
      { header: "İşlem", width: 0.6, align: "right" },
      { header: "Son Sevkiyat", width: 1.0, align: "right" },
    ],
    suppliers.slice(0, 20).map((s) => [
      s.supplier ?? NA,
      s.country ?? NA,
      fmtUsd(s.totalValueUsd),
      fmtPct(s.sharePct),
      fmtNum(s.transactionCount),
      s.lastShipment ?? "—",
    ])
  );
  note(
    doc,
    "HHI (Herfindahl-Hirschman): tedarikçi paylarının karelerinin toplamı. " +
      "2500 üzeri yüksek yoğunlaşma sayılır — firma tek bir tedarikçiye bağımlı demektir, " +
      "bu da yeni tedarikçi için hem risk hem fırsat göstergesidir."
  );

  sectionTitle(doc, "Satın Alınan Ürünler");
  table(
    doc,
    [
      { header: "GTİP", width: 1.2, max: 16 },
      { header: "Ürün Açıklaması", width: 3.4, max: 62 },
      { header: "Değer", width: 1.0, align: "right" },
    ],
    products.slice(0, 15).map((p) => [p.hsCode, p.description ?? NA, fmtUsd(p.totalValueUsd)])
  );

  if (yearlyTrend.length > 1) {
    sectionTitle(doc, "Yıllık Satın Alma Trendi");
    trendChart(doc, yearlyTrend);
  }
  sectionTitle(doc, "Aylık Satın Alma Trendi");
  trendChart(doc, monthlyTrend);

  // --- CRM durumu ---
  if (crm) {
    sectionTitle(doc, "CRM Durumu");
    table(
      doc,
      [
        { header: "Alan", width: 1.2, max: 28 },
        { header: "Değer", width: 3.8, max: 78 },
      ],
      [
        ["Lead Durumu", LEAD_STATUS_LABELS[crm.leadStatus] ?? crm.leadStatus],
        ["Satış Temsilcisi", crm.salesOwner ?? NA],
        ["Son Temas", crm.lastContactDate ?? NA],
        ["Sonraki Takip", crm.nextFollowupDate ?? NA],
        ["Notlar", crm.notes ?? NA],
      ]
    );
  }

  sectionTitle(doc, "Son İşlemler", "En güncel 25 kayıt");
  table(
    doc,
    [
      { header: "Tarih", width: 1.0, max: 12 },
      { header: "Tedarikçi", width: 2.6, max: 38 },
      { header: "GTİP", width: 1.2, max: 16 },
      { header: "Değer", width: 1.0, align: "right" },
    ],
    recentTransactions.map((t) => [
      t.transactionDate ?? "—",
      t.exporterName ?? NA,
      t.hsCode,
      fmtUsd(Number(t.valueUsd)),
    ])
  );

  note(
    doc,
    "Bu rapordaki tüm rakamlar sisteme yüklenen gümrük/ticaret kayıtlarından hesaplanmıştır. " +
      "Tahmini veya dış kaynaklı veri içermez."
  );

  finalize(doc, `UKE Global Export Intelligence · ${company.name} · ${meta.projectLabel}`);
  const buffer = await toBuffer(doc);
  return { buffer, fileName: `firma-raporu-${slug(company.name)}` };
}

// ---------------------------------------------------------------------------

interface Breakdown {
  volumeScore: number;
  frequencyScore: number;
  supplierDiversityScore: number;
  recencyScore: number;
  total: number;
}

function parseBreakdown(json: string | null): Breakdown | null {
  if (!json) return null;
  try {
    const b = JSON.parse(json) as Partial<Breakdown>;
    if (typeof b.total !== "number") return null;
    return {
      volumeScore: b.volumeScore ?? 0,
      frequencyScore: b.frequencyScore ?? 0,
      supplierDiversityScore: b.supplierDiversityScore ?? 0,
      recencyScore: b.recencyScore ?? 0,
      total: b.total,
    };
  } catch {
    return null;
  }
}

function concentrationVerdict(hhi: number): string {
  if (hhi >= 2500) return "yüksek yoğunlaşma";
  if (hhi >= 1500) return "orta yoğunlaşma";
  return "dağınık tedarik";
}

/** Dosya adi icin guvenli slug (Turkce karakterler sadelestirilir). */
function slug(text: string): string {
  return text
    .replace(/İ/g, "I").replace(/ı/g, "i").replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g").replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/Ö/g, "O").replace(/ö/g, "o").replace(/Ç/g, "C").replace(/ç/g, "c")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
