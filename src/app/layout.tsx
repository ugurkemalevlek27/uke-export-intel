import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UKE Global — Export Intelligence Platform",
  description: "Trade Intelligence, Company Intelligence ve Lead Generation platformu",
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
