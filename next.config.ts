import type { NextConfig } from "next";

/**
 * Guvenlik basliklari (Phase 5)
 *
 * Bu basliklar TUM yanitlara eklenir. Amaci: clickjacking, MIME sniffing ve
 * referrer sizintisi gibi yaygin tarayici tarafli riskleri kapatmak.
 *
 * NOT: Content-Security-Policy BILINCLI olarak eklenmedi. Next.js'in inline
 * script'leri icin nonce tabanli bir CSP gerekir; yanlis kurgulanmis bir CSP
 * uygulamayi sessizce bozar. Ayri bir adim olarak ele alinmali.
 */
const securityHeaders = [
  // Sayfanin baska bir sitenin iframe'ine gomulmesini engeller (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Tarayicinin Content-Type'i "tahmin etmesini" engeller.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Dis sitelere yalnizca origin gonderilir; URL'deki filtre/arama parametreleri sizmaz.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Kullanilmayan tarayici ozellikleri kapatilir.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HTTPS zorunlulugu (Vercel zaten HTTPS; tarayici tarafinda da sabitlenir).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // "X-Powered-By: Next.js" bilgisini sizdirma
  experimental: {
    // Ticaret veri dosyalari (Excel/CSV) varsayilan 1MB sinirindan buyuk olabilir.
    // V1 icin makul bir ust sinir; cok daha buyuk dosyalar (100K+ satir) icin
    // ileride streaming/chunked upload dusunulmeli (bkz. CLAUDE.md madde 19).
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Rapor ve export ciktilari onbellege alinmamali (kiracıya ozel veri).
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
