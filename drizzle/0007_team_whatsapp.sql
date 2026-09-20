-- ─────────────────────────────────────────────────────────────────────────────
-- 0007_team_whatsapp.sql — Prompt 17: equipo comercial, asignaciones y WhatsApp
-- Aditiva: no elimina tablas, columnas ni valores de enum existentes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── New enums ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE wa_message_status AS ENUM (
    'link_prepared', 'marked_shared',
    'provider_accepted', 'sent', 'delivered', 'read',
    'contacted', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE wa_confirmation_method AS ENUM ('manual', 'provider');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Extend lead_activity_type ────────────────────────────────────────────────

ALTER TYPE lead_activity_type ADD VALUE IF NOT EXISTS 'assignment_changed';
ALTER TYPE lead_activity_type ADD VALUE IF NOT EXISTS 'wa_link_prepared';
ALTER TYPE lead_activity_type ADD VALUE IF NOT EXISTS 'wa_marked_shared';
ALTER TYPE lead_activity_type ADD VALUE IF NOT EXISTS 'wa_contacted';
ALTER TYPE lead_activity_type ADD VALUE IF NOT EXISTS 'wa_provider_update';
ALTER TYPE lead_activity_type ADD VALUE IF NOT EXISTS 'wa_correction';

-- ─── Extend sales_reps ────────────────────────────────────────────────────────

ALTER TABLE sales_reps
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS sales_reps_client_id_idx ON sales_reps(client_id);

-- ─── Extend lead_assignments ─────────────────────────────────────────────────

ALTER TABLE lead_assignments
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS note   text;

-- ─── Extend leads ─────────────────────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS first_contacted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_contacted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_up_at   timestamptz;

-- ─── wa_client_config ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wa_client_config (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id            uuid        NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  confirmation_mode    wa_confirmation_method NOT NULL DEFAULT 'manual',
  provider_name        text,
  provider_config_enc  text,
  provider_key_version integer     NOT NULL DEFAULT 1,
  webhook_secret_hash  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_client_config_org_id_idx ON wa_client_config(org_id);

-- ─── message_templates ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_templates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id         uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id       uuid        REFERENCES campaigns(id) ON DELETE SET NULL,
  name              text        NOT NULL,
  content           text        NOT NULL,
  allowed_variables text[]      NOT NULL DEFAULT '{}',
  is_default        boolean     NOT NULL DEFAULT false,
  active            boolean     NOT NULL DEFAULT true,
  created_by_id     text        REFERENCES "user"(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_templates_org_id_idx    ON message_templates(org_id);
CREATE INDEX IF NOT EXISTS message_templates_client_id_idx ON message_templates(client_id);

-- ─── wa_messages ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wa_messages (
  id                    uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid                  NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id               uuid                  NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assignment_id         uuid                  REFERENCES lead_assignments(id) ON DELETE SET NULL,
  template_id           uuid                  REFERENCES message_templates(id) ON DELETE SET NULL,
  sent_by_id            text                  REFERENCES "user"(id) ON DELETE SET NULL,
  sales_rep_id          uuid                  REFERENCES sales_reps(id) ON DELETE SET NULL,
  confirmation_mode     wa_confirmation_method NOT NULL,
  status                wa_message_status     NOT NULL DEFAULT 'link_prepared',
  external_message_id   text,
  provider_name         text,
  provider_status_raw   text,
  confirmed_by_id       text                  REFERENCES "user"(id) ON DELETE SET NULL,
  confirmed_at          timestamptz,
  corrected_at          timestamptz,
  corrected_by_id       text                  REFERENCES "user"(id) ON DELETE SET NULL,
  correction_reason     text,
  note                  text,
  link_opened_at        timestamptz,
  provider_accepted_at  timestamptz,
  provider_sent_at      timestamptz,
  provider_delivered_at timestamptz,
  provider_read_at      timestamptz,
  failed_at             timestamptz,
  failure_reason        text,
  created_at            timestamptz           NOT NULL DEFAULT now(),
  updated_at            timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_messages_lead_id_idx    ON wa_messages(lead_id);
CREATE INDEX IF NOT EXISTS wa_messages_org_id_idx     ON wa_messages(org_id);
CREATE INDEX IF NOT EXISTS wa_messages_status_idx     ON wa_messages(status);
CREATE INDEX IF NOT EXISTS wa_messages_external_id_idx ON wa_messages(external_message_id);

-- ─── wa_provider_events ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wa_provider_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id           uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  wa_message_id       uuid        REFERENCES wa_messages(id) ON DELETE SET NULL,
  external_message_id text        NOT NULL,
  provider_name       text        NOT NULL,
  event_type          text        NOT NULL,
  status_raw          text        NOT NULL,
  -- SHA-256(providerName + ':' + externalMessageId + ':' + eventType) — dedup
  dedupe_key          text        NOT NULL UNIQUE,
  processed_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_provider_events_org_id_idx      ON wa_provider_events(org_id);
CREATE INDEX IF NOT EXISTS wa_provider_events_external_id_idx ON wa_provider_events(external_message_id);
