-- ─── Prompt 16B: Generic qualification engine ────────────────────────────────
-- Additive migration — no columns or tables are removed.
-- All new columns are nullable or have safe defaults.

-- ─── New enums ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE qualification_profile_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qualification_rule_action AS ENUM ('add_score', 'force_result', 'disqualify');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── qualification_profiles ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qualification_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  status          qualification_profile_status NOT NULL DEFAULT 'draft',
  version         INTEGER NOT NULL DEFAULT 1,
  initial_score   INTEGER NOT NULL DEFAULT 0,
  thresholds      JSONB NOT NULL DEFAULT '{"hot":{"min":70},"warm":{"min":40,"max":69},"cold":{"max":39}}',
  result_labels   JSONB NOT NULL DEFAULT '{}',
  published_at    TIMESTAMPTZ,
  published_by    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qual_profiles_org_id_idx    ON qualification_profiles (org_id);
CREATE INDEX IF NOT EXISTS qual_profiles_client_id_idx ON qualification_profiles (client_id);
CREATE INDEX IF NOT EXISTS qual_profiles_status_idx    ON qualification_profiles (status);

-- ─── qualification_rules ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qualification_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id       UUID NOT NULL REFERENCES qualification_profiles(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  priority         INTEGER NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  conditions       JSONB NOT NULL DEFAULT '{}',
  action           qualification_rule_action NOT NULL DEFAULT 'add_score',
  score_delta      INTEGER NOT NULL DEFAULT 0,
  forced_result    TEXT,
  reason           TEXT NOT NULL DEFAULT '',
  stop_processing  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qual_rules_profile_id_idx ON qualification_rules (profile_id);
CREATE INDEX IF NOT EXISTS qual_rules_org_id_idx     ON qualification_rules (org_id);
CREATE INDEX IF NOT EXISTS qual_rules_priority_idx   ON qualification_rules (profile_id, priority);

-- ─── qualification_field_definitions ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qualification_field_definitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID REFERENCES organizations(id) ON DELETE CASCADE,
  client_id           UUID REFERENCES clients(id) ON DELETE CASCADE,
  key                 TEXT NOT NULL,
  label               TEXT NOT NULL,
  data_type           TEXT NOT NULL DEFAULT 'text',
  source              TEXT NOT NULL DEFAULT 'standard',
  category            TEXT NOT NULL DEFAULT 'other',
  is_sensitive        BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_operators   JSONB NOT NULL DEFAULT '[]',
  normalization       JSONB NOT NULL DEFAULT '[]',
  enum_options        JSONB NOT NULL DEFAULT '[]',
  is_required_for_eval BOOLEAN NOT NULL DEFAULT FALSE,
  event_config        JSONB,
  leads_column        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qual_field_defs_org_id_idx ON qualification_field_definitions (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS qual_field_defs_key_org_idx
  ON qualification_field_definitions (key, org_id) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qual_field_defs_key_system_idx
  ON qualification_field_definitions (key) WHERE org_id IS NULL;

-- ─── lead_behavior_events ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_behavior_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL,
  external_id  TEXT,
  product_id   TEXT,
  variant_id   TEXT,
  category     TEXT,
  quantity     INTEGER,
  value        NUMERIC(12, 2),
  currency     TEXT,
  cart_items   JSONB NOT NULL DEFAULT '[]',
  metadata     JSONB NOT NULL DEFAULT '{}',
  platform     TEXT,
  source       TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_behavior_events_lead_id_idx    ON lead_behavior_events (lead_id);
CREATE INDEX IF NOT EXISTS lead_behavior_events_org_id_idx     ON lead_behavior_events (org_id);
CREATE INDEX IF NOT EXISTS lead_behavior_events_event_type_idx ON lead_behavior_events (event_type);
CREATE INDEX IF NOT EXISTS lead_behavior_events_occurred_at_idx ON lead_behavior_events (occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS lead_behavior_events_dedup_idx
  ON lead_behavior_events (lead_id, external_id)
  WHERE external_id IS NOT NULL AND lead_id IS NOT NULL;

-- ─── Update leads ─────────────────────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS custom_data JSONB NOT NULL DEFAULT '{}';

-- ─── Update campaigns ─────────────────────────────────────────────────────────

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES qualification_profiles(id) ON DELETE SET NULL;

-- ─── Update lead_qualifications ───────────────────────────────────────────────
-- Add profile-engine columns; keep all existing columns untouched.

ALTER TABLE lead_qualifications
  ADD COLUMN IF NOT EXISTS profile_id        UUID REFERENCES qualification_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_version   INTEGER,
  ADD COLUMN IF NOT EXISTS score_int         INTEGER,
  ADD COLUMN IF NOT EXISTS evaluation_trigger TEXT,
  ADD COLUMN IF NOT EXISTS matched_rules     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS missing_fields    JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS eval_duration_ms  INTEGER,
  ADD COLUMN IF NOT EXISTS snapshot          JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visible_label     TEXT;

-- Fix ruleSetVersion to allow NULL (existing records have NOT NULL DEFAULT 0 applied above)
ALTER TABLE lead_qualifications
  ALTER COLUMN rule_set_version SET DEFAULT 0;
