import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateOpportunityScore } from "../src/lib/scoring";

const base = {
  totalValueUsd: 100_000,
  transactionCount: 10,
  distinctSuppliers: 3,
  daysSinceLastTransaction: 30,
  maxValueUsdInDataset: 1_000_000,
  maxDaysSinceLastTransactionInDataset: 365,
};

test("skor her zaman 0-100 araliginda", () => {
  const cases = [
    base,
    { ...base, totalValueUsd: 0, transactionCount: 0, distinctSuppliers: 0, daysSinceLastTransaction: 365 },
    { ...base, totalValueUsd: 1_000_000, transactionCount: 999, distinctSuppliers: 99, daysSinceLastTransaction: 0 },
  ];
  for (const c of cases) {
    const s = calculateOpportunityScore(c);
    assert.ok(s.total >= 0 && s.total <= 100, `skor aralik disi: ${s.total}`);
  }
});

test("faktor puanlari kendi tavanlarini asmaz (aciklanabilirlik)", () => {
  const s = calculateOpportunityScore({
    ...base,
    totalValueUsd: 10_000_000,
    transactionCount: 10_000,
    distinctSuppliers: 500,
    daysSinceLastTransaction: 0,
  });
  assert.ok(s.volumeScore <= 40);
  assert.ok(s.frequencyScore <= 25);
  assert.ok(s.supplierDiversityScore <= 15);
  assert.ok(s.recencyScore <= 20);
});

test("breakdown toplami total ile tutarli (yuvarlama toleransi 1)", () => {
  const s = calculateOpportunityScore(base);
  const sum = s.volumeScore + s.frequencyScore + s.supplierDiversityScore + s.recencyScore;
  assert.ok(Math.abs(sum - s.total) <= 1, `breakdown ${sum} vs total ${s.total}`);
});

test("deterministik: ayni girdi ayni skoru verir", () => {
  assert.deepEqual(calculateOpportunityScore(base), calculateOpportunityScore(base));
});

test("daha yuksek hacim daha yuksek (veya esit) skor verir", () => {
  const dusuk = calculateOpportunityScore({ ...base, totalValueUsd: 10_000 });
  const yuksek = calculateOpportunityScore({ ...base, totalValueUsd: 900_000 });
  assert.ok(yuksek.total >= dusuk.total);
});

test("etiket esikleri: >=70 Yuksek, >=45 Orta", () => {
  const s = calculateOpportunityScore(base);
  if (s.total >= 70) assert.equal(s.label, "Yuksek Potansiyel");
  else if (s.total >= 45) assert.equal(s.label, "Orta Potansiyel");
  else assert.equal(s.label, "Dusuk Potansiyel");
});
