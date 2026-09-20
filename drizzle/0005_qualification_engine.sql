-- ─── Prompt 16: Qualification engine columns ─────────────────────────────────
-- Adds normalised lead inputs + effective qualification cache to leads.
-- Adds structured result columns to lead_qualifications.

-- leads: raw inputs + canonical forms + effective_qual_class cache
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS negocio_raw          TEXT,
  ADD COLUMN IF NOT EXISTS negocio_normalized   TEXT,
  ADD COLUMN IF NOT EXISTS city_canonical       TEXT,
  ADD COLUMN IF NOT EXISTS effective_qual_class TEXT;

CREATE INDEX IF NOT EXISTS leads_effective_qual_class_idx
  ON leads (effective_qual_class);

-- lead_qualifications: classification result + type + reasons + inputs
ALTER TABLE lead_qualifications
  ADD COLUMN IF NOT EXISTS qual_class TEXT NOT NULL DEFAULT 'unqualified',
  ADD COLUMN IF NOT EXISTS qual_type  TEXT NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS reasons    JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS inputs     JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS note       TEXT,
  ADD COLUMN IF NOT EXISTS actor_id   TEXT;
