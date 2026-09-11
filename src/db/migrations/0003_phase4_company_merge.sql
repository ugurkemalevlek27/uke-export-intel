-- =============================================================================
-- Phase 4: firma birlestirme (merge) altyapisi
-- =============================================================================
-- TASARIM: Birlestirilen firma SILINMEZ. "merged_into_id" ile hedef firmaya
-- isaret eden bir mezar tasi (tombstone) kaydi olarak kalir. Boylece:
--   - hicbir veri kaybolmaz, gecmis izlenebilir kalir
--   - yanlis birlestirme geri alinabilir
--   - listelerde gorunmez (sorgular merged_into_id IS NULL filtreler)
-- Ticaret kayitlari birlestirme sirasinda hedef firmaya TASINIR.
-- =============================================================================

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "merged_into_id" integer;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "merged_at" timestamp;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "merged_by" integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_merged_into_fk') THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_merged_into_fk"
      FOREIGN KEY ("merged_into_id") REFERENCES "companies"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_merged_by_fk') THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_merged_by_fk"
      FOREIGN KEY ("merged_by") REFERENCES "users"("id");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "companies_merged_idx" ON "companies" ("merged_into_id");
