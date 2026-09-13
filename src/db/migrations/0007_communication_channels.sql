-- Additive channel infrastructure. All credentials remain outside the database.
CREATE TABLE IF NOT EXISTS communication_accounts (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id integer NOT NULL REFERENCES projects(id),
  client_id varchar(100) NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  provider text NOT NULL CHECK (provider IN ('gmail','smtp_imap','microsoft_graph','meta')),
  address text NOT NULL,
  credential_prefix text NOT NULL UNIQUE CHECK (credential_prefix ~ '^[A-Z][A-Z0-9_]{2,80}$'),
  enabled boolean NOT NULL DEFAULT false,
  hourly_limit integer NOT NULL DEFAULT 30 CHECK (hourly_limit BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, provider, address),
  CHECK ((channel='whatsapp' AND provider='meta') OR (channel='email' AND provider<>'meta'))
);
CREATE TABLE IF NOT EXISTS communication_permissions (
  account_id integer NOT NULL REFERENCES communication_accounts(id),
  address text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  ai_allowed boolean NOT NULL DEFAULT false,
  PRIMARY KEY(account_id,address)
);
CREATE TABLE IF NOT EXISTS communication_suppressions (
  organization_id integer NOT NULL REFERENCES organizations(id),
  client_id varchar(100) NOT NULL,
  channel text NOT NULL,
  address text NOT NULL,
  reason text NOT NULL CHECK(reason IN ('bounce','unsubscribe','do_not_contact')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,client_id,channel,address)
);
CREATE TABLE IF NOT EXISTS communication_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id integer NOT NULL REFERENCES communication_accounts(id),
  organization_id integer NOT NULL REFERENCES organizations(id),
  client_id varchar(100) NOT NULL,
  project_id integer NOT NULL REFERENCES projects(id),
  lead_id integer REFERENCES company_projects(id),
  contact_id integer REFERENCES contacts(id),
  external_event_id text NOT NULL,
  payload_hash text NOT NULL,
  provider_message_id text,
  thread_id text,
  direction text NOT NULL CHECK(direction IN ('incoming','outgoing','status')),
  address text NOT NULL,
  subject text,
  body text,
  status text NOT NULL,
  review_reason text,
  activity_id integer REFERENCES activities(id),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,external_event_id)
);
CREATE INDEX IF NOT EXISTS communication_threads_idx ON communication_messages(account_id,thread_id);
CREATE INDEX IF NOT EXISTS communication_provider_idx ON communication_messages(account_id,provider_message_id);
CREATE INDEX IF NOT EXISTS communication_review_idx ON communication_messages(organization_id,project_id,status);
CREATE TABLE IF NOT EXISTS communication_nonces (
  account_id integer NOT NULL REFERENCES communication_accounts(id),
  nonce text NOT NULL,
  external_event_id text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,nonce)
);
