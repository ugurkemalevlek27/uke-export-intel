// PDF rapor uretimi (tek tikla indirilebilir raporlar)
//
// NEDEN pdfkit: saf JavaScript, ikili (binary) bagimliligi yok - Vercel'in
// sunucusuz ortaminda sorunsuz calisir. Headless tarayici tabanli cozumler
// (puppeteer vb.) boyut ve soguk baslatma sorunlari cikarir.
//
// TURKCE KARAKTERLER: pdfkit'in yerlesik fontlari (Helvetica) WinAnsi
// kodlamasi kullanir ve ş/ğ/İ/ı karakterlerini ICERMEZ. Bu yuzden DejaVu Sans
// fontunun Latin+Turkce alt kumesi gomulu olarak kullaniliyor (her biri ~13 KB;
// tam font 740 KB idi). Lisans: src/lib/report-assets/DejaVu-LICENSE.txt

import PDFDocument from "pdfkit";
import { join } from "path";

const ASSETS = join(process.cwd(), "src", "lib", "report-assets");
const FONT_REGULAR = join(ASSETS, "DejaVuSans.ttf");
const FONT_BOLD = join(ASSETS, "DejaVuSans-Bold.ttf");

const INK = "#0f1722";
const MUTED = "#6b7a8c";
const RULE = "#dbe3ea";
const ACCENT = "#14586e";
const BAND = "#f2f5f7";

const PAGE_MARGIN = 42;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

export interface ReportMeta {
  /** Rapor basligi, orn. "Ülke Raporu" */
  kind: string;
  /** Konu, orn. "Azerbaijan (AZ)" veya firma adi */
  subject: string;
  /** Aktif proje adi ("Tüm Projeler" olabilir) */
  projectLabel: string;
  /** Uygulanan filtrelerin okunabilir listesi */
  filterLines: string[];
}

export type Doc = InstanceType<typeof PDFDocument>;

export function createDoc(): Doc {
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true, // sayfa numaralari en sonda yazilabilsin
    info: { Producer: "UKE Global Export Intelligence" },
  });
  doc.registerFont("r", FONT_REGULAR);
  doc.registerFont("b", FONT_BOLD);
  doc.font("r");
  return doc;
}

// --- Bicimlendirme yardimcilari -------------------------------------------

export function fmtUsd(v: number): string {
  if (!isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

export function fmtNum(v: number): string {
  return Number(v || 0).toLocaleString("tr-TR");
}

export function fmtPct(v: number): string {
  return `%${(v || 0).toFixed(1)}`;
}

function trim(text: string, max: number): string {
  const t = String(text ?? "");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/**
 * Metni verilen piksel genisligine SIGACAK sekilde kirpar.
 *
 * Neden karakter sayisi degil de genislik: "İ" ile "l" ayni yer kaplamiyor.
 * Sadece karakter sayisina gore kirpinca uzun firma adlari tablo hucresinde
 * alt satira tasiyor ve satirlar birbirine giriyordu.
 */
function fitText(doc: Doc, text: string, maxWidth: number, fontSize: number): string {
  const t = String(text ?? "—");
  doc.fontSize(fontSize);
  if (doc.widthOfString(t) <= maxWidth) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(t.slice(0, mid) + "…") <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return t.slice(0, Math.max(1, lo)) + "…";
}

// --- Yapisal bilesenler ----------------------------------------------------

export function header(doc: Doc, meta: ReportMeta) {
  doc.rect(0, 0, PAGE_WIDTH, 78).fill(INK);

  doc.fillColor("#8fa3b4").font("r").fontSize(7.5)
    .text("UKE GLOBAL · EXPORT INTELLIGENCE", PAGE_MARGIN, 18, { characterSpacing: 1.2 });

  doc.fillColor("#ffffff").font("b").fontSize(17);
  doc.text(fitText(doc, meta.subject, CONTENT_WIDTH - 130, 17), PAGE_MARGIN, 31, {
    width: CONTENT_WIDTH - 120,
    lineBreak: false,
    height: 22,
  });

  doc.fillColor("#8fa3b4").font("r").fontSize(9)
    .text(meta.kind, PAGE_MARGIN, 57);

  const stamp = new Date().toLocaleDateString("tr-TR", {
    day: "2-digit", month: "long", year: "numeric",
  });
  doc.fillColor("#8fa3b4").font("r").fontSize(8)
    .text(stamp, PAGE_WIDTH - PAGE_MARGIN - 160, 57, { width: 160, align: "right" });

  doc.y = 96;
  doc.fillColor(INK);

  // Kapsam kutusu: raporun hangi veri kumesinden uretildigi
  const lines = [`Proje: ${meta.projectLabel}`, ...meta.filterLines];
  const boxH = 14 + lines.length * 11;
  doc.rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, boxH).fill(BAND);
  let ly = doc.y + 7;
  for (const line of lines) {
    doc.fillColor(MUTED).font("r").fontSize(8).text(line, PAGE_MARGIN + 10, ly, {
      width: CONTENT_WIDTH - 20,
    });
    ly += 11;
  }
  doc.y = doc.y + boxH + 16;
  doc.fillColor(INK);
}

export function sectionTitle(doc: Doc, text: string, note?: string) {
  ensureSpace(doc, 46);
  doc.font("b").fontSize(10.5).fillColor(INK).text(text, PAGE_MARGIN, doc.y);
  if (note) {
    doc.font("r").fontSize(7.5).fillColor(MUTED).text(note, PAGE_MARGIN, doc.y + 1, {
      width: CONTENT_WIDTH,
    });
  }
  doc.moveDown(0.35);
  const y = doc.y;
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).lineWidth(0.8).stroke(RULE);
  doc.y = y + 9;
  doc.fillColor(INK);
}

/** KPI kutulari - satir basina 3 adet. */
export function kpiGrid(doc: Doc, items: { label: string; value: string; sub?: string }[]) {
  const perRow = 3;
  const gap = 8;
  const boxW = (CONTENT_WIDTH - gap * (perRow - 1)) / perRow;
  const boxH = 46;

  for (let i = 0; i < items.length; i += perRow) {
    const row = items.slice(i, i + perRow);
    ensureSpace(doc, boxH + 8);
    const top = doc.y;
    row.forEach((it, j) => {
      const x = PAGE_MARGIN + j * (boxW + gap);
      doc.rect(x, top, boxW, boxH).lineWidth(0.8).strokeColor(RULE).stroke();
      doc.font("r").fontSize(6.8).fillColor(MUTED)
        .text(it.label.toLocaleUpperCase("tr-TR"), x + 9, top + 8, { width: boxW - 18, characterSpacing: 0.6 });
      doc.font("b").fontSize(13).fillColor(INK)
        .text(it.value, x + 9, top + 19, { width: boxW - 18 });
      if (it.sub) {
        doc.font("r").fontSize(6.6).fillColor(MUTED)
          .text(trim(it.sub, 34), x + 9, top + 35, { width: boxW - 18 });
      }
    });
    doc.y = top + boxH + gap;
  }
  doc.moveDown(0.4);
  doc.fillColor(INK);
}

export interface TableColumn {
  header: string;
  /** Genislik orani (toplami 1 olmak zorunda degil, normalize edilir) */
  width: number;
  align?: "left" | "right";
  /** Metin kirpma siniri */
  max?: number;
}

export function table(doc: Doc, columns: TableColumn[], rows: (string | number)[][]) {
  const totalW = columns.reduce((a, c) => a + c.width, 0);
  const widths = columns.map((c) => (c.width / totalW) * CONTENT_WIDTH);
  const rowH = 15;

  const drawHead = () => {
    ensureSpace(doc, rowH * 2);
    const y = doc.y;
    let x = PAGE_MARGIN;
    columns.forEach((c, i) => {
      doc.font("b").fontSize(7).fillColor(MUTED)
        .text(c.header.toLocaleUpperCase("tr-TR"), x + 2, y + 3, {
          width: widths[i] - 4,
          align: c.align ?? "left",
          characterSpacing: 0.4,
        });
      x += widths[i];
    });
    const ry = y + rowH - 3;
    doc.moveTo(PAGE_MARGIN, ry).lineTo(PAGE_MARGIN + CONTENT_WIDTH, ry).lineWidth(0.8).stroke(RULE);
    doc.y = ry + 4;
  };

  drawHead();

  for (const row of rows) {
    if (doc.y + rowH > doc.page.height - 58) {
      doc.addPage();
      doc.y = PAGE_MARGIN;
      drawHead();
    }
    const y = doc.y;
    let x = PAGE_MARGIN;
    row.forEach((cellRaw, i) => {
      const c = columns[i];
      doc.font("r").fontSize(8).fillColor(INK);
      const text = fitText(doc, String(cellRaw ?? "—"), widths[i] - 6, 8);
      doc.text(text, x + 2, y + 2, {
        width: widths[i] - 4,
        align: c.align ?? "left",
        lineBreak: false,
        height: 11,
      });
      x += widths[i];
    });
    doc.y = y + rowH;
    doc.moveTo(PAGE_MARGIN, doc.y - 3).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y - 3)
      .lineWidth(0.4).stroke("#eef2f5");
  }
  doc.y += 8;
  doc.fillColor(INK);
}

/** Yatay oranli cubuk listesi (dagilim gostermek icin). */
export function barList(
  doc: Doc,
  rows: { label: string; value: number; sub?: string }[],
  formatValue: (v: number) => string = fmtUsd
) {
  if (rows.length === 0) {
    doc.font("r").fontSize(8).fillColor(MUTED).text("Veri yok.", PAGE_MARGIN, doc.y);
    doc.y += 14;
    return;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  for (const r of rows) {
    ensureSpace(doc, 22);
    const y = doc.y;
    doc.font("r").fontSize(8).fillColor(INK);
    doc.text(fitText(doc, r.label, CONTENT_WIDTH - 165, 8), PAGE_MARGIN, y, {
      width: CONTENT_WIDTH - 150,
      lineBreak: false,
      height: 11,
    });
    doc.font("r").fontSize(8).fillColor(MUTED)
      .text(`${formatValue(r.value)}${r.sub ? "  ·  " + r.sub : ""}`,
        PAGE_MARGIN + CONTENT_WIDTH - 150, y, { width: 150, align: "right", lineBreak: false });
    const barY = y + 11;
    doc.rect(PAGE_MARGIN, barY, CONTENT_WIDTH, 3.2).fill("#e9eef2");
    doc.rect(PAGE_MARGIN, barY, Math.max(2, (r.value / max) * CONTENT_WIDTH), 3.2).fill(ACCENT);
    doc.y = barY + 10;
    doc.fillColor(INK);
  }
  doc.y += 4;
}

/** Donem bazli dikey cubuk grafik. */
export function trendChart(doc: Doc, points: { period: string; totalValueUsd: number }[]) {
  if (points.length === 0) {
    doc.font("r").fontSize(8).fillColor(MUTED).text("Tarihi olan kayıt yok.", PAGE_MARGIN, doc.y);
    doc.y += 14;
    return;
  }
  const h = 74;
  ensureSpace(doc, h + 26);
  const top = doc.y;
  const max = Math.max(...points.map((p) => p.totalValueUsd), 1);
  const gap = 3;
  const barW = Math.max(4, (CONTENT_WIDTH - gap * (points.length - 1)) / points.length);

  points.forEach((p, i) => {
    const bh = Math.max(1.5, (p.totalValueUsd / max) * h);
    const x = PAGE_MARGIN + i * (barW + gap);
    doc.rect(x, top + h - bh, barW, bh).fill(ACCENT);
  });

  // Eksen cizgisi
  doc.moveTo(PAGE_MARGIN, top + h).lineTo(PAGE_MARGIN + CONTENT_WIDTH, top + h)
    .lineWidth(0.6).stroke(RULE);

  // Etiketler: kalabaliksa sadece bir kismi yazilir
  const step = Math.ceil(points.length / 12);
  points.forEach((p, i) => {
    if (i % step !== 0) return;
    const x = PAGE_MARGIN + i * (barW + gap);
    doc.font("r").fontSize(5.6).fillColor(MUTED)
      .text(p.period, x - 4, top + h + 3, { width: barW + 12, align: "center", lineBreak: false });
  });

  // En yuksek deger etiketi (olcegi okunabilir kilar)
  doc.font("r").fontSize(6.2).fillColor(MUTED)
    .text(`en yüksek: ${fmtUsd(max)}`, PAGE_MARGIN, top - 9, { width: CONTENT_WIDTH, align: "right" });

  doc.y = top + h + 16;
  doc.fillColor(INK);
}

export function note(doc: Doc, text: string) {
  ensureSpace(doc, 24);
  doc.font("r").fontSize(7.4).fillColor(MUTED)
    .text(text, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.y += 8;
  doc.fillColor(INK);
}

/** Yeterli dikey yer yoksa yeni sayfaya gecer. */
export function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > doc.page.height - 58) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
  }
}

/** Tum sayfalara alt bilgi ve sayfa numarasi ekler (en son cagrilir). */
export function finalize(doc: Doc, footerText: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 34;
    doc.moveTo(PAGE_MARGIN, y - 6).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y - 6)
      .lineWidth(0.6).stroke(RULE);
    doc.font("r").fontSize(7).fillColor(MUTED)
      .text(footerText, PAGE_MARGIN, y, { width: CONTENT_WIDTH - 60, lineBreak: false });
    doc.font("r").fontSize(7).fillColor(MUTED)
      .text(`${i - range.start + 1} / ${range.count}`,
        PAGE_MARGIN + CONTENT_WIDTH - 60, y, { width: 60, align: "right", lineBreak: false });
  }
  doc.flushPages();
}

/** PDF'i Buffer olarak toplar. */
export function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
