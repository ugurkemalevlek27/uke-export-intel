-- =============================================================================
-- Phase 1 migration: client workspace alanlari + performans indexleri
-- =============================================================================
-- GUVENLIK NOTU:
--   Bu migration TAMAMEN ADDITIVE'dir. Hicbir sutun/tablo/veri SILINMEZ,
--   hicbir sutun tipi DEGISTIRILMEZ. Tum ifadeler IF NOT EXISTS ile yazildi,
--   yani birden fazla kez calistirilabilir (idempotent).
--
--   V1 semasi drizzle-kit push ile olusturuldugu icin migration gecmisi yoktu;
--   bu dosya migration gecmisinin ilk adimidir ve CANLI veritabanina karsi
--   guvenle calistirilabilir.
-- =============================================================================

-- --- 1) project_status enum tipi -------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    CREATE TYPE "project_status" AS ENUM ('active', 'paused', 'completed', 'archived');
  END IF;
END
$$;

-- --- 2) projects: client workspace alanlari ---------------------------------
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_name"   text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "product_group" varchar(150);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "currency"      varchar(10) DEFAULT 'USD';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "date_from"     date;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "date_to"       date;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status"        "project_status" DEFAULT 'active' NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by"    integer;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "updated_at"    timestamp DEFAULT now() NOT NULL;

-- created_by -> users(id) foreign key (yoksa ekle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id");
  END IF;
END
$$;

-- --- 3) trade_records: composite indexler -----------------------------------
-- Tum analiz sorgulari organization_id (+ project_id) ile scope edildigi icin
-- bu ikili neredeyse her WHERE'in basinda yer aliyor.
CREATE INDEX IF NOT EXISTS "trade_org_project_idx"
  ON "trade_records" ("organization_id", "project_id");
CREATE INDEX IF NOT EXISTS "trade_org_project_date_idx"
  ON "trade_records" ("organization_id", "project_id", "transaction_date");
CREATE INDEX IF NOT EXISTS "trade_org_importer_country_idx"
  ON "trade_records" ("organization_id", "importer_country");
CREATE INDEX IF NOT EXISTS "trade_org_exporter_country_idx"
  ON "trade_records" ("organization_id", "exporter_country");
CREATE INDEX IF NOT EXISTS "trade_org_hs4_idx"
  ON "trade_records" ("organization_id", "hs_code_4");
CREATE INDEX IF NOT EXISTS "trade_org_hs6_idx"
  ON "trade_records" ("organization_id", "hs_code_6");
-- Tedarikci / rakip analizi exporter_name_raw uzerinde GROUP BY yapiyor;
-- V1'de bu sutunda hic index yoktu.
CREATE INDEX IF NOT EXISTS "trade_exporter_name_idx"
  ON "trade_records" ("exporter_name_raw");
CREATE INDEX IF NOT EXISTS "trade_company_project_idx"
  ON "trade_records" ("company_id", "project_id");
CREATE INDEX IF NOT EXISTS "trade_batch_idx"
  ON "trade_records" ("import_batch_id");

-- --- 4) companies -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS "companies_org_country_idx"
  ON "companies" ("organization_id", "country");
CREATE INDEX IF NOT EXISTS "companies_possible_duplicate_idx"
  ON "companies" ("possible_duplicate_of_id");

-- --- 5) company_projects ----------------------------------------------------
CREATE INDEX IF NOT EXISTS "company_projects_project_score_idx"
  ON "company_projects" ("project_id", "lead_score");
CREATE INDEX IF NOT EXISTS "company_projects_project_status_idx"
  ON "company_projects" ("project_id", "lead_status");

-- --- 6) projects ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "projects_org_idx"
  ON "projects" ("organization_id");
CREATE INDEX IF NOT EXISTS "projects_org_status_idx"
  ON "projects" ("organization_id", "status");
