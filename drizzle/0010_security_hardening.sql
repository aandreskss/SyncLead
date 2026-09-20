-- ─── Prompt 21: Security hardening — consent and erasure fields ──────────────
-- Aditiva: adds GDPR/LGPD-relevant columns to leads.
-- No existing columns removed or renamed.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS consent_given      boolean,
  ADD COLUMN IF NOT EXISTS legal_basis        text,
  ADD COLUMN IF NOT EXISTS consented_at       timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS erased_at          timestamptz;

-- Index: fast lookup for pending erasure requests (cron + compliance reports)
CREATE INDEX IF NOT EXISTS leads_deletion_requested_idx ON leads (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL AND erased_at IS NULL;

-- Index: fast lookup for IP retention cleanup cron
CREATE INDEX IF NOT EXISTS leads_ip_expires_at_idx ON leads (ip_expires_at)
  WHERE ip IS NOT NULL AND ip_expires_at IS NOT NULL;

-- Index: fast lookup for UA retention cleanup cron
CREATE INDEX IF NOT EXISTS leads_ua_expires_at_idx ON leads (ua_expires_at)
  WHERE user_agent IS NOT NULL AND ua_expires_at IS NOT NULL;
