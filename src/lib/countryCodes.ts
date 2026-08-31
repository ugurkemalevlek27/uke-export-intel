// Serbest metin ulke adlarini (Excel dosyalarindan oldugu gibi gelen, standart
// olmayan) ISO 3166-1 alpha-2 koduna cevirir. Bu, dunya haritasi gorsellestirmesi
// icin gereklidir (bkz. src/components/WorldMap.tsx).
//
// NOT: Bu, "ulke/liman/consignee/shipper verilerinin normalize edilmesi" olarak
// tanimlanan daha genis veri temizleme ihtiyacinin bir parcasidir. Import
// sirasinda ham deger degistirilmez (cleanCountry sadece trim yapar) - sadece
// GORSELLESTIRME ve harita eslestirmesi icin ayri bir normalizasyon katmani.

import { regions } from "react-svg-worldmap";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // aksanlari kaldir
    .toLowerCase()
    .replace(/[().,'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// react-svg-worldmap'in desteklegi 152 ulkenin isim -> kod eslesmesi (temel)
const NAME_TO_CODE = new Map<string, string>();
for (const r of regions) {
  NAME_TO_CODE.set(normalize(r.name), r.code.toLowerCase());
}

// Ingilizce/Turkce yaygin alternatif yazimlar ve kisaltmalar
const ALIASES: Record<string, string> = {
  "usa": "us",
  "u s a": "us",
  "united states of america": "us",
  "amerika": "us",
  "amerika birlesik devletleri": "us",
  "uk": "gb",
  "u k": "gb",
  "great britain": "gb",
  "england": "gb",
  "ingiltere": "gb",
  "birlesik krallik": "gb",
  "uae": "ae",
  "birlesik arap emirlikleri": "ae",
  "turkiye": "tr",
  "turkey": "tr",
  "republic of turkiye": "tr",
  "azerbaycan": "az",
  "gurcistan": "ge",
  "rusya": "ru",
  "rusya federasyonu": "ru",
  "russian federation": "ru",
  "kazakistan": "kz",
  "ozbekistan": "uz",
  "uzbekistan": "uz",
  "turkmenistan": "tm",
  "kirgizistan": "kg",
  "tacikistan": "tj",
  "iran": "ir",
  "i r iran": "ir",
  "islamic republic of iran": "ir",
  "irak": "iq",
  "suudi arabistan": "sa",
  "saudi arabia": "sa",
  "misir": "eg",
  "egypt": "eg",
  "fas": "ma",
  "morocco": "ma",
  "cezayir": "dz",
  "algeria": "dz",
  "tunus": "tn",
  "tunisia": "tn",
  "libya": "ly",
  "ürdün": "jo",
  "urdun": "jo",
  "jordan": "jo",
  "lubnan": "lb",
  "lebanon": "lb",
  "suriye": "sy",
  "syria": "sy",
  "syrian arab republic": "sy",
  "yemen": "ye",
  "umman": "om",
  "oman": "om",
  "katar": "qa",
  "qatar": "qa",
  "kuveyt": "kw",
  "kuwait": "kw",
  "bahreyn": "bh",
  "israil": "il",
  "israel": "il",
  "filistin": "ps",
  "palestine": "ps",
  "state of palestine": "ps",
  "yunanistan": "gr",
  "greece": "gr",
  "bulgaristan": "bg",
  "bulgaria": "bg",
  "romanya": "ro",
  "romania": "ro",
  "ukrayna": "ua",
  "ukraine": "ua",
  "beyaz rusya": "by",
  "belarus": "by",
  "moldova": "md",
  "polonya": "pl",
  "poland": "pl",
  "macaristan": "hu",
  "hungary": "hu",
  "almanya": "de",
  "germany": "de",
  "deutschland": "de",
  "fransa": "fr",
  "france": "fr",
  "italya": "it",
  "italy": "it",
  "ispanya": "es",
  "spain": "es",
  "portekiz": "pt",
  "portugal": "pt",
  "hollanda": "nl",
  "netherlands": "nl",
  "belcika": "be",
  "belgium": "be",
  "isvicre": "ch",
  "switzerland": "ch",
  "avusturya": "at",
  "austria": "at",
  "cek cumhuriyeti": "cz",
  "czech republic": "cz",
  "czechia": "cz",
  "slovakya": "sk",
  "slovakia": "sk",
  "hirvatistan": "hr",
  "croatia": "hr",
  "sirbistan": "rs",
  "serbia": "rs",
  "bosna hersek": "ba",
  "bosnia and herzegovina": "ba",
  "kuzey makedonya": "mk",
  "north macedonia": "mk",
  "arnavutluk": "al",
  "albania": "al",
  "kosova": "xk",
  "kosovo": "xk",
  "karadag": "me",
  "montenegro": "me",
  "guney kibris": "cy",
  "cyprus": "cy",
  "kib. kib. cumhuriyeti": "cyp",
  "kktc": "cyp",
  "isvec": "se",
  "sweden": "se",
  "norvec": "no",
  "norway": "no",
  "danimarka": "dk",
  "denmark": "dk",
  "finlandiya": "fi",
  "finland": "fi",
  "izlanda": "is",
  "iceland": "is",
  "irlanda": "ie",
  "ireland": "ie",
  "luksemburg": "lu",
  "luxembourg": "lu",
  "cin": "cn",
  "china": "cn",
  "peoples republic of china": "cn",
  "hong kong": "cn",
  "tayvan": "tw",
  "taiwan": "tw",
  "japonya": "jp",
  "japan": "jp",
  "guney kore": "kr",
  "south korea": "kr",
  "korea republic of": "kr",
  "republic of korea": "kr",
  "kuzey kore": "kp",
  "north korea": "kp",
  "hindistan": "in",
  "india": "in",
  "pakistan": "pk",
  "bangladeş": "bd",
  "bangladesh": "bd",
  "vietnam": "vn",
  "viet nam": "vn",
  "tayland": "th",
  "thailand": "th",
  "malezya": "my",
  "malaysia": "my",
  "endonezya": "id",
  "indonesia": "id",
  "filipinler": "ph",
  "philippines": "ph",
  "singapur": "sg",
  "singapore": "sg",
  "avustralya": "au",
  "australia": "au",
  "yeni zelanda": "nz",
  "new zealand": "nz",
  "kanada": "ca",
  "canada": "ca",
  "meksika": "mx",
  "mexico": "mx",
  "brezilya": "br",
  "brazil": "br",
  "arjantin": "ar",
  "argentina": "ar",
  "sili": "cl",
  "chile": "cl",
  "guney afrika": "za",
  "south africa": "za",
  "nijerya": "ng",
  "nigeria": "ng",
  "kenya": "ke",
  "fas krallik": "ma",
  "ivory coast": "ci",
  "cote d ivoire": "ci",
  "cotedivoire": "ci",
  "burma": "mm",
  "laos": "la",
  "lao pdr": "la",
};

for (const [k, v] of Object.entries(ALIASES)) {
  NAME_TO_CODE.set(normalize(k), v);
}

const VALID_CODES = new Set(regions.map((r) => r.code.toLowerCase()));
// Kutuphanenin desteklemedigi ama gercek ISO2 kodlari olan bazi ozel durumlar
VALID_CODES.add("cyp");
VALID_CODES.add("som");

/**
 * Serbest metin bir ulke adini (ornek: "Azerbaijan (AZ)", "TURKIYE", "Rusya
 * Federasyonu") react-svg-worldmap'in kabul ettigi kucuk harfli ISO2 koduna
 * cevirir. Eslesme bulunamazsa null doner (harita uzerinde gosterilmez, ama
 * mevcut listelerden kaldirilmaz).
 */
export function countryNameToIso2(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.toLowerCase() === "unknown") return null;

  // 1) Parantez icindeki 2 harfli kod: "Azerbaijan (AZ)"
  const parenMatch = value.match(/\(([A-Za-z]{2})\)\s*$/);
  if (parenMatch) {
    const code = parenMatch[1].toLowerCase();
    if (VALID_CODES.has(code)) return code;
  }

  // 2) Direkt 2 harfli kod: "AZ", "TR"
  if (/^[A-Za-z]{2}$/.test(value) && VALID_CODES.has(value.toLowerCase())) {
    return value.toLowerCase();
  }

  // 3) Isim eslestirme (parantez kismini atarak da dene)
  const withoutParens = value.replace(/\([^)]*\)/g, "").trim();
  const n1 = normalize(value);
  const n2 = normalize(withoutParens);
  return NAME_TO_CODE.get(n1) ?? NAME_TO_CODE.get(n2) ?? null;
}
