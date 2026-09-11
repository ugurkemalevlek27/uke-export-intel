// YETKI MATRISI TESTI (Phase 5)
//
// Bu test veritabani gerektirmez; rol -> yetenek eslemesini ve export
// uclarindaki veri kumesi -> yetki haritasini dogrular.
//
// NEDEN ONEMLI? Menude bir ogeyi gizlemek yetki degildir. Yetkinin tek kaynagi
// roles.ts'teki `can` fonksiyonlaridir; sayfalar ve API uclari bunlari kullanir.
// Burada bir regresyon olursa (orn. viewer'a CRM acilirsa) test kirmizi yanar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { can, normalizeRole, ROLES, type Role } from "../src/lib/roles";
import { DATASET_CAPABILITY } from "../src/app/api/export/route";

// Beklenen yetki matrisi — bilerek ELLE yazildi ki kod degisirse test yakalasin.
const EXPECTED: Record<Role, Record<keyof typeof can, boolean>> = {
  viewer: {
    viewAnalytics: true, editCrm: false, importData: false,
    manageDataQuality: false, manageProjects: false, manageUsers: false,
  },
  sales: {
    viewAnalytics: true, editCrm: true, importData: false,
    manageDataQuality: false, manageProjects: false, manageUsers: false,
  },
  analyst: {
    viewAnalytics: true, editCrm: true, importData: true,
    manageDataQuality: false, manageProjects: false, manageUsers: false,
  },
  manager: {
    viewAnalytics: true, editCrm: true, importData: true,
    manageDataQuality: true, manageProjects: true, manageUsers: false,
  },
  organization_admin: {
    viewAnalytics: true, editCrm: true, importData: true,
    manageDataQuality: true, manageProjects: true, manageUsers: true,
  },
  super_admin: {
    viewAnalytics: true, editCrm: true, importData: true,
    manageDataQuality: true, manageProjects: true, manageUsers: true,
  },
};

test("yetki matrisi beklendigi gibi", () => {
  for (const role of ROLES) {
    for (const cap of Object.keys(can) as (keyof typeof can)[]) {
      assert.equal(
        can[cap](role),
        EXPECTED[role][cap],
        `${role} rolu icin ${cap} yetkisi beklenenden farkli`
      );
    }
  }
});

test("bilinmeyen ve bos rol en dusuk yetkiye duser", () => {
  for (const raw of ["", "  ", "hacker", "ADMINISTRATOR", null, undefined]) {
    assert.equal(normalizeRole(raw as string | null), "viewer");
  }
});

test("legacy 'admin' degeri organization_admin'e eslenir", () => {
  assert.equal(normalizeRole("admin"), "organization_admin");
  assert.equal(normalizeRole("  ADMIN  "), "organization_admin");
});

test("viewer hicbir yazma yetkisine sahip degil", () => {
  const writeCaps = ["editCrm", "importData", "manageDataQuality", "manageProjects", "manageUsers"] as const;
  for (const cap of writeCaps) {
    assert.equal(can[cap]("viewer"), false, `viewer ${cap} yetkisine sahip OLMAMALI`);
  }
});

test("CRM veri kumeleri export'ta editCrm gerektirir", () => {
  for (const ds of ["leads", "activities", "follow-ups"]) {
    assert.equal(DATASET_CAPABILITY[ds], "editCrm", `${ds} editCrm ile korunmali`);
  }
});

test("bilinmeyen veri kumesi export haritasinda yok (varsayilan kapali)", () => {
  assert.equal(DATASET_CAPABILITY["bogus"], undefined);
  assert.equal(DATASET_CAPABILITY["users"], undefined);
});

test("her export veri kumesinin bir yetkisi tanimli", () => {
  for (const [ds, cap] of Object.entries(DATASET_CAPABILITY)) {
    assert.ok(cap in can, `${ds} icin tanimsiz yetenek: ${cap}`);
  }
});
