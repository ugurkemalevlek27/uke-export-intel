// Sevkiyat kaydi icerik hash'i (Phase 4)
//
// AMAC: Ayni Excel dosyasi ikinci kez yuklendiginde kayitlarin tekrar
// eklenmesini engellemek. V1'de bu koruma yoktu; ayni dosya iki kez
// yuklendiginde tum rakamlar ikiye katlaniyordu.
//
// YONTEM: Bir sevkiyati benzersiz kilan alanlardan deterministik bir hash
// uretilir. Alanlar once normalize edilir (bosluk/buyuk-kucuk harf farki
// duplicate saymayi engellememeli).
//
// NOT: Hash "ayni sevkiyat" tanimidir; degistirilirse mevcut hash'ler
// gecersiz kalir ve backfill script'inin yeniden calistirilmasi gerekir.

import { createHash } from "crypto";

export interface RowHashInput {
  projectId: number | null;
  hsCode: string;
  importerNameRaw: string;
  exporterNameRaw: string | null;
  importerCountry: string | null;
  transactionDate: string | null;
  valueUsd: string | number;
  quantity: string | number | null;
}

function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sayisal degerleri tutarli bicimde metne cevirir (0.10 ile 0.1 ayni sayilmali). */
function normNum(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : norm(v);
}

export function computeRowHash(input: RowHashInput): string {
  const parts = [
    input.projectId ?? "",
    norm(input.hsCode),
    norm(input.importerNameRaw),
    norm(input.exporterNameRaw),
    norm(input.importerCountry),
    norm(input.transactionDate),
    normNum(input.valueUsd),
    normNum(input.quantity),
  ];
  return createHash("md5").update(parts.join("|")).digest("hex");
}
