// Firsat / Lead Score - MERKEZI hesaplama mantigi (CLAUDE.md madde 9, 65)
//
// ONEMLI: Bu formul hem seed/import script'i hem de dashboard/company sayfalari
// tarafindan BURADAN cagrilir. Frontend'de ayri bir kopyasi olusturulmamalidir
// (madde 65: "Frontend ve backend'de farkli formuller kullanma").
//
// Skor 0-100 arasidir ve DAIMA aciklanabilir olmalidir (madde 9): her firmanin
// hangi faktorden kac puan aldigi ayri ayri saklanir (bkz. leadScoreBreakdown).

export interface ScoringInput {
  totalValueUsd: number;
  transactionCount: number;
  distinctSuppliers: number;
  daysSinceLastTransaction: number;
  /** Karsilastirma icin veri setindeki en yuksek deger (log-normalizasyon icin) */
  maxValueUsdInDataset: number;
  /** Veri setindeki en eski "son islemden bu yana gun" degeri (normalizasyon icin) */
  maxDaysSinceLastTransactionInDataset: number;
}

export interface ScoreBreakdown {
  volumeScore: number; // /40
  frequencyScore: number; // /25
  supplierDiversityScore: number; // /15
  recencyScore: number; // /20
  total: number; // /100
  label: "Yuksek Potansiyel" | "Orta Potansiyel" | "Dusuk Potansiyel";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Aciklanabilir, dort faktorlu firsat skoru.
 *
 * 1) Hacim (0-40): log-olcekte normalize edilmis toplam ithalat degeri.
 *    Log-olcek kullanilmasinin nedeni: birkac cok buyuk firmanin skoru
 *    domine etmesini engellemek.
 * 2) Siklik (0-25): islem sayisi, 25 islem ve uzerinde tavan puani alir.
 * 3) Tedarikci Cesitliligi (0-15): kac farkli (Turk) tedarikciden alim
 *    yaptigi, 5 ve uzerinde tavan puani alir.
 * 4) Guncellik (0-20): son islemin veri setindeki en guncel tarihe yakinligi.
 */
export function calculateOpportunityScore(input: ScoringInput): ScoreBreakdown {
  const logValue = Math.log1p(Math.max(0, input.totalValueUsd));
  const logMax = Math.log1p(Math.max(1, input.maxValueUsdInDataset));
  const volumeScore = logMax > 0 ? clamp((logValue / logMax) * 40, 0, 40) : 0;

  const frequencyScore = clamp((Math.min(input.transactionCount, 25) / 25) * 25, 0, 25);

  const supplierDiversityScore = clamp(
    (Math.min(input.distinctSuppliers, 5) / 5) * 15,
    0,
    15
  );

  const maxGap = Math.max(1, input.maxDaysSinceLastTransactionInDataset);
  const recencyScore = clamp(
    (1 - input.daysSinceLastTransaction / maxGap) * 20,
    0,
    20
  );

  const total = Math.round(volumeScore + frequencyScore + supplierDiversityScore + recencyScore);

  let label: ScoreBreakdown["label"] = "Dusuk Potansiyel";
  if (total >= 70) label = "Yuksek Potansiyel";
  else if (total >= 45) label = "Orta Potansiyel";

  return {
    volumeScore: Math.round(volumeScore * 10) / 10,
    frequencyScore: Math.round(frequencyScore * 10) / 10,
    supplierDiversityScore: Math.round(supplierDiversityScore * 10) / 10,
    recencyScore: Math.round(recencyScore * 10) / 10,
    total,
    label,
  };
}
