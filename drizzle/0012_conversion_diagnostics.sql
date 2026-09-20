-- Prompt 25: Conversion Diagnostics Module
-- Aditiva — no modifica tablas existentes

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE diag_conversion_status AS ENUM (
  'not_configured',
  'code_not_detected',
  'code_detected',
  'awaiting_test',
  'observed_browser',
  'observed_server',
  'observed_both',
  'accepted_by_meta',
  'misconfigured',
  'duplicate_risk',
  'stale',
  'failed',
  'unknown'
);

CREATE TYPE conversion_provider AS ENUM (
  'meta_pixel', 'meta_capi', 'both', 'custom'
);

CREATE TYPE expected_source AS ENUM (
  'browser', 'server', 'both'
);

CREATE TYPE conversion_trigger_type AS ENUM (
  'page_load',
  'element_click',
  'data_attribute',
  'form_submit',
  'explicit_callback',
  'datalayer_event',
  'ecommerce_event',
  'webhook',
  'manual_sale'
);

CREATE TYPE conversion_criticality AS ENUM (
  'critical', 'high', 'medium', 'low'
);

CREATE TYPE observation_source AS ENUM (
  'browser_pixel', 'server_capi', 'diagnostic_collector', 'scan'
);

CREATE TYPE conversion_issue_severity AS ENUM (
  'critical', 'high', 'medium', 'low', 'info'
);

CREATE TYPE conversion_issue_status AS ENUM (
  'open', 'acknowledged', 'resolved', 'ignored'
);

CREATE TYPE test_session_status AS ENUM (
  'pending', 'active', 'completed', 'expired', 'cancelled'
);

CREATE TYPE site_environment AS ENUM (
  'production', 'staging', 'development'
);

-- ─── tracking_sites ───────────────────────────────────────────────────────────

CREATE TABLE tracking_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  environment site_environment NOT NULL DEFAULT 'production',
  expected_pixel_id TEXT,
  allowed_origins TEXT[] NOT NULL DEFAULT '{}',
  verified_at TIMESTAMPTZ,
  verification_method TEXT,
  diagnostics_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tracking_sites_org_id_idx ON tracking_sites(org_id);
CREATE INDEX tracking_sites_client_id_idx ON tracking_sites(client_id);
CREATE UNIQUE INDEX tracking_sites_client_domain_env_idx ON tracking_sites(client_id, domain, environment);

-- ─── conversion_definitions ───────────────────────────────────────────────────

CREATE TABLE conversion_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tracking_site_id UUID REFERENCES tracking_sites(id) ON DELETE SET NULL,
  internal_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider conversion_provider NOT NULL DEFAULT 'meta_pixel',
  provider_event_name TEXT NOT NULL,
  description TEXT,
  business_category TEXT,
  expected_source expected_source NOT NULL DEFAULT 'both',
  trigger_type conversion_trigger_type NOT NULL DEFAULT 'explicit_callback',
  trigger_config JSONB NOT NULL DEFAULT '{}',
  required_parameters JSONB NOT NULL DEFAULT '[]',
  criticality conversion_criticality NOT NULL DEFAULT 'medium',
  freshness_policy JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  installation_notes TEXT,
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX conversion_definitions_org_client_key_idx ON conversion_definitions(org_id, client_id, internal_key);
CREATE INDEX conversion_definitions_org_id_idx ON conversion_definitions(org_id);
CREATE INDEX conversion_definitions_client_id_idx ON conversion_definitions(client_id);
CREATE INDEX conversion_definitions_site_id_idx ON conversion_definitions(tracking_site_id);
CREATE INDEX conversion_definitions_enabled_idx ON conversion_definitions(client_id, enabled);

-- ─── conversion_test_sessions ─────────────────────────────────────────────────

CREATE TABLE conversion_test_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tracking_site_id UUID REFERENCES tracking_sites(id) ON DELETE SET NULL,
  conversion_definition_id UUID NOT NULL REFERENCES conversion_definitions(id) ON DELETE CASCADE,
  public_token_hash TEXT NOT NULL UNIQUE,
  status test_session_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  started_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX conversion_test_sessions_org_id_idx ON conversion_test_sessions(org_id);
CREATE INDEX conversion_test_sessions_client_id_idx ON conversion_test_sessions(client_id);
CREATE INDEX conversion_test_sessions_def_id_idx ON conversion_test_sessions(conversion_definition_id);
CREATE INDEX conversion_test_sessions_expires_at_idx ON conversion_test_sessions(expires_at);

-- ─── conversion_observations ─────────────────────────────────────────────────

CREATE TABLE conversion_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tracking_site_id UUID REFERENCES tracking_sites(id) ON DELETE SET NULL,
  conversion_definition_id UUID REFERENCES conversion_definitions(id) ON DELETE SET NULL,
  test_session_id UUID REFERENCES conversion_test_sessions(id) ON DELETE SET NULL,
  source observation_source NOT NULL,
  event_name TEXT NOT NULL,
  event_id_hash TEXT,
  page_url TEXT,
  environment site_environment NOT NULL DEFAULT 'production',
  parameters_present JSONB NOT NULL DEFAULT '{}',
  validation_result JSONB NOT NULL DEFAULT '{}',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE INDEX conversion_observations_org_id_idx ON conversion_observations(org_id);
CREATE INDEX conversion_observations_client_id_idx ON conversion_observations(client_id);
CREATE INDEX conversion_observations_def_id_idx ON conversion_observations(conversion_definition_id);
CREATE INDEX conversion_observations_session_id_idx ON conversion_observations(test_session_id);
CREATE INDEX conversion_observations_observed_at_idx ON conversion_observations(observed_at DESC);
CREATE INDEX conversion_observations_retention_idx ON conversion_observations(retention_expires_at);
CREATE INDEX conversion_observations_event_id_hash_idx ON conversion_observations(event_id_hash)
  WHERE event_id_hash IS NOT NULL;

-- ─── conversion_issues ───────────────────────────────────────────────────────

CREATE TABLE conversion_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversion_definition_id UUID REFERENCES conversion_definitions(id) ON DELETE CASCADE,
  issue_code TEXT NOT NULL,
  severity conversion_issue_severity NOT NULL DEFAULT 'medium',
  status conversion_issue_status NOT NULL DEFAULT 'open',
  explanation TEXT,
  remediation_key TEXT,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX conversion_issues_org_id_idx ON conversion_issues(org_id);
CREATE INDEX conversion_issues_client_id_idx ON conversion_issues(client_id);
CREATE INDEX conversion_issues_def_id_idx ON conversion_issues(conversion_definition_id);
CREATE INDEX conversion_issues_open_idx ON conversion_issues(client_id, status)
  WHERE status != 'resolved';
