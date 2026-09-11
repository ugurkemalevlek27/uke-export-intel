import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTargetMarketScore, WEIGHTS, type TargetMarketInput } from "../src/lib/targetMarketScoring";

const base: TargetMarketInput = {
  country: "Testland",
  totalValueUsd: 5_000_000,
  transactionCount: 800,
  importerCount: 60,
  supplierCount: 40,
  avgShipmentValueUsd: 6250,
  sourceSharePct: 30,
  growthRatio: 0.2,
  daysSinceLastTransaction: 20,
  maxValueUsdInDataset: 10_000_000,
  maxImporterCountInDataset: 120,
  maxTransactionCountInDataset: 1600,
  maxSupplierCountInDataset: 90,
  maxDaysSinceInDataset: 200,
};

test("skor 0-100 araliginda kalir (uc degerlerde bile)", () => {
  const cases: TargetMarketInput[] = [
    base,
    { ...base, totalValueUsd: 0, transactionCount: 0, importerCount: 0, supplierCount: 0,
      sourceSharePct: 100, growthRatio: -0.9, daysSinceLastTransaction: 200 },
    { ...base, totalValueUsd: 10_000_000, transactionCount: 9999, importerCount: 999,
      supplierCount: 999, sourceSharePct: 0, growthRatio: 10, daysSinceLastTransaction: 0 },
  ];
  for (const c of cases) {
    const s = calculateTargetMarketScore(c);
    assert.ok(s.total >= 0 && s.total <= 100, `aralik disi: ${s.total}`);
  }
});

test("her faktor kendi tavanini asmaz", () => {
  const s = calculateTargetMarketScore({
    ...base, totalValueUsd: 1e12, transactionCount: 1e6, importerCount: 1e6,
    supplierCount: 1e6, sourceSharePct: -50, growthRatio: 99, daysSinceLastTransaction: -10,
  });
  for (const f of s.factors) {
    assert.ok(f.score >= 0, `${f.key} negatif: ${f.score}`);
    assert.ok(f.score <= f.max, `${f.key} tavani asti: ${f.score}/${f.max}`);
  }
});

test("faktor toplami total ile tutarli", () => {
  const s = calculateTargetMarketScore(base);
  const sum = s.factors.reduce((a, f) => a + f.score, 0);
  assert.ok(Math.abs(sum - s.total) <= 1, `${sum} vs ${s.total}`);
});

test("agirliklarin toplami 100", () => {
  const sum = Object.values(WEIGHTS).reduce((a, v) => a + v, 0);
  assert.equal(sum, 100);
});

test("her faktorun aciklamasi var (skor kara kutu degil)", () => {
  const s = calculateTargetMarketScore(base);
  assert.equal(s.factors.length, 7);
  for (const f of s.factors) {
    assert.ok(f.label.length > 0, `${f.key} etiketsiz`);
    assert.ok(f.detail.length > 0, `${f.key} aciklamasiz`);
  }
});

test("deterministik: ayni girdi ayni sonucu verir", () => {
  assert.deepEqual(calculateTargetMarketScore(base), calculateTargetMarketScore(base));
});

test("buyume hesaplanamiyorsa 0 puan alir ve bu aciklamada belirtilir", () => {
  const s = calculateTargetMarketScore({ ...base, growthRatio: null });
  const g = s.factors.find((f) => f.key === "growth")!;
  assert.equal(g.score, 0);
  assert.match(g.detail, /yeterli dönem verisi yok/i);
});

test("Turkiye payi TERS calisir: pay dustukce puan artar", () => {
  const dolu = calculateTargetMarketScore({ ...base, sourceSharePct: 100 });
  const bos = calculateTargetMarketScore({ ...base, sourceSharePct: 0 });
  const f1 = dolu.factors.find((f) => f.key === "sourcePresence")!;
  const f2 = bos.factors.find((f) => f.key === "sourcePresence")!;
  assert.equal(f1.score, 0, "pay %100 iken bosluk firsati olmamali");
  assert.equal(f2.score, WEIGHTS.sourcePresence, "pay %0 iken tam puan olmali");
});

test("daha buyuk pazar daha yuksek (veya esit) skor verir", () => {
  const kucuk = calculateTargetMarketScore({ ...base, totalValueUsd: 50_000 });
  const buyuk = calculateTargetMarketScore({ ...base, totalValueUsd: 9_000_000 });
  assert.ok(buyuk.total >= kucuk.total);
});

test("etiket esikleri: 70+ Yuksek, 45+ Orta", () => {
  const s = calculateTargetMarketScore(base);
  if (s.total >= 70) assert.equal(s.label, "Yüksek Fırsat");
  else if (s.total >= 45) assert.equal(s.label, "Orta Fırsat");
  else assert.equal(s.label, "Düşük Fırsat");
});
