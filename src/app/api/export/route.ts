// Excel / CSV disa aktarma ucu (Phase 2)
//
// !!! GUVENLIK NOTU !!!
// proxy.ts matcher'i "/api" yolunu HARIC tutuyor - yani bu uc Proxy tarafindan
// KORUNMUYOR. Bu yuzden oturum ve organizasyon kontrolu burada, elle yapiliyor.
// Ayrica veri her zaman getSession()'dan gelen organizationId ile sinirlanir;
// istemcinin gonderdigi hicbir parametre bu sinirlamayi gevsetemez.

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, type RawSearchParams } from "@/lib/filters";
import {
  getTransactionsPage,
  getCountryBreakdown,
  getHsBreakdown,
  getSupplierList,
  getTopImporters,
} from "@/lib/analytics";

/** Tek seferde disa aktarilabilecek azami satir sayisi (bellek korumasi). */
const MAX_ROWS = 50_000;

type Column = { header: string; key: string };
type Dataset = { columns: Column[]; rows: Record<string, unknown>[]; fileName: string };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }
  const organizationId = session.organizationId;

  const sp: RawSearchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = parseTradeFilters(sp);
  const activeProjectId = await getActiveProjectId(organizationId);
  const filters = { ...parsed, projectId: parsed.projectId ?? activeProjectId };

  const dataset = String(sp.dataset ?? "transactions");
  const format = String(sp.format ?? "xlsx") === "csv" ? "csv" : "xlsx";

  let data: Dataset;
  try {
    data = await buildDataset(dataset, organizationId, filters);
  } catch {
    return NextResponse.json({ error: "Geçersiz veri kümesi." }, { status: 400 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${data.fileName}-${stamp}.${format}`;

  if (format === "csv") {
    const csv = toCsv(data.columns, data.rows);
    // BOM: Excel'in UTF-8 Turkce karakterleri dogru okumasi icin gerekli.
    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  }

  const buffer = await toXlsx(data);
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

async function buildDataset(
  dataset: string,
  organizationId: number,
  filters: ReturnType<typeof parseTradeFilters>
): Promise<Dataset> {
  switch (dataset) {
    case "transactions": {
      const page = await getTransactionsPage(organizationId, filters, { page: 1, pageSize: 200 });
      // Sayfalama sinirini asmadan tum kayitlari toplar (azami MAX_ROWS).
      const rows = [...page.rows];
      const totalPages = Math.min(page.totalPages, Math.ceil(MAX_ROWS / 200));
      for (let p = 2; p <= totalPages; p++) {
        const next = await getTransactionsPage(organizationId, filters, { page: p, pageSize: 200 });
        rows.push(...next.rows);
      }
      return {
        fileName: "islemler",
        columns: [
          { header: "Tarih", key: "transactionDate" },
          { header: "İthalatçı", key: "importerName" },
          { header: "İthalatçı Ülke", key: "importerCountry" },
          { header: "Tedarikçi", key: "exporterName" },
          { header: "Menşei Ülke", key: "exporterCountry" },
          { header: "GTİP", key: "hsCode" },
          { header: "Ürün Açıklaması", key: "productDescription" },
          { header: "Miktar", key: "quantity" },
          { header: "Birim", key: "unit" },
          { header: "Ağırlık (MT)", key: "weightMt" },
          { header: "Değer (USD)", key: "valueUsd" },
          { header: "Sevkiyat", key: "shipments" },
          { header: "Kaynak Dosya", key: "sourceFile" },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      };
    }
    case "countries": {
      const rows = await getCountryBreakdown(organizationId, filters);
      return {
        fileName: "ulke-analizi",
        columns: [
          { header: "Ülke", key: "country" },
          { header: "Ticaret Değeri (USD)", key: "totalValueUsd" },
          { header: "Pazar Payı (%)", key: "marketSharePct" },
          { header: "İşlem", key: "transactionCount" },
          { header: "Sevkiyat", key: "shipmentCount" },
          { header: "İthalatçı", key: "importerCount" },
          { header: "Tedarikçi", key: "exporterCount" },
          { header: "Son İşlem", key: "lastTransactionDate" },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      };
    }
    case "products": {
      const rows = await getHsBreakdown(organizationId, filters, "full", 5000);
      return {
        fileName: "urun-analizi",
        columns: [
          { header: "GTİP", key: "code" },
          { header: "Ticaret Değeri (USD)", key: "totalValueUsd" },
          { header: "İşlem", key: "transactionCount" },
          { header: "İthalatçı", key: "importerCount" },
          { header: "Tedarikçi", key: "exporterCount" },
          { header: "Ülke", key: "countryCount" },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      };
    }
    case "suppliers": {
      const rows = await getSupplierList(organizationId, filters, 5000);
      return {
        fileName: "tedarikci-analizi",
        columns: [
          { header: "Tedarikçi", key: "name" },
          { header: "Ticaret Değeri (USD)", key: "totalValueUsd" },
          { header: "Müşteri Sayısı", key: "customerCount" },
          { header: "Ülke Sayısı", key: "countryCount" },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      };
    }
    case "importers": {
      const rows = await getTopImporters(organizationId, filters, 5000);
      return {
        fileName: "ithalatci-firmalar",
        columns: [
          { header: "Firma", key: "name" },
          { header: "Ülke", key: "country" },
          { header: "Ticaret Değeri (USD)", key: "totalValueUsd" },
          { header: "İşlem", key: "transactionCount" },
          { header: "Fırsat Skoru", key: "leadScore" },
          { header: "Skor Etiketi", key: "leadScoreLabel" },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      };
    }
    default:
      throw new Error("unknown dataset");
  }
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return String(value);
}

function toCsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = columns.map((c) => esc(c.header)).join(";");
  const body = rows.map((r) => columns.map((c) => esc(cell(r[c.key]))).join(";"));
  return [head, ...body].join("\r\n");
}

async function toXlsx(data: Dataset): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UKE Global Export Intelligence";
  wb.created = new Date();
  const ws = wb.addWorksheet("Veri");

  ws.columns = data.columns.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of data.rows) {
    const out: Record<string, unknown> = {};
    for (const c of data.columns) {
      const v = r[c.key];
      // Sayisal metinleri (numeric sutunlar string doner) gercek sayiya cevir,
      // boylece Excel'de toplama/filtreleme calisir.
      out[c.key] = typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : v ?? null;
    }
    ws.addRow(out);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
