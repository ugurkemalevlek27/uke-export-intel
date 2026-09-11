import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UKE Global — Export Intelligence Platform",
  description: "Trade Intelligence, Company Intelligence ve Lead Generation platformu",
};

/**
 * Mobil goruntuleme (Phase 5)
 *
 * Bu meta olmadan tarayici sayfayi masaustu genisliginde varsayip kucultuyordu;
 * telefonda yazilar okunamiyor ve tablolar ekrandan tasiyordu.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Erisilebilirlik: kullanicinin yakinlastirmasi ENGELLENMIYOR.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans">
        {children}
      </body>
    </html>
  );
}
