import { Pool } from "pg";

// Provision only the user-selected ACC project. Never enable sending or grant user access here.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const projects = await client.query("SELECT id,organization_id,client_key FROM projects WHERE name=$1 FOR UPDATE", ["ACC PLASTİK ABD"]);
    if (projects.rows.length !== 1 || !projects.rows[0].client_key) throw new Error("ACC project must resolve uniquely");
    const p = projects.rows[0];
    const phoneId = "1399636089890657"; // Meta test Phone Number ID supplied by the user; not a secret.
    await client.query(`INSERT INTO communication_accounts
      (organization_id,project_id,client_id,channel,provider,address,credential_prefix,enabled)
      VALUES($1,$2,$3,'whatsapp','meta',$4,'ACC_WA',false) ON CONFLICT DO NOTHING`,
    [p.organization_id, p.id, p.client_key, phoneId]);
    const result = await client.query("SELECT id,organization_id,project_id,client_id,address,channel,provider,enabled FROM communication_accounts WHERE credential_prefix='ACC_WA'");
    const a = result.rows[0];
    if (!a || a.organization_id !== p.organization_id || a.project_id !== p.id || a.client_id !== p.client_key || a.address !== phoneId || a.channel !== "whatsapp" || a.provider !== "meta") throw new Error("Existing account scope conflict; unchanged");
    await client.query("COMMIT");
    console.log(JSON.stringify({ accountId: a.id, projectId: p.id, enabled: a.enabled, webhookPath: `/api/integrations/whatsapp/${a.id}/webhook` }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
main().catch(() => { console.error("ACC setup failed; transaction rolled back. Check project/account scope."); process.exitCode = 1; }).finally(() => pool.end());
