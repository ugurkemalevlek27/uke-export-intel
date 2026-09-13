import { guardPage } from "@/lib/pageGuard";
import { requireOrganizationId } from "@/lib/tenant";
import { boundedBody, communicationEventSchema } from "@/lib/integrations/communication-contract";
import { acceptCommunication } from "@/lib/integrations/communications";
import { z } from "zod";

export async function POST(request: Request) {
  const guard = await guardPage("editCrm");
  if (!guard.allowed) return Response.json({ error: "forbidden" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const organizationId = await requireOrganizationId();
  try {
    const raw = await boundedBody(request);
    const parsed = z.object({ account_id: z.number().int().positive(), event: communicationEventSchema }).strict().safeParse(JSON.parse(raw.toString("utf8")));
    if (!parsed.success || parsed.data.event.direction !== "outgoing" || parsed.data.event.status || parsed.data.event.provider_message_id) return Response.json({ error: "invalid_outgoing_message" }, { status: 400 });
    const result = await acceptCommunication(parsed.data.account_id, parsed.data.event, organizationId);
    return Response.json(result, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "processing_failed";
    if (code === "account_not_found") return Response.json({ error: code }, { status: 404 });
    if (code === "event_conflict") return Response.json({ error: code }, { status: 409 });
    return Response.json({ error: "invalid_or_unavailable" }, { status: 400 });
  }
}
