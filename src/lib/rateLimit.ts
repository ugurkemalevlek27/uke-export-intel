// Giris denemesi sinirlama (Phase 5)
//
// NEDEN VERITABANI? Uygulama Vercel'de serverless calisiyor; bellekte tutulan
// bir sayac her yeni instance'ta sifirlanir ve saldirgan icin etkisiz olur.
// login_attempts tablosu tum instance'lar tarafindan paylasilir.
//
// NEDEN IP DEGIL E-POSTA? Uygulama proxy/CDN arkasinda; x-forwarded-for
// spoof edilebilir ve ayni ofisten giren kullanicilar ayni IP'yi paylasir.
// Kilit e-posta bazlidir; boylece bir hesaba yonelik brute-force durur,
// mesru kullanicilar etkilenmez.
//
// KAPI ACIK BIRAKMA KURALI: Veritabani hatasi durumunda giris ENGELLENMEZ
// (fail-open). Aksi halde tek bir DB hatasi tum girisleri kilitlerdi.

import { db } from "@/db";
import { loginAttempts } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

/** Kac basarisiz denemeden sonra kilit. */
export const MAX_FAILED_ATTEMPTS = 5;
/** Kac dakikalik pencere icinde sayilir / kilit ne kadar surer. */
export const WINDOW_MINUTES = 15;

export interface RateLimitState {
  blocked: boolean;
  failedCount: number;
  /** Kilit acilana kadar kalan dakika (blocked=false ise 0). */
  retryAfterMinutes: number;
}

function normalize(identifier: string): string {
  return identifier.toLowerCase().trim().slice(0, 255);
}

/**
 * Son WINDOW_MINUTES icindeki basarisiz denemeleri sayar.
 * Basarili bir girisin ardindan sayac sifirlanir (asagidaki recordAttempt'e bak).
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitState> {
  const id = normalize(identifier);
  if (!id) return { blocked: false, failedCount: 0, retryAfterMinutes: 0 };

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  try {
    const [row] = await db
      .select({
        failed: sql<string>`COUNT(*)`,
        lastAt: sql<Date | null>`MAX(${loginAttempts.attemptedAt})`,
      })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.identifier, id),
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, since)
        )
      );

    const failedCount = Number(row?.failed ?? 0);
    if (failedCount < MAX_FAILED_ATTEMPTS) {
      return { blocked: false, failedCount, retryAfterMinutes: 0 };
    }

    const lastAt = row?.lastAt ? new Date(row.lastAt) : new Date();
    const unlockAt = lastAt.getTime() + WINDOW_MINUTES * 60_000;
    const retryAfterMinutes = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
    return { blocked: true, failedCount, retryAfterMinutes };
  } catch {
    // fail-open: sinirlama katmani cokerse giris tamamen kilitlenmesin.
    return { blocked: false, failedCount: 0, retryAfterMinutes: 0 };
  }
}

/**
 * Denemeyi kaydeder. Basarili giriste ayni e-postanin bekleyen basarisiz
 * kayitlari temizlenir - boylece dogru sifreyi giren kullanici bir sonraki
 * denemesinde kilitli kalmaz.
 *
 * Not: Bu "veri silme" yasaginin kapsaminda degildir; login_attempts is
 * verisi degil, gecici bir guvenlik sayacidir.
 */
export async function recordAttempt(identifier: string, success: boolean): Promise<void> {
  const id = normalize(identifier);
  if (!id) return;
  try {
    await db.insert(loginAttempts).values({ identifier: id, success });
    if (success) {
      await db
        .delete(loginAttempts)
        .where(and(eq(loginAttempts.identifier, id), eq(loginAttempts.success, false)));
    }
  } catch {
    // Kayit tutulamazsa giris akisi bozulmaz.
  }
}
