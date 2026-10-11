-- Phase 12: Meta Embedded Signup (OAuth) flow
-- Adds CSRF state tokens table and lifecycle columns to wa_business_accounts

-- New table: CSRF state tokens for OAuth flow
CREATE TABLE IF NOT EXISTS wa_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  return_path TEXT NOT NULL DEFAULT '/dashboard/settings/channels',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wa_oauth_states_org_id_idx ON wa_oauth_states(org_id);
CREATE INDEX IF NOT EXISTS wa_oauth_states_expires_idx ON wa_oauth_states(expires_at);

-- Extend wa_business_accounts with connection lifecycle columns
ALTER TABLE wa_business_accounts
  ADD COLUMN IF NOT EXISTS connection_mode TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS oauth_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;
