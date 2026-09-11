// Tek seferlik: mevcut ticaret kayitlari icin icerik hash'ini doldurur.
//
// Neden gerekli: duplicate korumasi (Phase 4) hash uzerinden calisiyor.
// Bu script calistirilmadan once yuklenmis kayitlarin hash'i bos oldugu icin
// ayni dosya tekrar yuklenirse duplicate olarak taninmaz.
//
// Calistirma: npx tsx --env-file=.env scripts/backfill-row-hash.ts
//
// Guvenli: yalnizca row_hash sutununu doldurur, baska hicbir alani degistirmez.
// Birden fazla kez calistirilabilir (zaten dolu olanlari atlar).

import { db } from "../src/db";
import { tradeRecords } from "../src/db/schema";
import { isNull, eq, sql } from "drizzle-orm";
import { computeRowHash } from "../src/lib/rowHash";

const BATCH = 1000;

async function main() {
  const [{ total }] = await db
    .select({ total: sql<string>`COUNT(*)` })
    .from(tradeRecords)
    .where(isNull(tradeRecords.rowHash));

  const toDo = Number(total);
  console.log(`Hash'i eksik kayit: ${toDo}`);
  if (toDo === 0) {
    console.log("Yapilacak islem yok.");
    process.exit(0);
  }

  let done = 0;
  for (;;) {
    const rows = await db
      .select({
        id: tradeRecords.id,
        projectId: tradeRecords.projectId,
        hsCode: tradeRecords.hsCode,
        importerNameRaw: tradeRecords.importerNameRaw,
        exporterNameRaw: tradeRecords.exporterNameRaw,
        importerCountry: tradeRecords.importerCountry,
        transactionDate: tradeRecords.transactionDate,
        valueUsd: tradeRecords.valueUsd,
        quantity: tradeRecords.quantity,
      })
      .from(tradeRecords)
      .where(isNull(tradeRecords.rowHash))
      .limit(BATCH);

    if (rows.length === 0) break;

    for (const r of rows) {
      const hash = computeRowHash({
        projectId: r.projectId,
        hsCode: r.hsCode,
        importerNameRaw: r.importerNameRaw,
        exporterNameRaw: r.exporterNameRaw,
        importerCountry: r.importerCountry,
        transactionDate: r.transactionDate,
        valueUsd: r.valueUsd,
        quantity: r.quantity,
      });
      await db.update(tradeRecords).set({ rowHash: hash }).where(eq(tradeRecords.id, r.id));
    }

    done += rows.length;
    console.log(`  ${done}/${toDo} tamamlandi`);
  }

  // Mevcut veride zaten tekrar eden kayit var mi? (bilgi amacli, SILINMEZ)
  const dupes = await db.execute(sql`
    SELECT COUNT(*) AS "groups", COALESCE(SUM(c - 1), 0) AS "extra"
    FROM (
      SELECT row_hash, COUNT(*) AS c
      FROM trade_records
      WHERE row_hash IS NOT NULL
      GROUP BY organization_id, row_hash
      HAVING COUNT(*) > 1
    ) t
  `);
  const d = (dupes.rows as { groups: string; extra: string }[])[0];
  console.log(`\nMevcut veride tekrar eden kayit: ${d.extra} satir (${d.groups} grup).`);
  console.log("Bu satirlar SILINMEDI - yalnizca tespit edildi. Veri Kalitesi ekranindan incelenebilir.");
  console.log("Bundan sonraki yuklemelerde tekrar eden satirlar otomatik atlanacak.");
  process.exit(0);
}

main().catch((err) => {
  console.error("HATA:", err);
  process.exit(1);
});
