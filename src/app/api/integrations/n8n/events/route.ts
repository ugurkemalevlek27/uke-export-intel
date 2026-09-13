import { db } from "@/db";
import { eventActivityType, N8N_NONCE_HEADER, N8N_SIGNATURE_HEADER, N8N_TIMESTAMP_HEADER, n8nEventSchema, verifyN8nSignature } from "@/lib/integrations/n8n";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
const TRANSIENT_CODES = new Set(["40001", "40P01", "53300", "57P01"]);

async function retryTransient<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await operation(); } catch (error) {
      lastError = error;
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (!TRANSIENT_CODES.has(code) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  const secret = process.env.UKE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("n8n webhook rejected: UKE_WEBHOOK_SECRET is not configured");
    return Response.json({ error: "integration_not_configured" }, { status: 503 });
  }
  const timestamp = request.headers.get(N8N_TIMESTAMP_HEADER) ?? "";
  const nonce = request.headers.get(N8N_NONCE_HEADER) ?? "";
  const signature = request.headers.get(N8N_SIGNATURE_HEADER) ?? "";
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        return Response.json({ error: "payload_too_large" }, { status: 413 });
      }
      chunks.push(value);
    }
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!timestamp || !nonce || !signature || !verifyN8nSignature({ secret, timestamp, nonce, rawBody, signature })) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let decoded: unknown;
  try { decoded = JSON.parse(rawBody); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = n8nEventSchema.safeParse(decoded);
  if (!parsed.success) return Response.json({ error: "invalid_event", issues: parsed.error.issues }, { status: 400 });
  const event = parsed.data;

  try {
    const result = await retryTransient(() => db.transaction(async (tx) => {
      const inserted = await tx.execute(sql<{ id: number }>`
        INSERT INTO integration_events (organization_id, client_id, project_id, lead_id, contact_id, external_event_id, nonce, event_type, occurred_at, payload)
        VALUES (${event.organization_id}, ${event.client_id}, ${event.project_id}, ${event.lead_id}, ${event.contact_id}, ${event.external_event_id}, ${nonce}, ${event.event_type}, ${new Date(event.occurred_at)}, ${JSON.stringify(event)}::jsonb)
        ON CONFLICT DO NOTHING RETURNING id
      `);
      const receipt = inserted.rows[0];
      if (!receipt) {
        const existing = await tx.execute(sql`
          SELECT status, payload = ${JSON.stringify(event)}::jsonb AS matches
          FROM integration_events
          WHERE organization_id = ${event.organization_id} AND external_event_id = ${event.external_event_id}
        `);
        if (!existing.rows[0] || !existing.rows[0].matches) {
          return { duplicate: false, status: "conflict" } as const;
        }
        return { duplicate: true, status: String(existing.rows[0].status) };
      }

      const scope = await tx.execute(sql<{ valid: boolean }>`
        SELECT EXISTS (
          SELECT 1 FROM projects p
          JOIN company_projects cp ON cp.project_id = p.id
          JOIN companies c ON c.id = cp.company_id
          JOIN contacts ct ON ct.id = ${event.contact_id} AND ct.company_id = c.id
          WHERE p.id = ${event.project_id} AND p.organization_id = ${event.organization_id}
            AND p.client_key = ${event.client_id} AND cp.id = ${event.lead_id}
            AND c.organization_id = ${event.organization_id}
            AND c.merged_into_id IS NULL
            AND (ct.organization_id IS NULL OR ct.organization_id = ${event.organization_id})
        ) AS valid
      `);
      const activityType = eventActivityType(event.event_type);
      const reviewReason = !scope.rows[0]?.valid
        ? "organization/client/project/lead/contact ilişkisi doğrulanamadı"
        : !activityType ? `desteklenmeyen event_type: ${event.event_type}` : null;

      if (reviewReason) {
        await tx.execute(sql`UPDATE integration_events SET status = 'review', attempts = attempts + 1, last_error = ${reviewReason} WHERE id = ${receipt.id}`);
        await tx.execute(sql`INSERT INTO integration_review_queue (integration_event_id, organization_id, reason) VALUES (${receipt.id}, ${event.organization_id}, ${reviewReason}) ON CONFLICT (integration_event_id) DO NOTHING`);
        return { duplicate: false, status: "review" } as const;
      }

      const activity = await tx.execute(sql<{ id: number }>`
        INSERT INTO activities (company_project_id, contact_id, activity_type, activity_date, result, notes, external_event_id)
        VALUES (${event.lead_id}, ${event.contact_id}, ${activityType}, ${new Date(event.occurred_at)}, ${event.result ?? event.event_type}, ${event.notes ?? null}, ${event.external_event_id})
        RETURNING id
      `);
      await tx.execute(sql`UPDATE integration_events SET status = 'processed', attempts = attempts + 1, activity_id = ${activity.rows[0]?.id ?? null}, processed_at = now() WHERE id = ${receipt.id}`);
      return { duplicate: false, status: "processed" } as const;
    }));
    return Response.json(result, { status: result.status === "conflict" ? 409 : result.status === "review" ? 202 : 200 });
  } catch (error) {
    console.error("n8n webhook processing failed", { organizationId: event.organization_id, errorType: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "processing_failed" }, { status: 503 });
  }
}
