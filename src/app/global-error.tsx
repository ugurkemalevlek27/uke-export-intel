"use client";

// Kok hata sinir: layout'un kendisi cokerse devreye girer.
// Kendi <html>/<body>'sini uretmek ZORUNDADIR.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f8fafc",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: 28,
            maxWidth: 440,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#94a3b8", marginBottom: 6 }}>
            UKE GLOBAL
          </div>
          <h1 style={{ fontSize: 18, margin: "0 0 8px", color: "#0f172a" }}>
            Uygulama açılamadı
          </h1>
          <p style={{ fontSize: 14, color: "#475569", margin: "0 0 18px" }}>
            Beklenmeyen bir hata oluştu. Sayfayı yenilemeyi deneyin; sorun sürerse birkaç
            dakika sonra tekrar deneyin.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#0f172a",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              padding: "9px 18px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
          {error.digest && (
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 16 }}>
              Hata kodu: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
