import { db } from "@/db";
import { sql } from "drizzle-orm";
import { guardPage } from "@/lib/pageGuard";
import { requireOrganizationId } from "@/lib/tenant";
import { getActiveProjectId } from "@/lib/projectContext";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/AccessDenied";
import { PageHeader } from "@/components/ui";
import { createAccount, prepareMessage, setPermission, suppressContact, toggleAccount, resolveCommunicationReview } from "./actions";
import { randomUUID } from "node:crypto";

const field = "border rounded p-2 text-sm w-full";
const button = "rounded bg-slate-800 text-white px-4 py-2 text-sm";
export default async function MessagesPage() {
  const guard = await guardPage("editCrm");
  if (!guard.allowed) return <AccessDenied title="Mesajlar" role={guard.role} needed="CRM" />;
  const org = await requireOrganizationId();
  const project = await getActiveProjectId(org);
  const accounts = await db.execute(sql`SELECT id,channel,address,provider,enabled FROM communication_accounts WHERE organization_id=${org} AND (${project === undefined} OR project_id=${project ?? null}) ORDER BY id`);
  const projects = await db.execute(sql`SELECT id,name FROM projects WHERE organization_id=${org} ORDER BY name`);
  const messages = await db.execute(sql`SELECT id,status,direction,address,subject,review_reason,created_at FROM communication_messages WHERE organization_id=${org} AND (${project === undefined} OR project_id=${project ?? null}) ORDER BY id DESC LIMIT 100`);
  const accessUsers = can.manageUsers(guard.role) ? await db.execute(sql`SELECT id,name,email FROM users WHERE (organization_id=${org} AND role<>'super_admin') OR id=${guard.role === 'super_admin' ? guard.session.userId : -1}`) : {rows:[]};
  const answers = await db.execute(sql`SELECT reply,action,delivery_status FROM whatsapp_assistant_results WHERE organization_id=${org} AND (${project === undefined} OR project_id=${project ?? null}) ORDER BY id DESC LIMIT 20`);
  const select = <select name="account" className={field} required>{accounts.rows.map(a => <option key={String(a.id)} value={String(a.id)}>{String(a.provider)} · {String(a.address)}{a.enabled ? "" : " (kapalı)"}</option>)}</select>;
  return <div className="p-8 max-w-6xl space-y-6">
    <PageHeader title="E-posta ve WhatsApp" description="Müşteri ve proje bazında iletişim kayıtları. Gerçek gönderim kapalı; hazırlanan mesajlar dry-run veya yapılandırma bekliyor durumunda kaydedilir." />
    {can.manageUsers(guard.role) && <details className="border rounded p-4 bg-white"><summary>İletişim hesabı ekle</summary>
      <form action={createAccount} className="grid gap-3 mt-4 sm:grid-cols-2">
        <label>Proje<select name="project" className={field}>{projects.rows.map(p => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}</select></label>
        <label>Sağlayıcı<select name="provider" className={field}><option value="gmail">Gmail OAuth</option><option value="smtp_imap">SMTP / IMAP</option><option value="microsoft_graph">Microsoft Graph</option><option value="meta">WhatsApp Cloud API</option></select></label>
        <label>E-posta veya Meta Phone Number ID<input name="address" className={field} required /></label>
        <label>Ortam değişkeni öneki (ör. DEKORAL_MAIL)<input name="prefix" className={field} pattern="[A-Z][A-Z0-9_]{2,80}" required /></label>
        <label>Saatlik sınır<input name="limit" type="number" min="1" max="1000" defaultValue="30" className={field} /></label>
        <label><input type="checkbox" name="enabled" /> Gelen olayları etkinleştir</label>
        <button className={button}>Hesabı kaydet</button>
      </form>
    </details>}
    {accounts.rows.length > 0 && <>
      <section className="bg-white border rounded p-4"><h2 className="font-semibold">Hesaplar</h2>{accounts.rows.map(a => <div key={String(a.id)} className="flex gap-3 items-center py-2"><span>{String(a.address)} · {a.enabled ? "Etkin" : "Kapalı"}</span>{can.manageUsers(guard.role) && <form action={toggleAccount}><input type="hidden" name="account" value={String(a.id)} /><button className={button}>{a.enabled ? "Kapat" : "Etkinleştir"}</button></form>}</div>)}</section>
      <details className="border rounded p-4 bg-white"><summary>Mesaj hazırla (dry-run)</summary>
        <form action={prepareMessage} className="grid gap-3 mt-4">
          <input type="hidden" name="request_id" value={randomUUID()} /><input type="hidden" name="occurred_at" value={new Date().toISOString()} />
          {select}<input name="address" placeholder="Alıcı e-posta / ülke koduyla WhatsApp numarası" required className={field} />
          <input name="lead" type="number" min="1" placeholder="Lead ID" required className={field} /><input name="contact" type="number" min="1" placeholder="Kişi ID" required className={field} />
          <input name="subject" placeholder="Konu" className={field} /><textarea name="body" placeholder="Mesaj" required className={field} />
          <button className={button}>Göndermeden kaydet</button>
        </form>
      </details>
      {can.manageUsers(guard.role) && <details className="border rounded p-4 bg-white"><summary>Yetkili WhatsApp numarası</summary>
        <form action={setPermission} className="grid gap-3 mt-4">{select}<input name="address" placeholder="Ülke koduyla numara" required className={field} />
          <label>UKE kullanıcısı<select name="user" className={field}><option value="">Sorgu erişimi yok</option>{accessUsers.rows.map(u=><option key={String(u.id)} value={String(u.id)}>{String(u.name ?? u.email)}</option>)}</select></label>
          <label><input name="allowed" type="checkbox" /> Mesajlaşma yetkisi</label><label><input name="ai_allowed" type="checkbox" /> AI sorgu yetkisi (yapılandırma bekliyor)</label><button className={button}>Yetkiyi kaydet</button>
        </form></details>}
      <details className="border rounded p-4 bg-white"><summary>İletişim kurma engeli</summary><form action={suppressContact} className="grid gap-3 mt-4">{select}<input name="address" required placeholder="Engellenecek e-posta veya numara" className={field} /><button className={button}>İletişimi engelle</button></form></details>
    </>}
    <section className="bg-white border rounded p-4"><h2 className="font-semibold mb-3">Son mesajlar</h2>
      {answers.rows.map((a,i)=><article key={i} className="border rounded p-3 mb-3"><p className="whitespace-pre-wrap">{String(a.reply)}</p><small>WhatsApp teslimi: {String(a.delivery_status)}</small></article>)}
      {!messages.rows.length && <p>Henüz iletişim kaydı yok.</p>}
      {messages.rows.map(m => <article key={String(m.id)} className="border-t py-3"><p>{String(m.address)} · {String(m.direction)} · {String(m.status)}</p><p className="text-sm">{String(m.subject ?? "")}</p>{m.review_reason ? <p className="text-sm text-amber-800">İnceleme: {String(m.review_reason)}</p> : null}{m.status === "review" ? <form action={resolveCommunicationReview} className="mt-2"><input type="hidden" name="message" value={String(m.id)} /><button className="text-xs underline">İncelemeyi çözüldü işaretle</button></form> : null}</article>)}
    </section>
  </div>;
}
