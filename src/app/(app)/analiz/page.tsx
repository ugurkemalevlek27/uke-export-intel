import { redirect } from "next/navigation";
import type { RawSearchParams } from "@/lib/filters";

/**
 * /analiz Phase 2'de uc ayri route'a bolundu:
 *   ?tab=ulke      -> /trade/countries
 *   ?tab=urun      -> /trade/products
 *   ?tab=tedarikci -> /trade/suppliers
 *
 * Bu dosya yalnizca eski linkleri (yer imleri, paylasilmis adresler) yeni
 * adreslere yonlendirmek icin duruyor - kirik link olusmasin diye.
 */
export default async function AnalizRedirect({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;

  const params = new URLSearchParams();
  const country = Array.isArray(sp.country) ? sp.country[0] : sp.country;
  const hsCode = Array.isArray(sp.hsCode) ? sp.hsCode[0] : sp.hsCode;
  const exporter = Array.isArray(sp.exporter) ? sp.exporter[0] : sp.exporter;

  if (tab === "urun") {
    if (hsCode) redirect(`/trade/products/${encodeURIComponent(hsCode)}`);
    redirect("/trade/products");
  }
  if (tab === "tedarikci") {
    if (exporter) redirect(`/trade/suppliers/${encodeURIComponent(exporter)}`);
    redirect("/trade/suppliers");
  }
  if (country) redirect(`/trade/countries/${encodeURIComponent(country)}`);
  const qs = params.toString();
  redirect(qs ? `/trade/countries?${qs}` : "/trade/countries");
}
