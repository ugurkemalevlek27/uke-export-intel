/**
 * Cok kiracili yapiya gecis — kiraci (sirket) kurulumu.
 *
 * NE YAPAR?
 *   Bugun her sey TEK organizasyonda ("UKE Global", id=1) duruyor: Dekoral'in
 *   boya verisi ile ACC'nin ambalaj projesi ayni kapsami paylasiyor. Bu betik
 *   her sirketi AYRI bir organizasyona (tenant) tasir:
 *
 *     organizations/1  UKE Global          -> platform sahibi (super_admin burada)
 *     organizations/N  Dekoral Boya ...    -> proje 1 ve 2 + tum ticaret verisi
 *     organizations/M  ACC Packaging       -> proje 3 (ABD ambalaj, veri bekliyor)
 *
 * NE YAPMAZ?
 *   Hicbir kayit SILMEZ. Yalnizca organization_id alanlarini gunceller.
 *   Tekrar tekrar calistirilabilir (idempotent): zaten tasinmis veriyi atlar.
 *
 * CALISTIRMA:  npx tsx --env-file=.env scripts/setup-tenants.ts
 *              (once ne yapacagini gormek icin:  ... --dry-run)
 */

import { db } from "../src/db";
import { organizations, projects, tradeRecords, companies, importBatches, users } from "../src/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

const DRY = process.argv.includes("--dry-run");

const DEKORAL = "Dekoral Boya Kimya A.Ş. (Coral Paints)";
const ACC = "ACC Packaging";
const PLATFORM = "UKE Global";

/** Hangi projenin hangi sirkete ait oldugu — isimden degil, BURADAN belirlenir. */
const DEKORAL_PROJECT_IDS = [1, 2];
const ACC_PROJECT_IDS = [3];

/** Platform yoneticisi: tum kiracilari gorebilen tek hesap. */
const PLATFORM_ADMIN_EMAIL = "info@ukeglobal.com";
/** Kendi sirketinin disini goremeyecek kullanicilar. */
const TENANT_USERS: { email: string; org: string }[] = [
  { email: "murat.bayram@dekoralboya.com.tr", org: DEKORAL },
];

async function ensureOrg(name: string): Promise<number> {
  const [found] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, name)).limit(1);
  if (found) {
    console.log(`  = organizasyon zaten var: ${name} (id=${found.id})`);
    return found.id;
  }
  if (DRY) {
    console.log(`  + OLUSTURULACAK organizasyon: ${name}`);
    return -1;
  }
  const [created] = await db.insert(organizations).values({ name }).returning({ id: organizations.id });
  console.log(`  + organizasyon olusturuldu: ${name} (id=${created.id})`);
  return created.id;
}

async function moveProjects(projectIds: number[], orgId: number, label: string) {
  if (projectIds.length === 0) return;

  const rows = await db
    .select({ id: projects.id, name: projects.name, organizationId: projects.organizationId })
    .from(projects)
    .where(inArray(projects.id, projectIds));

  for (const p of rows) {
    if (p.organizationId === orgId) {
      console.log(`  = proje ${p.id} "${p.name}" zaten ${label} kapsaminda`);
      continue;
    }
    const [{ tr }] = await db
      .select({ tr: sql<string>`COUNT(*)` })
      .from(tradeRecords)
      .where(eq(tradeRecords.projectId, p.id));

    console.log(`  -> proje ${p.id} "${p.name}" => ${label} (${Number(tr).toLocaleString("tr-TR")} ticaret kaydi)`);
    if (DRY) continue;

    await db.update(projects).set({ organizationId: orgId }).where(eq(projects.id, p.id));
    await db.update(tradeRecords).set({ organizationId: orgId }).where(eq(tradeRecords.projectId, p.id));
    await db.update(importBatches).set({ organizationId: orgId }).where(eq(importBatches.projectId, p.id));
  }
}

/**
 * Firmalar projeye degil ORGANIZASYONA baglidir. Bir firmanin kapsami,
 * ticaret kayitlarinin hangi kiraciya gittigine bakilarak belirlenir.
 * Birden fazla kiraciya kayit dusen firma olursa ISLENMEZ ve raporlanir —
 * bu durumda firma elle bolunmelidir (otomatik tahmin yapilmaz).
 */
async function moveCompanies() {
  const rows = await db.execute(sql`
    SELECT c.id, c.name, c.organization_id AS current_org,
           ARRAY_AGG(DISTINCT t.organization_id) AS target_orgs
    FROM ${companies} c
    JOIN ${tradeRecords} t ON t.company_id = c.id
    GROUP BY c.id, c.name, c.organization_id
  `);

  let moved = 0, already = 0;
  const conflicts: string[] = [];

  for (const r of rows.rows as { id: number; name: string; current_org: number; target_orgs: number[] }[]) {
    if (r.target_orgs.length > 1) {
      conflicts.push(`${r.name} (id=${r.id}) -> ${r.target_orgs.join(", ")}`);
      continue;
    }
    const target = r.target_orgs[0];
    if (r.current_org === target) { already++; continue; }
    if (!DRY) {
      await db.update(companies).set({ organizationId: target }).where(eq(companies.id, r.id));
    }
    moved++;
  }

  console.log(`  firma: ${moved} tasindi, ${already} zaten dogru kapsamda`);
  if (conflicts.length) {
    console.log(`  ! ${conflicts.length} firma BIRDEN FAZLA kiraciya kayit tasiyor - elle bolunmeli:`);
    conflicts.slice(0, 10).forEach((c) => console.log(`      ${c}`));
  }
}

async function main() {
  console.log(DRY ? "=== KURU CALISTIRMA (hicbir sey yazilmaz) ===\n" : "=== KIRACI KURULUMU ===\n");

  console.log("1) Organizasyonlar");
  const [platform] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, PLATFORM)).limit(1);
  if (!platform) throw new Error(`Platform organizasyonu bulunamadi: ${PLATFORM}`);
  console.log(`  = platform: ${PLATFORM} (id=${platform.id})`);
  const dekoralId = await ensureOrg(DEKORAL);
  const accId = await ensureOrg(ACC);

  if (DRY && (dekoralId === -1 || accId === -1)) {
    console.log("\n(kuru calistirma: organizasyonlar olusmadigi icin tasima adimlari atlandi)");
    return;
  }

  console.log("\n2) Projeler ve ticaret verisi");
  await moveProjects(DEKORAL_PROJECT_IDS, dekoralId, DEKORAL);
  await moveProjects(ACC_PROJECT_IDS, accId, ACC);

  console.log("\n3) Firmalar");
  await moveCompanies();

  console.log("\n4) Kullanicilar");
  if (!DRY) {
    await db.update(users).set({ role: "super_admin" }).where(eq(users.email, PLATFORM_ADMIN_EMAIL));
  }
  console.log(`  ${PLATFORM_ADMIN_EMAIL} -> super_admin (tum kiracilari gorebilir)`);

  for (const tu of TENANT_USERS) {
    const orgId = tu.org === DEKORAL ? dekoralId : accId;
    if (!DRY) {
      await db.update(users).set({ organizationId: orgId }).where(eq(users.email, tu.email));
    }
    console.log(`  ${tu.email} -> ${tu.org} (yalnizca kendi sirketini gorur)`);
  }

  console.log("\n5) Sonuc");
  const summary = await db.execute(sql`
    SELECT o.id, o.name,
           (SELECT COUNT(*) FROM ${projects} p WHERE p.organization_id = o.id) AS projeler,
           (SELECT COUNT(*) FROM ${tradeRecords} t WHERE t.organization_id = o.id) AS kayitlar,
           (SELECT COUNT(*) FROM ${companies} c WHERE c.organization_id = o.id) AS firmalar,
           (SELECT COUNT(*) FROM ${users} u WHERE u.organization_id = o.id) AS kullanicilar
    FROM ${organizations} o ORDER BY o.id
  `);
  console.table(summary.rows);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("HATA:", e); process.exit(1); });
