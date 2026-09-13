import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { answerWhatsApp } from "../src/lib/integrations/whatsapp-assistant";
import type { Account } from "../src/lib/integrations/communications";

test("configured primary admin can query ACC and Dekoral; revoked access denies both (rollback only)", async () => {
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  const database = drizzle(pool,{schema});
  const rollback = new Error("ROLLBACK_ROUTING_TEST");
  try {
    await assert.rejects(database.transaction(async tx => {
      const account = (await tx.execute(sql`SELECT * FROM communication_accounts WHERE credential_prefix='ACC_WA'`)).rows[0] as Account;
      assert.ok(account?.enabled);
      const phone = "905431243627";
      for (const name of ["ACC", "DEKORAL"]) {
        const response = await answerWhatsApp(tx,account,phone,`${name} bu haftaki takipler`);
        assert.equal(response?.action,"read_followups");
      }
      // A number loses both scopes immediately when its permission is revoked.
      await tx.execute(sql`UPDATE communication_permissions SET allowed=false WHERE account_id=${account.id} AND address=${phone}`);
      assert.equal(await answerWhatsApp(tx,account,phone,"DEKORAL top 10"),null);
      assert.equal(await answerWhatsApp(tx,account,phone,"ACC top 10"),null);
      throw rollback;
    }), error => error === rollback);
  } finally {await pool.end();}
});
