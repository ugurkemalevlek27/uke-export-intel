-- =============================================================================
-- Phase 4 migration: sevkiyat duplicate korumasi + CRM alanlari
-- =============================================================================
-- GUVENLIK: Tamamen ADDITIVE. Hicbir sutun/tablo/veri silinmez, hicbir tip
-- degistirilmez. Tum ifadeler IF NOT EXISTS ile yazildi (idempotent).
-- =============================================================================

-- --- 1) trade_records: icerik hash'i (ayni sevkiyatin tekrar yuklenmesini tespit eder)
-- Hash, kaydi benzersiz kilan alanlardan uretilir (bkz. src/lib/rowHash.ts).
-- Nullable birakildi: mevcut kayitlar backfill script'i ile doldurulur.
ALTER TABLE "trade_records" ADD COLUMN IF NOT EXISTS "row_hash" varchar(32);

-- UNIQUE DEGIL: mevcut veride zaten duplicate olabilir; index yalnizca
-- hizli arama icin. Duplicate karari import sirasinda, raporlanarak verilir.
CREATE INDEX IF NOT EXISTS "trade_row_hash_idx"
  ON "trade_records" ("organization_id", "row_hash");

-- --- 2) import_batches: sihirbazdan gelen ek bilgiler
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "skipped_duplicate_count" integer DEFAULT 0;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "column_mapping" text;

-- --- 3) contacts: organizasyon scope'u + iletisim alanlari
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT false;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

-- Mevcut kisilerin organization_id'sini bagli olduklari firmadan doldur
UPDATE "contacts" c
   SET "organization_id" = co."organization_id"
  FROM "companies" co
 WHERE c."company_id" = co."id" AND c."organization_id" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_organization_id_fk') THEN
    ALTER TABLE "contacts"
      ADD CONSTRAINT "contacts_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "contacts_company_idx" ON "contacts" ("company_id");
CREATE INDEX IF NOT EXISTS "contacts_org_idx" ON "contacts" ("organization_id");

-- --- 4) activities: kullanici ve takip alanlari
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "created_by" integer;
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "contact_id" integer;
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "next_followup_date" date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_created_by_fk') THEN
    ALTER TABLE "activities"
      ADD CONSTRAINT "activities_created_by_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_contact_id_fk') THEN
    ALTER TABLE "activities"
      ADD CONSTRAINT "activities_contact_id_fk"
      FOREIGN KEY ("contact_id") REFERENCES "contacts"("id");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "activities_company_project_idx"
  ON "activities" ("company_project_id", "activity_date");
CREATE INDEX IF NOT EXISTS "activities_followup_idx"
  ON "activities" ("next_followup_date");

-- --- 5) login denemeleri (hiz siniri icin)
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" serial PRIMARY KEY,
  "identifier" varchar(255) NOT NULL,
  "attempted_at" timestamp DEFAULT now() NOT NULL,
  "success" boolean DEFAULT false NOT NULL
);
CREATE INDEX IF NOT EXISTS "login_attempts_idx"
  ON "login_attempts" ("identifier", "attempted_at");
