import test from "node:test";
import assert from "node:assert/strict";
import { CRM_STAGES, LEAD_STATUS_LABELS, statusOptions } from "../src/lib/leadStatus";
import { isLeadStatus } from "../src/db/schema";

test("eight ordered stages are valid database statuses", () => {
  assert.deepEqual(CRM_STAGES.map(s => LEAD_STATUS_LABELS[s]), [
    "İrtibata Geçilmedi", "İrtibat Kuruldu", "LinkedIn’den Eklendi",
    "Takip Maili Gönderildi", "Katalog Gönderildi", "Fiyat Teklifi Sunuldu",
    "Numune Gönderildi", "Alım Yaptı",
  ]);
  for (const stage of CRM_STAGES) assert.ok(isLeadStatus(stage));
});

test("editing historical leads preserves their selected status", () => {
  assert.deepEqual(statusOptions("yeni"), CRM_STAGES);
  assert.deepEqual(statusOptions("pazarlik"), ["pazarlik", ...CRM_STAGES]);
});
