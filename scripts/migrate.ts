// Phase 1 migration runner.
//
// Kullanim:
//   npx tsx --env-file=.env scripts/migrate.ts
//
// src/db/migrations/*.sql dosyalarini SIRAYLA calistirir ve hangilerinin
// uygulandigini _migrations tablosunda tutar. Tum migration'lar idempotent
// (IF NOT EXISTS) yazildigi icin tekrar calistirmak zararsizdir.

import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_migrations" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL UNIQUE,
        "applied_at" timestamp DEFAULT now() NOT NULL
      )
    `);

    const dir = join(process.cwd(), "src", "db", "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

    const { rows: appliedRows } = await client.query<{ name: string }>(
      `SELECT name FROM "_migrations"`
    );
    const applied = new Set(appliedRows.map((r) => r.name));

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  - ${file} (zaten uygulanmis, atlandi)`);
        continue;
      }
      const sql = await readFile(join(dir, file), "utf-8");
      console.log(`  > ${file} calistiriliyor...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO "_migrations" (name) VALUES ($1)`, [file]);
        await client.query("COMMIT");
        console.log(`    tamam.`);
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log(ran === 0 ? "Uygulanacak yeni migration yok." : `${ran} migration uygulandi.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("MIGRATION HATASI:", err);
  process.exit(1);
});
