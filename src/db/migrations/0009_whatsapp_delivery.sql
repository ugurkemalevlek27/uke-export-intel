-- Durable delivery state. Never automatically resend an uncertain HTTP outcome.
ALTER TABLE whatsapp_assistant_results ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE whatsapp_assistant_results ADD COLUMN IF NOT EXISTS delivery_attempted_at timestamptz;
ALTER TABLE whatsapp_assistant_results ADD COLUMN IF NOT EXISTS delivery_retry_at timestamptz;
ALTER TABLE whatsapp_assistant_results ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE whatsapp_assistant_results ADD COLUMN IF NOT EXISTS delivery_error text;
