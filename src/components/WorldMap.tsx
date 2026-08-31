"use client";

import { useRouter } from "next/navigation";
import WorldMap, { type ISOCode } from "react-svg-worldmap";
import { formatUsd } from "./ui";

export interface WorldMapPoint {
  code: string;
  value: number;
  rawCountry: string;
}

export function ExportWorldMap({ points }: { points: WorldMapPoint[] }) {
  const router = useRouter();

  if (points.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-12 text-center">
        Haritada gösterilecek veri yok. Veri İçe Aktar sayfasından başlayın.
      </p>
    );
  }

  const rawByCode = new Map(points.map((p) => [p.code, p.rawCountry]));

  return (
    <div className="flex justify-center">
      <WorldMap
        color="#1e293b"
        backgroundColor="transparent"
        size="responsive"
        data={points.map((p) => ({ country: p.code as ISOCode, value: p.value }))}
        valuePrefix="$"
        richInteraction
        tooltipTextFunction={(ctx) =>
          `${ctx.countryName}: ${ctx.countryValue != null ? formatUsd(Number(ctx.countryValue)) : "Veri yok"}`
        }
        onClickFunction={(ctx) => {
          const raw = rawByCode.get(ctx.countryCode.toLowerCase());
          if (raw) {
            router.push(`/analiz?tab=ulke&country=${encodeURIComponent(raw)}`);
          }
        }}
        styleFunction={(ctx) => ({
          cursor: rawByCode.has(ctx.countryCode.toLowerCase()) ? "pointer" : "default",
          fillOpacity: ctx.countryValue != null ? 0.85 : 0.25,
        })}
      />
    </div>
  );
}
