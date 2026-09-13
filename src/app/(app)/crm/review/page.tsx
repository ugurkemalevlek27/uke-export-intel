import { db } from "@/db";
import { sql } from "drizzle-orm";
import { guardPage } from "@/lib/pageGuard";
import { requireOrganizationId } from "@/lib/tenant";
import { getActiveProjectId } from "@/lib/projectContext";
import { AccessDenied } from "@/components/AccessDenied";
import { PageHeader, EmptyState } from "@/components/ui";
import Link from "next/link";
import { resolveCommunicationReview } from "../messages/actions";

export default async function ReviewPage() {
  const guard = await guardPage("editCrm");
  if (!guard.allowed) return <AccessDenied title="İnceleme Bekliyor" role={guard.role} needed="CRM" />;
  const organizationId = await requireOrganizationId();
  const projectId = await getActiveProjectId(organizationId);
  const result = await db.execute(sql`
    SELECT q.id, q.reason, e.event_type, e.external_event_id, e.created_at
    FROM integration_review_queue q JOIN integration_events e ON e.id = q.integration_event_id
    WHERE q.organization_id = ${organizationId} AND e.organization_id = ${organizationId}
      AND q.status = 'pending'
      AND (${projectId === undefined} OR e.project_id = ${projectId ?? null})
    ORDER BY q.created_at DESC LIMIT 200
  `);
  const messages = await db.execute(sql`SELECT id,review_reason,address FROM communication_messages WHERE organization_id=${organizationId} AND status='review' AND (${projectId === undefined} OR project_id=${projectId ?? null}) ORDER BY id DESC LIMIT 200`);
  return <div className="p-8 max-w-5xl">
    <PageHeader title="İnceleme Bekliyor" description="CRM'e aktarılmadan önce kontrol gerektiren son 200 entegrasyon olayı." />
    {messages.rows.map(row => <article key={String(row.id)} className="bg-white border rounded p-4 mb-3"><Link href="/crm/messages">E-posta / WhatsApp: {String(row.address)}</Link><p>{String(row.review_reason)}</p><form action={resolveCommunicationReview} className="mt-2"><input type="hidden" name="message" value={String(row.id)} /><button className="text-xs underline">Çözüldü işaretle</button></form></article>)}
    {result.rows.length === 0 ? <EmptyState text="İnceleme bekleyen olay yok." /> :
      <div className="space-y-3">{result.rows.map(row => <article key={String(row.id)} className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium">{String(row.event_type)}</h2>
        <p className="text-sm text-slate-600">{String(row.reason)}</p>
        <p className="text-xs text-slate-400 mt-2">{String(row.external_event_id)}</p>
      </article>)}</div>}
  </div>;
}
