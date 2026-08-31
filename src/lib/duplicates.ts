// Olasi duplicate firma tespiti (CLAUDE.md madde 21)
//
// Iki farkli sirket kaydi ("RETRO HOLDING MMC" ve "RETRO HOLDING MMC AZERBEYCAN"
// gibi) ayni firma olabilir ama emin olunmadan OTOMATIK BIRLESTIRILMEZ.
// Bu fonksiyon yalnizca "olasi duplicate" ADAYLARINI bulur; kullanici
// arayuzunde isaretlenir, birlestirme karari her zaman insana birakilir.

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

export interface DuplicateCandidate {
  keyA: string;
  keyB: string;
  reason: string;
}

/**
 * matchKey listesi icinde birbirine cok benzeyen ciftleri bulur.
 * - biri digerinin alt string'iyse ("RETROHOLDING" -> "RETROHOLDINGAZERBEYCAN")
 * - veya Levenshtein mesafesi, uzunluga gore kucukse (yazim farki / karakter farki)
 */
export function findPossibleDuplicates(
  matchKeys: string[]
): DuplicateCandidate[] {
  const unique = Array.from(new Set(matchKeys.filter((k) => k.length >= 4)));
  const candidates: DuplicateCandidate[] = [];

  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i];
      const b = unique[j];
      if (a === b) continue;

      if (a.includes(b) || b.includes(a)) {
        candidates.push({ keyA: a, keyB: b, reason: "Bir isim digerinin icinde geciyor" });
        continue;
      }

      const maxLen = Math.max(a.length, b.length);
      if (maxLen === 0) continue;
      const dist = levenshtein(a, b);
      const similarity = 1 - dist / maxLen;
      if (similarity >= 0.85 && maxLen >= 6) {
        candidates.push({
          keyA: a,
          keyB: b,
          reason: `Yazim benzerligi %${Math.round(similarity * 100)}`,
        });
      }
    }
  }
  return candidates;
}
