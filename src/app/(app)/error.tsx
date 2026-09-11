"use client";

// Hata sinir (error boundary) — Phase 5
//
// Bir sayfa ya da server action hata verdiginde Next.js'in ciplak hata ekrani
// yerine bu ekran gosterilir.
//
// ONEMLI: Next.js production'da sunucu hatalarinin mesajini KASITLI olarak
// gizler (bilgi sizmasin diye); istemciye yalnizca bir "digest" kodu gelir.
// Bu yuzden burada mesaj uydurmuyoruz — ne olabilecegini duz Turkce anlatip
// digest kodunu gosteriyoruz ki destek icin kullanilabilsin.

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sunucu loglarinda iz birakmak icin (Vercel > Logs).
    console.error("Uygulama hatasi:", error);
  }, [error]);

  return (
    <div className="p-8 max-w-2xl">
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h1 className="text-lg font-semibold text-slate-900">İşlem tamamlanamadı</h1>
        <p className="text-sm text-slate-600 mt-2">
          Bu sayfa yüklenirken ya da kaydetme sırasında bir hata oluştu.
        </p>

        <p className="text-sm text-slate-600 mt-4">En sık görülen nedenler:</p>
        <ul className="text-sm text-slate-600 mt-1 space-y-1 list-disc list-inside">
          <li>Bu işlem için yetkiniz olmayabilir (rolünüzü yöneticinize sorun).</li>
          <li>Oturumunuz zaman aşımına uğramış olabilir — tekrar giriş yapın.</li>
          <li>Geçici bir veritabanı bağlantı sorunu olabilir — birkaç saniye sonra deneyin.</li>
        </ul>

        <div className="flex gap-2 mt-5 flex-wrap">
          <button
            onClick={reset}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Tekrar dene
          </button>
          <Link
            href="/"
            className="border border-slate-300 rounded-md px-4 py-2 text-sm hover:bg-slate-50"
          >
            Dashboard&apos;a dön
          </Link>
          <Link
            href="/login"
            className="border border-slate-300 rounded-md px-4 py-2 text-sm hover:bg-slate-50"
          >
            Yeniden giriş yap
          </Link>
        </div>

        {error.digest && (
          <p className="text-xs text-slate-400 mt-4">
            Hata kodu: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
