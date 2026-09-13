-- Link authorized phone numbers to real UKE users. No phone gets write access by default.
ALTER TABLE communication_permissions ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id);
CREATE TABLE IF NOT EXISTS whatsapp_assistant_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id bigint NOT NULL UNIQUE REFERENCES communication_messages(id),
  user_id integer NOT NULL REFERENCES users(id),
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id integer NOT NULL REFERENCES projects(id),
  action text NOT NULL,
  reply text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'configuration_required',
  created_at timestamptz NOT NULL DEFAULT now()
);
