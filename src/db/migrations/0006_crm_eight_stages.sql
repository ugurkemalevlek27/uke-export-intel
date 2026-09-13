-- Preserve every existing lead status. Only add the two missing stages.
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'linkedin_eklendi';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'numune_gonderildi';
