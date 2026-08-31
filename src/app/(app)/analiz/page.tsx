import { getSession } from "@/lib/auth";
import {
  getDistinctCountries,
  getDistinctProducts,
  getCountryAnalysis,
  getProductAnalysis,
} from "@/lib/queries";
import { PageHeader, KpiCard, ScoreBadge, EmptyState, formatUsd } from "@/components/ui";
import Link from "next/link";

type Tab = "ulke" | "urun";

export default async function AnalizPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; country?: string; hsCode?: string }>;
}) {
  const session = await getSession();
  const organizationId = session!.organizationId;
  const params = await searchParams;
  const tab: Tab = params.tab === "urun" ? "urun" : "ulke";

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Analiz"
        description="Ülke veya ürün (GTİP) bazında ithalat verisini detaylı inceleyin."
      />

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <TabLink tab="ulke" active={tab === "ulke"}>
          Ülke Analizi
        </TabLink>
        <TabLink tab="urun" active={tab === "urun"}>
          Ürün Analizi
        </TabLink>
      </div>

      {tab === "ulke" ? (
        <UlkeAnalizi organizationId={organizationId} selectedCountry={params.country} />
      ) : (
        <UrunAnalizi organizationId={organizationId} selectedHsCode={params.hsCode} />
      )}
    </div>
  );
}

function TabLink({ tab, active, children }: { tab: Tab; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={`/analiz?tab=${tab}`}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        active
          ? "border-slate-900 text-slate-900"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </Link>
  );
}

async function UlkeAnalizi({
  organizationId,
  selectedCountry,
}: {
  organizationId: number;
  selectedCountry?: string;
}) {
  const countries = await getDistinctCountries(organizationId);

  return (
    <div>
      <form className="flex gap-3 mb-6">
        <select
          name="country"
          defaultValue={selectedCountry}
          className="flex-1 max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Bir ülke seçin...</option>
          {countries.map((c) => (
            <option key={c.country} value={c.country ?? ""}>
              {c.country ?? "Unknown"} ({formatUsd(Number(c.totalValueUsd))})
            </option>
          ))}
        </select>
        <input type="hidden" name="tab" value="ulke" />
        <button className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800">
          Görüntüle
        </button>
      </form>

      {!selectedCountry ? (
        <EmptyState text="Detay görmek için yukarıdan bir ülke seçin." />
      ) : (
        <CountryDetail organizationId={organizationId} country={selectedCountry} />
      )}
    </div>
  );
}

async function CountryDetail({ organizationId, country }: { organizationId: number; country: string }) {
  const { kpis, topExporters, topImporters } = await getCountryAnalysis(organizationId, country);

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">{country}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="TOPLAM DEĞER" value={formatUsd(Number(kpis?.totalValueUsd ?? 0))} />
        <KpiCard label="İŞLEM SAYISI" value={String(kpis?.transactionCount ?? 0)} />
        <KpiCard label="TEDARİKÇİ SAYISI" value={String(kpis?.distinctExporters ?? 0)} />
        <KpiCard label="İTHALATÇI FİRMA SAYISI" value={String(kpis?.distinctImporters ?? 0)} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <RankedList
          title="Bu Ülkeye En Çok Satan Tedarikçiler"
          rows={topExporters.map((e, i) => ({
            key: i,
            label: e.name ?? "Not Available",
            value: formatUsd(Number(e.totalValueUsd)),
          }))}
        />
        <RankedList
          title="Bu Ülkedeki En Yüksek Hacimli İthalatçı Firmalar"
          rows={topImporters.map((c, i) => ({
            key: c.companyId ?? `na-${i}`,
            label: c.name ?? "Not Available",
            value: formatUsd(Number(c.totalValueUsd)),
            href: c.companyId ? `/companies/${c.companyId}` : undefined,
            score: c.leadScore,
            scoreLabel: c.leadScoreLabel,
          }))}
        />
      </div>
    </div>
  );
}

async function UrunAnalizi({
  organizationId,
  selectedHsCode,
}: {
  organizationId: number;
  selectedHsCode?: string;
}) {
  const products = await getDistinctProducts(organizationId);

  return (
    <div>
      <form className="flex gap-3 mb-6">
        <select
          name="hsCode"
          defaultValue={selectedHsCode}
          className="flex-1 max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Bir ürün (GTİP) seçin...</option>
          {products.map((p) => (
            <option key={p.hsCode} value={p.hsCode ?? ""}>
              {p.hsCode} — {p.productDescription ?? "Not Available"} ({formatUsd(Number(p.totalValueUsd))})
            </option>
          ))}
        </select>
        <input type="hidden" name="tab" value="urun" />
        <button className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800">
          Görüntüle
        </button>
      </form>

      {!selectedHsCode ? (
        <EmptyState text="Detay görmek için yukarıdan bir ürün (GTİP) seçin." />
      ) : (
        <ProductDetail organizationId={organizationId} hsCode={selectedHsCode} />
      )}
    </div>
  );
}

async function ProductDetail({ organizationId, hsCode }: { organizationId: number; hsCode: string }) {
  const { kpis, byCountry, topImporters } = await getProductAnalysis(organizationId, hsCode);

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">GTİP {hsCode}</h2>
      <p className="text-sm text-slate-500 mb-4">{kpis?.productDescription ?? "Not Available"}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="TOPLAM DEĞER" value={formatUsd(Number(kpis?.totalValueUsd ?? 0))} />
        <KpiCard label="İŞLEM SAYISI" value={String(kpis?.transactionCount ?? 0)} />
        <KpiCard label="ÜLKE SAYISI" value={String(kpis?.distinctCountries ?? 0)} />
        <KpiCard label="İTHALATÇI FİRMA SAYISI" value={String(kpis?.distinctImporters ?? 0)} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <RankedList
          title="Bu Ürünü En Çok İthal Eden Ülkeler"
          rows={byCountry.map((c, i) => ({
            key: i,
            label: c.country ?? "Not Available",
            value: formatUsd(Number(c.totalValueUsd)),
          }))}
        />
        <RankedList
          title="Bu Ürünü En Çok İthal Eden Firmalar"
          rows={topImporters.map((c, i) => ({
            key: c.companyId ?? `na-${i}`,
            label: `${c.name ?? "Not Available"} (${c.country ?? "Unknown"})`,
            value: formatUsd(Number(c.totalValueUsd)),
            href: c.companyId ? `/companies/${c.companyId}` : undefined,
            score: c.leadScore,
            scoreLabel: c.leadScoreLabel,
          }))}
        />
      </div>
    </div>
  );
}

function RankedList({
  title,
  rows,
}: {
  title: string;
  rows: {
    key: number | string;
    label: string;
    value: string;
    href?: string;
    score?: number | null;
    scoreLabel?: string | null;
  }[];
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Veri yok.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, idx) => (
            <li key={r.key} className="flex items-center justify-between text-sm gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-slate-400 w-5 shrink-0">{idx + 1}.</span>
                {r.href ? (
                  <Link href={r.href} className="text-slate-800 hover:underline truncate">
                    {r.label}
                  </Link>
                ) : (
                  <span className="text-slate-700 truncate">{r.label}</span>
                )}
                {r.score != null && <ScoreBadge score={r.score} label={r.scoreLabel ?? null} />}
              </span>
              <span className="font-medium text-slate-900 shrink-0">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
