-- Additive n8n webhook foundation. Existing CRM data is not rewritten or deleted.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_key" varchar(100);
UPDATE "projects" SET "client_key" = 'project-' || "id" WHERE "client_key" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "projects_org_client_key_unique" ON "projects" ("organization_id", "client_key");

ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "external_event_id" varchar(255);

CREATE TABLE IF NOT EXISTS "integration_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "client_id" varchar(100) NOT NULL,
  "project_id" integer NOT NULL,
  "lead_id" integer NOT NULL,
  "contact_id" integer NOT NULL,
  "external_event_id" varchar(255) NOT NULL,
  "nonce" varchar(255) NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(30) NOT NULL DEFAULT 'received',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "activity_id" integer REFERENCES "activities"("id"),
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "integration_events_org_external_unique" UNIQUE ("organization_id", "external_event_id"),
  CONSTRAINT "integration_events_org_nonce_unique" UNIQUE ("organization_id", "nonce")
);
CREATE INDEX IF NOT EXISTS "integration_events_status_idx" ON "integration_events" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "integration_review_queue" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "integration_event_id" bigint NOT NULL UNIQUE REFERENCES "integration_events"("id"),
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "reason" text NOT NULL,
  "status" varchar(30) NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "integration_review_pending_idx" ON "integration_review_queue" ("organization_id", "status", "created_at");
