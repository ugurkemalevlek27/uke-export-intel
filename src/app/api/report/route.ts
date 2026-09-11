// PDF rapor ucu — tek tikla ulke / firma raporu indirme.
//
// !!! GUVENLIK !!!
// proxy.ts matcher'i "/api" yolunu haric tutar; bu uc Proxy tarafindan
// KORUNMAZ. Oturum ve organizasyon dogrulamasi burada elle yapilir.
// Firma raporu icin firma sahipligi getCompanyIntelligence icinde ayrica
// organizationId ile dogrulanir (baska organizasyonun firmasi icin null doner).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveProjectId, getActiveProject } from "@/lib/projectContext";
import { parseTradeFilters, type RawSearchParams } from "@/lib/filters";
import { buildCountryReport, buildCompanyReport } from "@/lib/reports";

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

  const activeProject = await getActiveProject(organizationId);
  const projectLabel = activeProject
    ? activeProject.clientName
      ? `${activeProject.clientName} — ${activeProject.name}`
      : activeProject.name
    : "Tüm Projeler";

  const type = String(sp.type ?? "");

  let result: { buffer: Buffer; fileName: string } | null = null;

  if (type === "country") {
    const country = String(sp.country ?? "").trim();
    if (!country) {
      return NextResponse.json({ error: "Ülke belirtilmedi." }, { status: 400 });
    }
    result = await buildCountryReport(organizationId, country, filters, projectLabel);
  } else if (type === "company") {
    const raw = String(sp.companyId ?? "");
    if (!/^\d+$/.test(raw)) {
      return NextResponse.json({ error: "Geçersiz firma." }, { status: 400 });
    }
    result = await buildCompanyReport(organizationId, Number(raw), filters, projectLabel);
  } else {
    return NextResponse.json({ error: "Geçersiz rapor tipi." }, { status: 400 });
  }

  if (!result) {
    // Ya kayit yok ya da kayit bu organizasyona ait degil - ayrimi disari sizdirmiyoruz.
    return NextResponse.json(
      { error: "Bu seçim için rapor oluşturulacak kayıt bulunamadı." },
      { status: 404 }
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(result.buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.fileName}-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
