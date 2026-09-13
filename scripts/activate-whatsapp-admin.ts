import { Pool } from "pg";

// User-authorized personal test number and existing primary administrator.
// This grants application access only; it does not transmit any WhatsApp message.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const users = await client.query("SELECT id FROM users WHERE role='super_admin' AND name=$1 FOR UPDATE", ["Uğur Kemal Evlek"]);
    if (users.rows.length !== 1) throw new Error("Administrator identity is ambiguous");
    const accounts = await client.query("SELECT id FROM communication_accounts WHERE credential_prefix='ACC_WA' AND address=$1 AND channel='whatsapp' AND provider='meta' FOR UPDATE", ["1399636089890657"]);
    if (accounts.rows.length !== 1) throw new Error("Test account is ambiguous");
    const accountId = accounts.rows[0].id;
    const userId = users.rows[0].id;
    const phone = "905431243627";
    const existing = await client.query("SELECT user_id FROM communication_permissions WHERE account_id=$1 AND address=$2 FOR UPDATE", [accountId, phone]);
    if (existing.rows[0]?.user_id && existing.rows[0].user_id !== userId) throw new Error("Phone is linked to another user");
    await client.query(`INSERT INTO communication_permissions(account_id,address,allowed,ai_allowed,user_id)
      VALUES($1,$2,true,true,$3) ON CONFLICT(account_id,address)
      DO UPDATE SET allowed=true,ai_allowed=true,user_id=EXCLUDED.user_id`, [accountId, phone, userId]);
    await client.query("UPDATE communication_accounts SET enabled=true WHERE id=$1", [accountId]);
    await client.query("COMMIT");
    console.log(JSON.stringify({accountId,userId,applicationAccess:"enabled",liveDelivery:"not_configured"}));
  } catch {
    await client.query("ROLLBACK");
    console.error("Activation failed; no changes committed. Check administrator and account identity.");
    process.exitCode=1;
  } finally {client.release();}
}
main().finally(()=>pool.end());
