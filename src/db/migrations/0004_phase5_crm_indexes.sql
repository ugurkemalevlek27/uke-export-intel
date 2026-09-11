-- Phase 5: CRM ve guvenlik sorgulari icin indeksler.
--
-- Tamamen ADDITIVE ve IDEMPOTENT: hicbir sutun/tablo/veri degistirilmez veya silinmez.
-- Amac, Takipler ve Aktiviteler ekranlarinin buyuyen veri setinde de hizli kalmasi.

-- Takipler ekrani: next_followup_date'e gore siralama ve ufuk filtresi.
-- NULL'lar sorgulanmadigi icin partial index kullaniliyor (daha kucuk, daha hizli).
CREATE INDEX IF NOT EXISTS "company_projects_followup_idx"
  ON "company_projects" ("next_followup_date")
  WHERE "next_followup_date" IS NOT NULL;

-- Lead pipeline: durum bazli gruplama.
CREATE INDEX IF NOT EXISTS "company_projects_status_idx"
  ON "company_projects" ("project_id", "lead_status");

-- Aktivite akisi: tarihe gore ters siralama.
CREATE INDEX IF NOT EXISTS "activities_date_idx"
  ON "activities" ("activity_date" DESC);

-- Aktivite -> kisi join'i.
CREATE INDEX IF NOT EXISTS "activities_contact_idx"
  ON "activities" ("contact_id");

-- Firma listelerinde merge edilmis (tombstone) kayitlarin haric tutulmasi.
CREATE INDEX IF NOT EXISTS "companies_active_idx"
  ON "companies" ("organization_id")
  WHERE "merged_into_id" IS NULL;

-- Giris sinirlama: identifier + zaman penceresi sorgusu.
CREATE INDEX IF NOT EXISTS "login_attempts_failed_idx"
  ON "login_attempts" ("identifier", "attempted_at")
  WHERE "success" = false;
