// Rol / yetki mimarisi (Phase 1)
//
// TASARIM NOTU — neden pgEnum degil de varchar + TS tipi?
// users.role sutunu V1'de varchar('admin') olarak olusturuldu ve CANLI veritabaninda
// zaten 'admin' degerli satirlar var. Bu sutunu pgEnum'a cevirmek destructive bir
// migration gerektirir (mevcut degerlerin enum'da olmamasi hatasi). Bu yuzden sutun
// varchar olarak kaliyor; izin verilen degerler burada TypeScript seviyesinde
// tanimlaniyor ve legacy 'admin' degeri organization_admin'e esleniyor.
// Boylece mevcut kullanicilar bozulmadan RBAC altyapisi hazir hale geliyor.

export const ROLES = [
  "super_admin",
  "organization_admin",
  "manager",
  "analyst",
  "sales",
  "viewer",
] as const;

export type Role = (typeof ROLES)[number];

/** Yetki seviyesi: buyuk sayi daha genis yetki demek. */
const ROLE_RANK: Record<Role, number> = {
  viewer: 10,
  sales: 20,
  analyst: 30,
  manager: 40,
  organization_admin: 50,
  super_admin: 60,
};

/**
 * Veritabanindaki ham role degerini gecerli bir Role'e cevirir.
 * Bilinmeyen ya da bos degerler en dusuk yetkiye (viewer) duser - guvenli varsayilan.
 * Legacy 'admin' -> organization_admin.
 */
export function normalizeRole(raw: string | null | undefined): Role {
  if (!raw) return "viewer";
  const v = raw.trim().toLowerCase();
  if (v === "admin") return "organization_admin"; // V1 legacy deger
  return (ROLES as readonly string[]).includes(v) ? (v as Role) : "viewer";
}

/** role, gereken minimum seviyeyi karsiliyor mu? */
export function hasAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

// --- Yetenek (capability) tanimlari -----------------------------------------
// UI ve server action'lar bu fonksiyonlari kullanir; ham rol karsilastirmasi
// kod icine dagitilmaz.

export const can = {
  /** Analiz ekranlarini goruntuleme */
  viewAnalytics: (role: Role) => hasAtLeast(role, "viewer"),
  /** CRM alanlarini (lead durumu, notlar, takip) duzenleme */
  editCrm: (role: Role) => hasAtLeast(role, "sales"),
  /** Veri import etme */
  importData: (role: Role) => hasAtLeast(role, "analyst"),
  /** Duplicate birlestirme, veri kalitesi duzeltmeleri */
  manageDataQuality: (role: Role) => hasAtLeast(role, "manager"),
  /** Proje olusturma/duzenleme */
  manageProjects: (role: Role) => hasAtLeast(role, "manager"),
  /** Kullanici ve organizasyon ayarlari */
  manageUsers: (role: Role) => hasAtLeast(role, "organization_admin"),
};

export const ROLE_LABELS_TR: Record<Role, string> = {
  super_admin: "Süper Yönetici",
  organization_admin: "Organizasyon Yöneticisi",
  manager: "Yönetici",
  analyst: "Analist",
  sales: "Satış",
  viewer: "Görüntüleyici",
};
