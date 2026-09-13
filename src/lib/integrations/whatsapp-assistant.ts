import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Account, CommunicationTx } from "./communications";

// No model-produced SQL or update/delete operations are executed by this module.
export function whatsappAccess(role: string, sameOrganization: boolean) {
  const known = ["viewer", "sales", "analyst", "manager", "organization_admin", "admin", "super_admin"].includes(role);
  return { read: known && (sameOrganization || role === "super_admin"), add: role === "super_admin", update: false, delete: false };
}

export async function answerWhatsApp(tx: CommunicationTx, account: Account, address: string, question: string) {
  const permission = await tx.execute(sql`
    SELECT u.id,u.role,u.organization_id FROM communication_permissions p
    JOIN users u ON u.id=p.user_id
    WHERE p.account_id=${account.id} AND p.address=${address} AND p.allowed=true AND p.ai_allowed=true
  `);
  const user = permission.rows[0];
  if (!account.enabled || !user || !whatsappAccess(String(user.role), Number(user.organization_id) === account.organization_id).read) return null;
  const userId = Number(user.id);
  let questionText = question.trim().replace(/^\/ai\s*/i, "").trim();
  // Resolve an explicit project only after authenticating the sender's actual role.
  const selector = /^(ACC|DEKORAL)\s*[:\-]?\s+/i.exec(questionText);
  if (selector) {
    const projectName = selector[1].toUpperCase() === "ACC" ? "ACC PLASTİK ABD" : "DEKORAL AZERBEYCAN";
    const projects = await tx.execute(sql`SELECT id,organization_id,client_key FROM projects WHERE name=${projectName}`);
    const project = projects.rows.length === 1 ? projects.rows[0] : undefined;
    if (!project || (user.role !== "super_admin" && (Number(project.id) !== account.project_id || Number(project.organization_id) !== account.organization_id))) {
      return { userId, action: "denied", reply: "Bu proje için erişiminiz yok veya proje eşleşmesi belirsiz." };
    }
    account = { ...account, project_id: Number(project.id), organization_id: Number(project.organization_id), client_id: String(project.client_key) };
    questionText = questionText.slice(selector[0].length).trim();
  }
  const text = questionText.toLocaleLowerCase("tr-TR");
  if (text.startsWith("/firma-ekle")) {
    if (!whatsappAccess(String(user.role), true).add) return { userId, action: "denied", reply: "Veri ekleme yalnızca ana admin için açıktır. Siz verileri sorgulayabilirsiniz." };
    const companyInput = z.object({ name: z.string().trim().min(2).max(200), country: z.string().trim().max(100).optional() }).strict();
    let input;
    try { input = companyInput.parse(JSON.parse(questionText.slice("/firma-ekle".length).trim())); }
    catch { return { userId, action: "clarify", reply: 'Firma eklemek için: /firma-ekle {"name":"Firma adı","country":"Ülke"}' }; }
    const existing = await tx.execute(sql`SELECT id FROM companies WHERE organization_id=${account.organization_id} AND lower(trim(name))=lower(${input.name}) LIMIT 1`);
    if (existing.rows.length) return { userId, action: "clarify", reply: "Bu isimde firma mevcut. İkinci kayıt oluşturulmadı; mevcut firma değiştirilmedi." };
    const company = await tx.execute(sql`INSERT INTO companies(organization_id,name,country,source) VALUES(${account.organization_id},${input.name},${input.country ?? null},'whatsapp_admin') RETURNING id`);
    const lead = await tx.execute(sql`INSERT INTO company_projects(company_id,project_id) VALUES(${company.rows[0].id},${account.project_id}) RETURNING id`);
    await tx.execute(sql`INSERT INTO activities(company_project_id,created_by,activity_type,result) VALUES(${lead.rows[0].id},${userId},'whatsapp','Ana admin WhatsApp üzerinden firma ekledi')`);
    return { userId, action: "add_company", reply: `Firma eklendi: ${input.name}. Firma ID: ${company.rows[0].id}.` };
  }
  if (/\b(delete|update|remove)\b|sil\b|güncelle|değiştir/i.test(text)) return { userId, action: "denied", reply: "WhatsApp üzerinden mevcut verileri değiştirme ve silme kapalıdır." };
  if (["takipler", "bu haftaki takipler", "bu hafta hangi müşterileri takip etmeliyim?"].includes(text)) {
    const result = await tx.execute(sql`SELECT c.name,cp.next_followup_date FROM company_projects cp JOIN companies c ON c.id=cp.company_id WHERE cp.project_id=${account.project_id} AND c.organization_id=${account.organization_id} AND c.merged_into_id IS NULL AND cp.next_followup_date<=current_date+7 ORDER BY cp.next_followup_date,c.name LIMIT 10`);
    return { userId, action: "read_followups", reply: result.rows.length ? "Gecikmiş ve önümüzdeki 7 gün içindeki ilk 10 takip:\n"+result.rows.map(r=>`${r.name}: ${String(r.next_followup_date).slice(0,10)}`).join("\n") : "Bu projede önümüzdeki 7 güne kadar planlanmış takip yok." };
  }
  if (["en yüksek potansiyelli firmalar", "en iyi fırsatlar", "top 10"].includes(text)) {
    const result = await tx.execute(sql`SELECT c.name,cp.lead_score FROM company_projects cp JOIN companies c ON c.id=cp.company_id WHERE cp.project_id=${account.project_id} AND c.organization_id=${account.organization_id} AND c.merged_into_id IS NULL ORDER BY cp.lead_score DESC NULLS LAST,c.id LIMIT 10`);
    return { userId, action: "read_leads", reply: result.rows.length ? "Aktif proje — fırsat skoruna göre ilk 10 firma:\n"+result.rows.map(r=>`${r.name}: ${r.lead_score ?? "skor yok"}`).join("\n") : "Bu projede firma bulunamadı." };
  }
  return { userId, action: "clarify", reply: "Bu proje için ‘en yüksek potansiyelli firmalar’ veya ‘bu haftaki takipler’ sorularını sorabilirsiniz. Serbest sorular için yapay zekâ sağlayıcısı henüz bağlı değil. Veri değiştirme ve silme kapalıdır." };
}
