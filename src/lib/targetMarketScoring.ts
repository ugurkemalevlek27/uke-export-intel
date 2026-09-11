// Hedef Pazar Skoru (Phase 3)
//
// TASARIM ILKELERI (scoring.ts ile ayni):
//  1) DETERMINISTIK: ayni veri her zaman ayni skoru verir. Tahmin/AI yok.
//  2) ACIKLANABILIR: her faktorun kac puan verdigi ayri ayri saklanir ve
//     kullaniciya gosterilir. Skor asla "kara kutu" degildir.
//  3) YAPILANDIRILABILIR: agirliklar asagidaki WEIGHTS nesnesinden degistirilir;
//     formulun kendisi tek yerdedir, ekranlara kopyalanmaz.
//
// ONEMLI SINIR: Skor YALNIZCA sisteme yuklenen ticaret verisinden hesaplanir.
// Nufus, GSYH, gumruk vergisi gibi dis gostergeler sisteme bagli olmadigi icin
// skora DAHIL EDILMEZ - uydurulmuş bir deger kullanilmaz.

export interface TargetMarketWeights {
  marketSize: number;
  growth: number;
  importerBase: number;
  shipmentActivity: number;
  supplierDiversity: number;
  sourcePresence: number;
  recency: number;
}

/** Varsayilan agirliklar (toplam 100). Degistirmek icin burasi duzenlenir. */
export const WEIGHTS: TargetMarketWeights = {
  marketSize: 25,       // pazarin buyuklugu
  growth: 20,           // son donem buyume
  importerBase: 15,     // kac farkli alici firma var
  shipmentActivity: 15, // islem sikligi
  supplierDiversity: 10,// kac farkli tedarikci - rekabet/giris kolayligi
  sourcePresence: 10,   // kaynak ulkenin (varsayilan Turkiye) mevcut payi
  recency: 5,           // veri ne kadar guncel
};

/** Kaynak ulke: "bizim ulkemizin bu pazardaki mevcut varligi" olcusu. */
export const SOURCE_COUNTRY_PATTERN = /turk|türk/i;

export interface TargetMarketInput {
  country: string;
  totalValueUsd: number;
  transactionCount: number;
  importerCount: number;
  supplierCount: number;
  avgShipmentValueUsd: number;
  /** Kaynak ulkeden gelen ithalatin bu pazardaki payi (0-100) */
  sourceSharePct: number;
  /** Son donem / onceki donem buyume orani (-1 ile +sonsuz; 0.25 = %25 buyume) */
  growthRatio: number | null;
  daysSinceLastTransaction: number | null;
  // --- veri setindeki karsilastirma degerleri (normalizasyon icin) ---
  maxValueUsdInDataset: number;
  maxImporterCountInDataset: number;
  maxTransactionCountInDataset: number;
  maxSupplierCountInDataset: number;
  maxDaysSinceInDataset: number;
}

export interface TargetMarketFactor {
  key: keyof TargetMarketWeights;
  label: string;
  score: number;
  max: number;
  /** Puanin nereden geldigini anlatan kisa aciklama */
  detail: string;
}

export interface TargetMarketScore {
  total: number;
  label: "Yüksek Fırsat" | "Orta Fırsat" | "Düşük Fırsat";
  factors: TargetMarketFactor[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function fmtUsdShort(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

/**
 * Hedef pazar skoru (0-100).
 *
 * Her faktor kendi tavani icinde normalize edilir; toplam agirlik 100'dur.
 * Hesaplanamayan faktorler (orn. tek donem veri varsa buyume) 0 puan alir ve
 * bu durum aciklamada acikca belirtilir - eksik veri "iyi" gibi gosterilmez.
 */
export function calculateTargetMarketScore(
  input: TargetMarketInput,
  weights: TargetMarketWeights = WEIGHTS
): TargetMarketScore {
  const factors: TargetMarketFactor[] = [];

  // 1) Pazar buyuklugu - log olcek (birkac dev pazarin skoru domine etmesini engeller)
  const logV = Math.log1p(Math.max(0, input.totalValueUsd));
  const logMax = Math.log1p(Math.max(1, input.maxValueUsdInDataset));
  const marketSize = logMax > 0 ? clamp((logV / logMax) * weights.marketSize, 0, weights.marketSize) : 0;
  factors.push({
    key: "marketSize",
    label: "Pazar Büyüklüğü",
    score: round1(marketSize),
    max: weights.marketSize,
    detail: `${fmtUsdShort(input.totalValueUsd)} toplam ithalat (logaritmik ölçekte normalize edildi)`,
  });

  // 2) Buyume - son donem vs onceki donem
  let growth = 0;
  let growthDetail = "Karşılaştırma için yeterli dönem verisi yok — 0 puan";
  if (input.growthRatio !== null) {
    // -%50 ve altı = 0 puan, +%50 ve üstü = tam puan
    const norm = clamp((input.growthRatio + 0.5) / 1.0, 0, 1);
    growth = norm * weights.growth;
    const pct = (input.growthRatio * 100).toFixed(0);
    growthDetail = `Son dönem önceki döneme göre %${pct} değişim`;
  }
  factors.push({
    key: "growth",
    label: "Büyüme",
    score: round1(growth),
    max: weights.growth,
    detail: growthDetail,
  });

  // 3) Alici firma tabani
  const importerBase =
    input.maxImporterCountInDataset > 0
      ? clamp((input.importerCount / input.maxImporterCountInDataset) * weights.importerBase, 0, weights.importerBase)
      : 0;
  factors.push({
    key: "importerBase",
    label: "Alıcı Firma Tabanı",
    score: round1(importerBase),
    max: weights.importerBase,
    detail: `${input.importerCount} farklı ithalatçı firma`,
  });

  // 4) Islem sikligi
  const activity =
    input.maxTransactionCountInDataset > 0
      ? clamp(
          (input.transactionCount / input.maxTransactionCountInDataset) * weights.shipmentActivity,
          0,
          weights.shipmentActivity
        )
      : 0;
  factors.push({
    key: "shipmentActivity",
    label: "İşlem Aktivitesi",
    score: round1(activity),
    max: weights.shipmentActivity,
    detail: `${input.transactionCount} işlem · ortalama ${fmtUsdShort(input.avgShipmentValueUsd)}`,
  });

  // 5) Tedarikci cesitliligi - cok tedarikci = pazar disa acik, girmesi kolay
  const diversity =
    input.maxSupplierCountInDataset > 0
      ? clamp(
          (input.supplierCount / input.maxSupplierCountInDataset) * weights.supplierDiversity,
          0,
          weights.supplierDiversity
        )
      : 0;
  factors.push({
    key: "supplierDiversity",
    label: "Tedarikçi Çeşitliliği",
    score: round1(diversity),
    max: weights.supplierDiversity,
    detail: `${input.supplierCount} farklı tedarikçi — pazar dışa açık`,
  });

  // 6) Kaynak ulke varligi.
  //    DIKKAT: Bu faktor TERS calisir. Kaynak ulkenin payi DUSUKSE puan YUKSEKTIR:
  //    "henuz doldurulmamis alan" firsattir. Pay zaten yuksekse buyume alani dardir.
  const sourcePresence = clamp(
    ((100 - clamp(input.sourceSharePct, 0, 100)) / 100) * weights.sourcePresence,
    0,
    weights.sourcePresence
  );
  factors.push({
    key: "sourcePresence",
    label: "Türkiye Payı (boşluk fırsatı)",
    score: round1(sourcePresence),
    max: weights.sourcePresence,
    detail:
      input.sourceSharePct > 0
        ? `Türkiye'nin mevcut payı %${input.sourceSharePct.toFixed(1)} — pay düştükçe puan artar (doldurulacak alan)`
        : "Türkiye'nin bu pazarda görünür payı yok — en yüksek boşluk fırsatı",
  });

  // 7) Guncellik
  let recency = 0;
  let recencyDetail = "Tarihli kayıt yok — 0 puan";
  if (input.daysSinceLastTransaction !== null) {
    const maxGap = Math.max(1, input.maxDaysSinceInDataset);
    recency = clamp((1 - input.daysSinceLastTransaction / maxGap) * weights.recency, 0, weights.recency);
    recencyDetail = `Son işlemden bu yana ${input.daysSinceLastTransaction} gün`;
  }
  factors.push({
    key: "recency",
    label: "Güncellik",
    score: round1(recency),
    max: weights.recency,
    detail: recencyDetail,
  });

  const total = Math.round(factors.reduce((a, f) => a + f.score, 0));

  let label: TargetMarketScore["label"] = "Düşük Fırsat";
  if (total >= 70) label = "Yüksek Fırsat";
  else if (total >= 45) label = "Orta Fırsat";

  return { total, label, factors };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
