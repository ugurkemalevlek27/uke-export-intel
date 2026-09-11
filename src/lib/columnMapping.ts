// Sutun eslestirme (Import Wizard - Phase 4)
//
// V1'de sutun basliklari sabit bir listeye gore eslestiriliyordu; baslik
// taninmazsa veri sessizce kayboluyordu. Artik her musterinin Excel'i farkli
// olabilecegi icin eslestirme KULLANICI tarafindan gorulur ve duzeltilebilir.
// Otomatik oneri yalnizca bir baslangic noktasidir.

/** Sistemin anladigi alanlar. */
export const IMPORT_FIELDS = [
  "hsCode",
  "importer",
  "importerCountry",
  "exporter",
  "exporterCountry",
  "date",
  "productDescription",
  "quantity",
  "unit",
  "weightMt",
  "valueUsd",
  "shipments",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Zorunlu alanlar - bunlar eslenmezse import baslatilamaz. */
export const REQUIRED_FIELDS: ImportField[] = ["hsCode", "importer", "valueUsd"];

export const FIELD_LABELS: Record<ImportField, string> = {
  hsCode: "GTİP / HS Code",
  importer: "İthalatçı Firma",
  importerCountry: "İthalatçı Ülke",
  exporter: "Tedarikçi / İhracatçı",
  exporterCountry: "Menşei Ülke",
  date: "Tarih",
  productDescription: "Ürün Açıklaması",
  quantity: "Miktar",
  unit: "Birim",
  weightMt: "Ağırlık (MT)",
  valueUsd: "Değer (USD)",
  shipments: "Sevkiyat Sayısı",
};

/** Otomatik eslestirme icin bilinen baslik kaliplari. */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  hsCode: ["hs_code", "hscode", "hs code", "gtip", "gtİp", "tarife", "hs"],
  importer: ["importer", "ithalatci", "ithalatçı", "buyer", "consignee", "alici", "alıcı"],
  importerCountry: ["country_of_importers", "importercountry", "importer_country", "ulke", "ülke", "varis_ulke", "destination"],
  exporter: ["exporter", "ihracatci", "ihracatçı", "supplier", "shipper", "tedarikci", "tedarikçi", "satici"],
  exporterCountry: ["country_of_exporters", "exportercountry", "exporter_country", "mensei_ulke", "menşei", "origin", "origin_country"],
  date: ["date", "tarih", "shipment_date", "transaction_date", "islem_tarihi"],
  productDescription: ["actual_detailed_product", "productdescription", "product_description", "urun_aciklamasi", "ürün açıklaması", "product", "urun", "ürün", "description", "mal_cinsi"],
  quantity: ["quantity", "miktar", "qty", "adet"],
  unit: ["unit_qty", "unit", "birim", "olcu", "ölçü"],
  weightMt: ["mt", "weight_mt", "agirlik", "ağırlık", "net_weight", "brut_agirlik", "kg"],
  valueUsd: ["value(usd)", "value_usd", "valueusd", "value usd", "deger_usd", "değer", "tutar", "amount", "fob", "cif", "value"],
  shipments: ["shipments", "sevkiyat", "shipment_count", "kap_adedi"],
};

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_()ıİşğüöç]/g, "");
}

/**
 * Dosya basliklarina bakarak otomatik eslestirme onerir.
 * Donen nesne: alan -> baslik adi (eslesmeyenler undefined).
 *
 * Once TAM eslesme, sonra ICEREN eslesme denenir; ayni baslik iki alana
 * atanmaz (ilk gelen kazanir).
 */
export function suggestMapping(headers: string[]): Partial<Record<ImportField, string>> {
  const mapping: Partial<Record<ImportField, string>> = {};
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  // 1) Tam eslesme
  for (const field of IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field].map(normalizeHeader);
    const hit = normalized.find((h) => !used.has(h.raw) && aliases.includes(h.norm));
    if (hit) {
      mapping[field] = hit.raw;
      used.add(hit.raw);
    }
  }

  // 2) Kismi eslesme (baslik, takma adi iceriyorsa)
  for (const field of IMPORT_FIELDS) {
    if (mapping[field]) continue;
    const aliases = HEADER_ALIASES[field].map(normalizeHeader).filter((a) => a.length >= 4);
    const hit = normalized.find(
      (h) => !used.has(h.raw) && aliases.some((a) => h.norm.includes(a) || a.includes(h.norm))
    );
    if (hit) {
      mapping[field] = hit.raw;
      used.add(hit.raw);
    }
  }

  return mapping;
}

export function missingRequired(mapping: Partial<Record<ImportField, string>>): ImportField[] {
  return REQUIRED_FIELDS.filter((f) => !mapping[f]);
}
