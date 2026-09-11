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
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeRole, can } from "@/lib/roles";
import { getActiveProjectId } from "@/lib/projectContext";
import { parseTradeFilters, type RawSearchParams } from "@/lib/filters";
import {
  getTransactionsPage,
  getCountryBreakdown,
  getHsBreakdown,
  getSupplierList,
  getTopImporters,
} from "@/lib/analytics";
import { getLeads, getRecentActivities, getFollowUps, ACTIVITY_TYPE_LABELS } from "@/lib/crm";
import { LEAD_STATUS_LABELS } from "@/lib/leadStatus";

/** Tek seferde disa aktarilabilecek azami satir sayisi (bellek korumasi). */
const MAX_ROWS = 50_000;

/**
 * Hangi veri kumesi hangi yetkiyi gerektirir.
 *
 * NEDEN BURADA? Bu uc Proxy'nin disindadir ve ekrandaki buton gizlense bile
 * adres dogrudan cagrilabilir. CRM verisi (lead, aktivite, takip) satis
 * verisidir; yalnizca analiz yetkisi olan bir "Goruntuleyici" bunu indirememeli.
 */
export const DATASET_CAPABILITY: Record<string, keyof typeof can> = {
  transactions: "viewAnalytics",
  countries: "viewAnalytics",
  products: "viewAnalytics",
  suppliers: "viewAnalytics",
  importers: "viewAnalytics",
  leads: "editCrm",
  activities: "editCrm",
  "follow-ups": "editCrm",
};

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

  // Yetki kontrolu: bilinmeyen veri kumesi reddedilir (varsayilan olarak ACIK degil).
  const capability = DATASET_CAPABILITY[dataset];
  if (!capability) {
    return NextResponse.json({ error: "Geçersiz veri kümesi." }, { status: 400 });
  }
  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!can[capability](normalizeRole(dbUser?.role))) {
    return NextResponse.json({ error: "Bu veriyi dışa aktarma yetkiniz yok." }, { status: 403 });
  }

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
    // --- CRM veri kumeleri (Phase 5) ---------------------------------------
    // Not: CRM sorgulari ticaret filtreleri degil, yalnizca aktif proje
    // context'i ile calisir; organizationId her zaman oturumdan gelir.
    case "leads": {
      const rows = await getLeads(organizationId, { projectId: filters.projectId, limit: 5000 });
      return {
        fileName: "leadler",
        columns: [
          { header: "Firma", key: "companyName" },
          { header: "Ülke", key: "country" },
          { header: "Proje", key: "projectName" },
          { header: "Durum", key: "statusLabel" },
          { header: "Fırsat Skoru", key: "leadScore" },
          { header: "Skor Etiketi", key: "leadScoreLabel" },
          { header: "Satış Temsilcisi", key: "salesOwner" },
          { header: "Son Temas", key: "lastContactDate" },
          { header: "Sonraki Takip", key: "nextFollowupDate" },
        ],
        rows: rows.map((r) => ({
          ...r,
          statusLabel: LEAD_STATUS_LABELS[r.leadStatus] ?? r.leadStatus,
        })) as unknown as Record<string, unknown>[],
      };
    }
    case "activities": {
      const rows = await getRecentActivities(organizationId, filters.projectId, 5000);
      return {
        fileName: "aktiviteler",
        columns: [
          { header: "Tarih", key: "dateLabel" },
          { header: "Firma", key: "companyName" },
          { header: "Kişi", key: "contactName" },
          { header: "Tür", key: "typeLabel" },
          { header: "Sonuç", key: "result" },
          { header: "Notlar", key: "notes" },
          { header: "Sonraki Adım", key: "nextAction" },
          { header: "Sonraki Takip", key: "nextFollowupDate" },
          { header: "Kaydeden", key: "userName" },
        ],
        rows: rows.map((r) => ({
          ...r,
          dateLabel: r.activityDate ? new Date(r.activityDate).toISOString().slice(0, 10) : "",
          typeLabel: ACTIVITY_TYPE_LABELS[r.activityType ?? ""] ?? r.activityType ?? "",
        })) as unknown as Record<string, unknown>[],
      };
    }
    case "follow-ups": {
      const rows = await getFollowUps(organizationId, filters.projectId, 365);
      return {
        fileName: "takipler",
        columns: [
          { header: "Takip Tarihi", key: "nextFollowupDate" },
          { header: "Durum", key: "dueLabel" },
          { header: "Firma", key: "companyName" },
          { header: "Ülke", key: "country" },
          { header: "Lead Durumu", key: "statusLabel" },
          { header: "Fırsat Skoru", key: "leadScore" },
          { header: "Satış Temsilcisi", key: "salesOwner" },
        ],
        rows: rows.map((r) => ({
          ...r,
          statusLabel: LEAD_STATUS_LABELS[r.leadStatus] ?? r.leadStatus,
          dueLabel: r.overdue
            ? `${Math.abs(r.daysUntil)} gün gecikti`
            : r.daysUntil === 0
              ? "bugün"
              : `${r.daysUntil} gün kaldı`,
        })) as unknown as Record<string, unknown>[],
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
