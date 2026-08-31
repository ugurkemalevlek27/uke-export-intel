// Firma adi normalizasyonu (CLAUDE.md madde 21)
//
// Amac: "ABC LTD" / "ABC LTD." / "ABC LIMITED" gibi varyasyonlari tek bir
// karsilastirma anahtarinda (key) bulusturmak - ANCAK gercek veritabani
// kaydini otomatik BIRLESTIRMEMEK. Iki firma ayni mi degil mi emin
// olunmadan kalici birlestirme yapilmaz; bunun yerine "olasi duplicate"
// olarak isaretlenir (bkz. lib/duplicates.ts).

const LEGAL_SUFFIXES = [
  "ANONIM SIRKETI", "ANONİM ŞİRKETİ", "A.S.", "AS",
  "LIMITED SIRKETI", "LTD SIRKETI", "LIMITED", "LTD.", "LTD",
  "SANAYI VE TICARET", "SANAYI TICARET", "SAN. TIC.", "SAN TIC",
  "MAHDUD MESULIYYETLI CEMIYYETI", "MEHDUD MESULIYYETLI CEMIYYETI", "MMC",
  "COMPANY", "CO.", "CO", "LLC", "LLP", "INC", "INC.",
  "TICARET", "KIMYA SANAYI", "SANAYI",
];

/** Turkce/Azerice karakterleri ASCII'ye indirger, karsilastirmayi kolaylastirir. */
function foldChars(input: string): string {
  return input
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c");
}

/**
 * Goruntu icin normalize edilmis isim (kullaniciya gosterilecek).
 * Sadece bosluk/noktalama/tirnak temizligi yapar, karakterleri BOZMAZ.
 */
export function normalizeDisplayName(raw: string): string {
  if (!raw) return "Unknown";
  let n = raw.toUpperCase().trim();
  n = n.replace(/[«»"“”]/g, "");
  n = n.replace(/\s+/g, " ");
  n = n.replace(/\.+$/g, "").trim();
  return n || "Unknown";
}

/**
 * Karsilastirma anahtari (matching key). Duplicate ADAYI bulmak icin kullanilir,
 * DOGRUDAN veritabanina yazilmaz. Turkce karakter varyasyonlarini ve yaygin
 * sirket eklerini yok sayar.
 */
export function companyMatchKey(raw: string): string {
  let n = foldChars(normalizeDisplayName(raw));
  for (const suffix of LEGAL_SUFFIXES) {
    n = n.replace(new RegExp(`\\b${suffix.replace(/\./g, "\\.")}\\b`, "g"), "");
  }
  n = n.replace(/[^A-Z0-9]/g, ""); // sadece harf/rakam kalsin
  return n;
}
