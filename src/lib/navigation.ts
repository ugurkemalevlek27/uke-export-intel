// Ana navigasyon tanimi (Phase 1)
//
// Navigasyon KOD ICINE GOMULU DEGIL: burada veri olarak tanimlanir, Sidebar
// bilesenі bunu render eder. Yeni modul eklemek = buraya bir satir eklemek.
//
// status alani:
//   "ready"   -> ekran hazir, link aktif
//   "planned" -> henuz yazilmadi; menude gorunur ama TIKLANAMAZ ve "Yakında"
//                etiketi tasir. Boylece yol haritasi gorunur olur ama kullanici
//                bos/404 bir sayfaya dusmez.

import type { Role } from "./roles";
import { can } from "./roles";

export type NavStatus = "ready" | "planned";

export interface NavItem {
  label: string;
  href: string;
  status: NavStatus;
  /** Bu ogeyi gormek icin gereken yetki kontrolu (undefined = herkes gorur) */
  visibleFor?: (role: Role) => boolean;
}

export interface NavGroup {
  /** Grup basligi; null ise oge tek basina (grupsuz) gosterilir */
  title: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [{ label: "Dashboard", href: "/", status: "ready" }],
  },
  {
    title: "Trade Intelligence",
    items: [
      { label: "Ülke Analizi", href: "/trade/countries", status: "ready" },
      { label: "Ürün / GTİP Analizi", href: "/trade/products", status: "ready" },
      { label: "Tedarikçi Analizi", href: "/trade/suppliers", status: "ready" },
      { label: "İşlem Analizi", href: "/trade/transactions", status: "ready" },
      { label: "Rakip Analizi", href: "/trade/competitors", status: "ready" },
    ],
  },
  {
    title: null,
    items: [
      { label: "Hedef Pazarlar", href: "/target-markets", status: "ready" },
      { label: "Firmalar", href: "/companies", status: "ready" },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Lead'ler", href: "/crm/leads", status: "ready", visibleFor: can.editCrm },
      { label: "Aktiviteler", href: "/crm/activities", status: "ready", visibleFor: can.editCrm },
      { label: "Takipler", href: "/crm/follow-ups", status: "ready", visibleFor: can.editCrm },
    ],
  },
  {
    title: "Veri",
    items: [
      { label: "Veri İçe Aktar", href: "/import", status: "ready", visibleFor: can.importData },
      { label: "İçe Aktarma Geçmişi", href: "/data/history", status: "ready", visibleFor: can.importData },
      { label: "Veri Kalitesi", href: "/data/quality", status: "ready", visibleFor: can.manageDataQuality },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { label: "Projeler", href: "/admin/projects", status: "ready", visibleFor: can.manageProjects },
      { label: "Kullanıcılar", href: "/admin/users", status: "ready", visibleFor: can.manageUsers },
      { label: "Ayarlar", href: "/admin/settings", status: "ready", visibleFor: can.manageUsers },
    ],
  },
];

/**
 * Client Component'e gonderilebilen, SERILESTIRILEBILIR navigasyon sekli.
 *
 * ONEMLI: NavItem icindeki visibleFor bir FONKSIYONDUR ve Server Component'ten
 * Client Component'e fonksiyon gecirilemez (Next.js calisma zamani hatasi verir).
 * Bu yuzden yetki suzgeci SUNUCUDA uygulanir ve istemciye yalnizca duz veri gider.
 */
export interface PublicNavItem {
  label: string;
  href: string;
  status: NavStatus;
}

export interface PublicNavGroup {
  title: string | null;
  items: PublicNavItem[];
}

/** Kullanicinin rolune gore gorunur navigasyonu uretir (bos gruplar dusurulur). */
export function navigationFor(role: Role): PublicNavGroup[] {
  return NAV_GROUPS.map((g) => ({
    title: g.title,
    items: g.items
      .filter((i) => (i.visibleFor ? i.visibleFor(role) : true))
      // visibleFor BILEREK cikariliyor - istemciye fonksiyon gonderilmez.
      .map(({ label, href, status }) => ({ label, href, status })),
  })).filter((g) => g.items.length > 0);
}
