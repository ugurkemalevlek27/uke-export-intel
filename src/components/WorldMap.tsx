"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WorldMap, { type ISOCode } from "react-svg-worldmap";
import { formatUsd } from "./ui";

export interface WorldMapPoint {
  code: string;
  value: number;
  rawCountry: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const DEFAULT_ZOOM = 1.6;

export function ExportWorldMap({ points }: { points: WorldMapPoint[] }) {
  const router = useRouter();
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const draggedRef = useRef(false);

  if (points.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-12 text-center">
        Haritada gösterilecek veri yok. Veri İçe Aktar sayfasından başlayın.
      </p>
    );
  }

  const rawByCode = new Map(points.map((p) => [p.code, p.rawCountry]));

  function clampZoom(z: number) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  function zoomBy(factor: number) {
    setZoom((z) => clampZoom(z * factor));
  }

  function resetView() {
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 0, y: 0 });
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((z) => clampZoom(z * factor));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Tarayicinin varsayilan "surukleyerek metin/ogeleri sec" davranisini
    // engeller - aksi halde SVG uzerinde surukleme yaparken ekranda bir
    // secim/surukleme dikdortgeni goruntuleniyordu.
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggedRef.current = false;
    setIsDragging(true);
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) draggedRef.current = true;
    // Tam piksele yuvarlama onemli: kesirli (subpixel) transform degerleri
    // Chromium'da harita SVG'sinin kenarlarinda ince siyah bir "dikis" cizgisi
    // seklinde render hatasina yol aciyordu (scale+translate + overflow:hidden
    // kombinasyonunda taniyor bir render hatasi).
    setPan({
      x: Math.round(dragState.current.panX + dx / zoom),
      y: Math.round(dragState.current.panY + dy / zoom),
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragState.current = null;
    setIsDragging(false);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // yoksayilabilir
    }
  }

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => zoomBy(1.4)}
          className="w-7 h-7 rounded bg-white border border-slate-300 text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50"
          aria-label="Yakınlaştır"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.4)}
          className="w-7 h-7 rounded bg-white border border-slate-300 text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50"
          aria-label="Uzaklaştır"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          className="w-7 h-7 rounded bg-white border border-slate-300 text-slate-500 text-[10px] font-semibold shadow-sm hover:bg-slate-50"
          aria-label="Görünümü sıfırla"
        >
          ⟲
        </button>
      </div>

      <div
        className="overflow-hidden rounded-md bg-slate-50 select-none"
        style={{ height: 480, cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDragStart={(e) => e.preventDefault()}
      >
        <div
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.12s ease-out",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
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
              if (draggedRef.current) return; // surukleme sonrasi yanlislikla tiklamayi engelle
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
      </div>
    </div>
  );
}
