// Lead durumlarinin Turkce etiketleri - TEK kaynak.
// Onceden bu liste companies/page.tsx icine gomuluydu; birden fazla ekran
// kullandigi icin ortak module tasindi.

export const LEAD_STATUS_LABELS: Record<string, string> = {
  yeni: "İrtibata Geçilmedi",
  arastiriliyor: "Araştırılıyor",
  karar_verici_bulundu: "Karar Verici Bulundu",
  ilk_temas: "İrtibat Kuruldu",
  linkedin_eklendi: "LinkedIn’den Eklendi",
  follow_up: "Takip Maili Gönderildi",
  ilgilendi: "İlgilendi",
  katalog_gonderildi: "Katalog Gönderildi",
  numune_talebi: "Numune Talebi",
  fiyat_talebi: "Fiyat Talebi",
  teklif_gonderildi: "Fiyat Teklifi Sunuldu",
  numune_gonderildi: "Numune Gönderildi",
  pazarlik: "Pazarlık",
  siparis_bekleniyor: "Sipariş Bekleniyor",
  siparis_alindi: "Alım Yaptı",
  uretim: "Üretim",
  sevkiyat: "Sevkiyat",
  tahsilat: "Tahsilat",
  tekrar_siparis: "Tekrar Sipariş",
  kaybedildi: "Kaybedildi",
  beklemede: "Beklemede",
  uygun_degil: "Uygun Değil",
};

export const CRM_STAGES = [
  "yeni", "ilk_temas", "linkedin_eklendi", "follow_up",
  "katalog_gonderildi", "teklif_gonderildi", "numune_gonderildi", "siparis_alindi",
] as const;

// Retain an existing historical status when editing unrelated fields.
export function statusOptions(current: string): readonly string[] {
  return (CRM_STAGES as readonly string[]).includes(current)
    ? CRM_STAGES : [current, ...CRM_STAGES];
}
