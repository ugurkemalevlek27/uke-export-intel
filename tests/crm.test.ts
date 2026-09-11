// CRM IZOLASYON VE DAVRANIS TESTI (Phase 4)
//
// Gercek veritabanina karsi calisir. Gecici bir YABANCI organizasyon kurar,
// ona kisi/aktivite/lead yazar ve:
//   1) Gercek organizasyonun CRM sorgularinin bu veriyi goremedigini,
//   2) Yabanci organizasyonun kendi verisini gordugunu,
//   3) Merge edilmis (tombstone) firmalarin lead listelerinden dustugunu,
//   4) Takip tarihi hesabinin (gecikmis / yaklasan) dogru oldugunu
// dogrular. Test sonunda olusturdugu her seyi siler.
//
// Calistirma: npx tsx --env-file=.env --test tests/crm.test.ts

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db";
import {
  organizations,
  projects,
  companies,
  companyProjects,
  contacts,
  activities,
} from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  getCompanyContacts,
  getCompanyActivities,
  getLeadPipeline,
  getLeads,
  getFollowUps,
  getRecentActivities,
} from "../src/lib/crm";

const MARKER = "__CRM_TEST__";

let orgA: number;
let orgB: number;
let projectB: number;
let companyB: number;
let companyBMerged: number;
let cpB: number;
let cpBMerged: number;
let contactB: number;

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

before(async () => {
  const [existing] = await db.select({ id: organizations.id }).from(organizations).limit(1);
  assert.ok(existing, "Testin calismasi icin en az bir organizasyon gerekli");
  orgA = existing.id;

  const [b] = await db.insert(organizations).values({ name: MARKER }).returning();
  orgB = b.id;

  const [p] = await db
    .insert(projects)
    .values({ organizationId: orgB, name: MARKER + " projesi" })
    .returning();
  projectB = p.id;

  const [c] = await db
    .insert(companies)
    .values({ organizationId: orgB, name: MARKER + " FIRMA", country: "Testland (XX)" })
    .returning();
  companyB = c.id;

  const [cm] = await db
    .insert(companies)
    .values({
      organizationId: orgB,
      name: MARKER + " BIRLESTIRILMIS",
      country: "Testland (XX)",
      mergedIntoId: c.id,
    })
    .returning();
  companyBMerged = cm.id;

  const inserted = await db
    .insert(companyProjects)
    .values([
      {
        companyId: companyB,
        projectId: projectB,
        leadStatus: "teklif_gonderildi",
        leadScore: 77,
        leadScoreLabel: "Yuksek Potansiyel",
        salesOwner: MARKER,
        nextFollowupDate: day(-3), // gecikmis
        estimatedValueUsd: "1000",
      },
      {
        companyId: companyBMerged,
        projectId: projectB,
        leadStatus: "yeni",
        leadScore: 10,
        nextFollowupDate: day(5), // yaklasan
      },
    ])
    .returning();
  cpB = inserted[0].id;
  cpBMerged = inserted[1].id;

  const [ct] = await db
    .insert(contacts)
    .values({
      organizationId: orgB,
      companyId: companyB,
      name: MARKER + " KISI",
      email: "crmtest@example.invalid",
      isPrimary: true,
    })
    .returning();
  contactB = ct.id;

  await db.insert(activities).values({
    companyProjectId: cpB,
    contactId: contactB,
    activityType: "email",
    activityDate: new Date(),
    result: MARKER + " sonuc",
  });
});

after(async () => {
  // FK sirasi onemli.
  await db.delete(activities).where(eq(activities.companyProjectId, cpB));
  await db.delete(contacts).where(eq(contacts.companyId, companyB));
  await db
    .delete(companyProjects)
    .where(inArray(companyProjects.id, [cpB, cpBMerged]));
  // Tombstone referansi once temizlenmeli, yoksa self-FK engeller.
  await db
    .update(companies)
    .set({ mergedIntoId: null })
    .where(eq(companies.id, companyBMerged));
  await db.delete(companies).where(inArray(companies.id, [companyB, companyBMerged]));
  await db.delete(projects).where(eq(projects.id, projectB));
  await db.delete(organizations).where(eq(organizations.id, orgB));
});

test("kisiler: yabanci organizasyon kisiyi goremez", async () => {
  const mine = await getCompanyContacts(orgB, companyB);
  assert.equal(mine.length, 1, "kendi organizasyonu kisiyi gormeli");

  const theirs = await getCompanyContacts(orgA, companyB);
  assert.equal(theirs.length, 0, "baska organizasyon kisiyi GOREMEMELI");
});

test("aktiviteler: companyProjectId bilinse bile organizasyon disindan okunamaz", async () => {
  const mine = await getCompanyActivities(orgB, cpB);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].contactName, MARKER + " KISI", "kisi join'i calismali");

  // IDOR senaryosu: saldirgan dogru companyProjectId'yi biliyor.
  const theirs = await getCompanyActivities(orgA, cpB);
  assert.equal(theirs.length, 0, "baska organizasyon aktiviteyi GOREMEMELI");
});

test("aktivite akisi organizasyonla sinirli", async () => {
  const mine = await getRecentActivities(orgB, projectB, 50);
  assert.equal(mine.length, 1);

  const theirs = await getRecentActivities(orgA, projectB, 50);
  assert.equal(theirs.length, 0, "yabanci projectId verilse bile bos donmeli");
});

test("pipeline yalnizca kendi organizasyonunu sayar ve merge edilmisi haric tutar", async () => {
  const pipe = await getLeadPipeline(orgB, projectB);
  const total = pipe.reduce((s, p) => s + p.count, 0);
  assert.equal(total, 1, "merge edilmis firma huniye dahil edilmemeli");
  assert.equal(pipe[0].leadStatus, "teklif_gonderildi");
  assert.equal(pipe[0].totalValueUsd, 1000);

  const foreign = await getLeadPipeline(orgA, projectB);
  assert.equal(foreign.reduce((s, p) => s + p.count, 0), 0);
});

test("lead listesi: durum filtresi ve merge tombstone", async () => {
  const all = await getLeads(orgB, { projectId: projectB });
  assert.equal(all.length, 1, "merge edilmis firma listede olmamali");
  assert.equal(all[0].companyId, companyB);

  const filtered = await getLeads(orgB, { projectId: projectB, status: "teklif_gonderildi" });
  assert.equal(filtered.length, 1);

  const none = await getLeads(orgB, { projectId: projectB, status: "kaybedildi" });
  assert.equal(none.length, 0);

  const theirs = await getLeads(orgA, { projectId: projectB });
  assert.equal(theirs.length, 0);
});

test("takipler: gecikmis kayit dogru isaretlenir", async () => {
  const rows = await getFollowUps(orgB, projectB, 30);
  assert.equal(rows.length, 1, "merge edilmis kayit takip listesinde olmamali");
  assert.equal(rows[0].overdue, true);
  assert.equal(rows[0].daysUntil, -3);

  const theirs = await getFollowUps(orgA, projectB, 30);
  assert.equal(theirs.length, 0);
});

test("takipler: ufuk (horizon) disindaki tarih listelenmez", async () => {
  await db
    .update(companyProjects)
    .set({ nextFollowupDate: day(90) })
    .where(eq(companyProjects.id, cpB));

  const rows = await getFollowUps(orgB, projectB, 30);
  assert.equal(rows.length, 0, "30 gunluk ufkun disindaki takip gosterilmemeli");

  const wide = await getFollowUps(orgB, projectB, 120);
  assert.equal(wide.length, 1);
  assert.equal(wide[0].overdue, false);

  await db
    .update(companyProjects)
    .set({ nextFollowupDate: day(-3) })
    .where(eq(companyProjects.id, cpB));
});
