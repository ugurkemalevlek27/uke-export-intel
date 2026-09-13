// Test yardimcisi: veriyi BARINDIRAN kiraciyi bulur.
//
// NEDEN GEREKLI? Sistem cok kiracili hale geldiginde "ilk organizasyon"
// (organizations LIMIT 1) artik veri barindirmayabilir - platform
// organizasyonu bos olabilir. Veriye dayanan testler kiraciyi ISME ya da
// ID'ye gore degil, "en cok ticaret kaydi olan kiraci" olarak secmelidir;
// boylece yeni sirketler eklendiginde testler kirilmaz.

import { db } from "../../src/db";
import { tradeRecords } from "../../src/db/schema";
import { sql } from "drizzle-orm";

/** En cok ticaret kaydi olan organizationId. Hic veri yoksa null. */
export async function organizationWithData(): Promise<number | null> {
  const rows = await db
    .select({
      organizationId: tradeRecords.organizationId,
      n: sql<string>`COUNT(*)`,
    })
    .from(tradeRecords)
    .groupBy(tradeRecords.organizationId)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(1);
  return rows[0]?.organizationId ?? null;
}
