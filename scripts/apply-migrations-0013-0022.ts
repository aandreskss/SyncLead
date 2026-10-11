/**
 * Applies migrations 0013–0022 that are missing from Neon.
 * Each statement is idempotent (IF NOT EXISTS or caught "already exists" error).
 * Run: npx tsx scripts/apply-migrations-0013-0022.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const db = neon(process.env.DATABASE_URL!)

/** Execute one SQL string; ignore "already exists" errors for idempotency. */
async function exec(sql: string, label?: string): Promise<void> {
  try {
    await db.query(sql)
    if (label) console.log(`  ✓ ${label}`)
  } catch (e: any) {
    const msg: string = e?.message ?? ""
    if (
      msg.includes("already exists") ||
      msg.includes("duplicate column") ||
      msg.includes("42701") || // duplicate_column
      msg.includes("42P07") || // duplicate_table
      msg.includes("42710")    // duplicate_object (index)
    ) {
      if (label) console.log(`  · ${label} (already exists, skipped)`)
    } else {
      throw new Error(`SQL failed [${label ?? "?"}]: ${msg}\nSQL: ${sql.trim().slice(0, 200)}`)
    }
  }
}

async function main() {
  // ─── 0013: visitor geo columns ───────────────────────────────────────────────
  console.log("\n[0013] visitor_geo")
  await exec(`ALTER TABLE conversion_observations ADD COLUMN visitor_city text`, "visitor_city")
  await exec(`ALTER TABLE conversion_observations ADD COLUMN visitor_country text`, "visitor_country")

  // ─── 0014: visitor tracking columns ──────────────────────────────────────────
  console.log("\n[0014] visitor_tracking")
  await exec(`ALTER TABLE conversion_observations ADD COLUMN visitor_id text`, "visitor_id")
  await exec(`ALTER TABLE conversion_observations ADD COLUMN utm_source text`, "utm_source")
  await exec(`ALTER TABLE conversion_observations ADD COLUMN utm_medium text`, "utm_medium")
  await exec(`ALTER TABLE conversion_observations ADD COLUMN utm_campaign text`, "utm_campaign")
  await exec(`ALTER TABLE conversion_observations ADD COLUMN referrer text`, "referrer")
  await exec(`CREATE INDEX IF NOT EXISTS conversion_observations_visitor_id_idx ON conversion_observations (visitor_id)`, "idx")

  // ─── 0015: AI Agents Foundation tables ───────────────────────────────────────
  console.log("\n[0015] ai_agents_foundation")

  await exec(`
    CREATE TABLE IF NOT EXISTS wa_business_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      waba_id text NOT NULL,
      display_name text NOT NULL,
      access_token_enc text,
      key_version integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'active',
      webhook_verify_token text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "wa_business_accounts")
  await exec(`CREATE INDEX IF NOT EXISTS wa_business_accounts_org_id_idx ON wa_business_accounts (org_id)`, "idx org")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS wa_business_accounts_org_waba_idx ON wa_business_accounts (org_id, waba_id)`, "idx org+waba")

  await exec(`
    CREATE TABLE IF NOT EXISTS wa_phone_numbers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      waba_account_id uuid NOT NULL REFERENCES wa_business_accounts(id) ON DELETE CASCADE,
      phone_number_id text NOT NULL,
      display_phone_number text NOT NULL,
      verified_name text,
      quality_rating text,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "wa_phone_numbers")
  await exec(`CREATE INDEX IF NOT EXISTS wa_phone_numbers_org_id_idx ON wa_phone_numbers (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS wa_phone_numbers_waba_id_idx ON wa_phone_numbers (waba_account_id)`, "idx waba")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS wa_phone_numbers_org_phone_id_idx ON wa_phone_numbers (org_id, phone_number_id)`, "idx org+phone")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_agents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text,
      system_prompt text NOT NULL DEFAULT '',
      model text NOT NULL DEFAULT 'claude-sonnet-4-6',
      ai_temperature numeric(3,2) NOT NULL DEFAULT 0.70,
      max_tokens integer NOT NULL DEFAULT 1024,
      tools_enabled text[] NOT NULL DEFAULT '{}',
      handoff_triggers jsonb NOT NULL DEFAULT '{}',
      greeting_message text,
      active boolean NOT NULL DEFAULT true,
      created_by_id text REFERENCES "user"(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_agents")
  await exec(`CREATE INDEX IF NOT EXISTS ai_agents_org_id_idx ON ai_agents (org_id)`, "idx")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_agent_deployments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
      phone_number_id uuid NOT NULL REFERENCES wa_phone_numbers(id) ON DELETE CASCADE,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_agent_deployments")
  await exec(`CREATE INDEX IF NOT EXISTS ai_agent_deployments_org_id_idx ON ai_agent_deployments (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS ai_agent_deployments_agent_id_idx ON ai_agent_deployments (agent_id)`, "idx agent")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_deployments_phone_org_idx ON ai_agent_deployments (phone_number_id, org_id)`, "idx phone+org")

  await exec(`
    CREATE TABLE IF NOT EXISTS wa_conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      phone_number_id uuid NOT NULL REFERENCES wa_phone_numbers(id) ON DELETE CASCADE,
      customer_phone text NOT NULL,
      customer_name text,
      lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
      deployment_id uuid REFERENCES ai_agent_deployments(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'active',
      assigned_to text REFERENCES "user"(id) ON DELETE SET NULL,
      last_message_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "wa_conversations")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conversations_org_id_idx ON wa_conversations (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conversations_phone_number_id_idx ON wa_conversations (phone_number_id)`, "idx phone")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conversations_lead_id_idx ON wa_conversations (lead_id)`, "idx lead")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conversations_last_msg_idx ON wa_conversations (last_message_at)`, "idx last_msg")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS wa_conversations_org_phone_customer_idx ON wa_conversations (org_id, phone_number_id, customer_phone)`, "idx unique")

  await exec(`
    CREATE TABLE IF NOT EXISTS wa_conversation_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
      direction text NOT NULL DEFAULT 'inbound',
      role text NOT NULL DEFAULT 'user',
      content text NOT NULL DEFAULT '',
      content_type text NOT NULL DEFAULT 'text',
      media_url text,
      external_message_id text,
      status text NOT NULL DEFAULT 'sent',
      token_count integer,
      is_ai boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "wa_conversation_messages")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conv_messages_conversation_id_idx ON wa_conversation_messages (conversation_id)`, "idx conv")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conv_messages_org_id_idx ON wa_conversation_messages (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conv_messages_created_at_idx ON wa_conversation_messages (created_at)`, "idx time")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS wa_conv_messages_external_id_idx ON wa_conversation_messages (external_message_id) WHERE external_message_id IS NOT NULL`, "idx ext")

  await exec(`
    CREATE TABLE IF NOT EXISTS wa_agent_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
      event_type text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "wa_agent_events")
  await exec(`CREATE INDEX IF NOT EXISTS wa_agent_events_org_id_idx ON wa_agent_events (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS wa_agent_events_conversation_id_idx ON wa_agent_events (conversation_id)`, "idx conv")
  await exec(`CREATE INDEX IF NOT EXISTS wa_agent_events_created_at_idx ON wa_agent_events (created_at)`, "idx time")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_tool_executions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      episode_id uuid NOT NULL,
      conversation_id uuid NOT NULL REFERENCES wa_conversations(id),
      tool_name text NOT NULL,
      input jsonb NOT NULL DEFAULT '{}',
      output jsonb,
      status text NOT NULL DEFAULT 'success',
      duration_ms integer,
      error_detail text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_tool_executions (base, FK to episode added later)")
  await exec(`CREATE INDEX IF NOT EXISTS ai_tool_executions_org_id_idx ON ai_tool_executions (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS ai_tool_executions_conversation_id_idx ON ai_tool_executions (conversation_id)`, "idx conv")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_usage_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      episode_id uuid NOT NULL,
      conversation_id uuid NOT NULL REFERENCES wa_conversations(id),
      provider text NOT NULL,
      model text NOT NULL,
      input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_usage_records (base)")
  await exec(`CREATE INDEX IF NOT EXISTS ai_usage_records_org_id_idx ON ai_usage_records (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS ai_usage_records_created_at_idx ON ai_usage_records (org_id, created_at)`, "idx time")

  // ─── 0016: AI Agents Phase 02 ─────────────────────────────────────────────────
  console.log("\n[0016] ai_agents_phase02")
  await exec(`ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS control_mode text NOT NULL DEFAULT 'ai'`, "wa_conversations.control_mode")
  await exec(`ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS closed_at timestamptz`, "wa_conversations.closed_at")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conversations_control_mode_idx ON wa_conversations (org_id, control_mode)`, "idx")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS wa_phone_numbers_phone_number_id_global_idx ON wa_phone_numbers (phone_number_id)`, "idx global phone")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS wa_business_accounts_waba_id_global_idx ON wa_business_accounts (waba_id)`, "idx global waba")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_agent_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
      version_number integer NOT NULL,
      snapshot jsonb NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'draft',
      published_at timestamptz,
      published_by text REFERENCES "user"(id) ON DELETE SET NULL,
      archived_at timestamptz,
      archived_by text REFERENCES "user"(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_agent_versions")
  await exec(`CREATE INDEX IF NOT EXISTS ai_agent_versions_agent_id_idx ON ai_agent_versions (agent_id)`, "idx agent")
  await exec(`CREATE INDEX IF NOT EXISTS ai_agent_versions_org_id_idx ON ai_agent_versions (org_id)`, "idx org")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_versions_agent_version_idx ON ai_agent_versions (agent_id, version_number)`, "idx unique")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_versions_agent_published_idx ON ai_agent_versions (agent_id) WHERE status = 'published'`, "idx published")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text,
      source_type text NOT NULL DEFAULT 'text',
      content text,
      url text,
      file_key text,
      status text NOT NULL DEFAULT 'active',
      revoked_at timestamptz,
      revoked_by text REFERENCES "user"(id) ON DELETE SET NULL,
      created_by text REFERENCES "user"(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_knowledge_sources")
  await exec(`CREATE INDEX IF NOT EXISTS ai_knowledge_sources_org_id_idx ON ai_knowledge_sources (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS ai_knowledge_sources_status_idx ON ai_knowledge_sources (org_id, status)`, "idx status")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_revisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_id uuid NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
      revision_number integer NOT NULL,
      content_hash text NOT NULL,
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_knowledge_revisions")
  await exec(`CREATE INDEX IF NOT EXISTS ai_knowledge_revisions_source_id_idx ON ai_knowledge_revisions (source_id)`, "idx source")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_revisions_source_revision_idx ON ai_knowledge_revisions (source_id, revision_number)`, "idx unique")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_agent_version_knowledge (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      agent_version_id uuid NOT NULL REFERENCES ai_agent_versions(id) ON DELETE CASCADE,
      knowledge_source_id uuid NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE RESTRICT,
      knowledge_revision_id uuid NOT NULL REFERENCES ai_knowledge_revisions(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_agent_version_knowledge")
  await exec(`CREATE INDEX IF NOT EXISTS ai_agent_version_knowledge_version_idx ON ai_agent_version_knowledge (agent_version_id)`, "idx version")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_version_knowledge_version_source_idx ON ai_agent_version_knowledge (agent_version_id, knowledge_source_id)`, "idx unique")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_campaign_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      deployment_id uuid NOT NULL REFERENCES ai_agent_deployments(id) ON DELETE CASCADE,
      campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
      priority integer NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_campaign_rules")
  await exec(`CREATE INDEX IF NOT EXISTS ai_campaign_rules_deployment_id_idx ON ai_campaign_rules (deployment_id)`, "idx dep")
  await exec(`CREATE INDEX IF NOT EXISTS ai_campaign_rules_campaign_id_idx ON ai_campaign_rules (campaign_id)`, "idx camp")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_campaign_rules_dep_campaign_idx ON ai_campaign_rules (deployment_id, campaign_id) WHERE campaign_id IS NOT NULL`, "idx unique specific")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_campaign_rules_dep_catchall_idx ON ai_campaign_rules (deployment_id) WHERE campaign_id IS NULL`, "idx unique catchall")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_episodes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
      agent_version_id uuid NOT NULL REFERENCES ai_agent_versions(id),
      campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
      knowledge_snapshot jsonb NOT NULL DEFAULT '[]',
      trigger_message_id uuid REFERENCES wa_conversation_messages(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'active',
      exit_reason text,
      exit_detail text,
      started_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz,
      token_count_in integer NOT NULL DEFAULT 0,
      token_count_out integer NOT NULL DEFAULT 0,
      model_used text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_episodes")
  await exec(`CREATE INDEX IF NOT EXISTS ai_episodes_org_id_idx ON ai_episodes (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS ai_episodes_conversation_id_idx ON ai_episodes (conversation_id)`, "idx conv")
  await exec(`CREATE INDEX IF NOT EXISTS ai_episodes_agent_version_id_idx ON ai_episodes (agent_version_id)`, "idx version")
  await exec(`CREATE INDEX IF NOT EXISTS ai_episodes_status_idx ON ai_episodes (org_id, status)`, "idx status")

  // Now we can add the FK on ai_tool_executions.episode_id
  await exec(`ALTER TABLE ai_tool_executions ADD CONSTRAINT ai_tool_executions_episode_id_fk FOREIGN KEY (episode_id) REFERENCES ai_episodes(id) ON DELETE CASCADE`, "ai_tool_executions FK episode")
  await exec(`CREATE INDEX IF NOT EXISTS ai_tool_executions_episode_id_idx ON ai_tool_executions (episode_id)`, "idx episode")

  // ai_usage_records FK to ai_episodes
  await exec(`ALTER TABLE ai_usage_records ADD CONSTRAINT ai_usage_records_episode_id_fk FOREIGN KEY (episode_id) REFERENCES ai_episodes(id) ON DELETE CASCADE`, "ai_usage_records FK episode")
  await exec(`CREATE INDEX IF NOT EXISTS ai_usage_records_episode_id_idx ON ai_usage_records (episode_id)`, "idx episode")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_message_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
      incoming_message_id uuid NOT NULL REFERENCES wa_conversation_messages(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'enqueued',
      attempt_count integer NOT NULL DEFAULT 0,
      claim_at timestamptz NOT NULL DEFAULT now(),
      claimed_at timestamptz,
      claimed_by text,
      error_last text,
      dead_lettered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_message_queue")
  await exec(`CREATE INDEX IF NOT EXISTS ai_message_queue_org_id_idx ON ai_message_queue (org_id)`, "idx org")
  await exec(`CREATE INDEX IF NOT EXISTS ai_message_queue_status_claim_idx ON ai_message_queue (status, claim_at)`, "idx status+claim")
  await exec(`CREATE INDEX IF NOT EXISTS ai_message_queue_conversation_id_idx ON ai_message_queue (conversation_id)`, "idx conv")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_message_queue_message_id_idx ON ai_message_queue (incoming_message_id)`, "idx unique msg")

  // ─── 0017: ai_agents_phase03 ──────────────────────────────────────────────────
  console.log("\n[0017] ai_agents_phase03")
  await exec(`ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS agent_config jsonb NOT NULL DEFAULT '{}'::jsonb`, "agent_config")
  await exec(`ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`, "status")
  await exec(`CREATE INDEX IF NOT EXISTS ai_agents_org_status_idx ON ai_agents (org_id, status)`, "idx")

  // ─── 0018: summary + latency ──────────────────────────────────────────────────
  console.log("\n[0018] summary_latency")
  await exec(`ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS summary text`, "summary")
  await exec(`ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS message_count integer NOT NULL DEFAULT 0`, "message_count")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS latency_ms integer`, "latency_ms")

  // ─── 0019: ai_tools_phase05 ───────────────────────────────────────────────────
  console.log("\n[0019] ai_tools_phase05")
  await exec(`ALTER TABLE ai_tool_executions ADD COLUMN IF NOT EXISTS idempotency_key text`, "idempotency_key")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_tool_executions_idem_key_idx ON ai_tool_executions (idempotency_key) WHERE idempotency_key IS NOT NULL`, "idx")

  // ─── 0020: phase07_durable_pipeline ──────────────────────────────────────────
  console.log("\n[0020] phase07_durable_pipeline")
  await exec(`ALTER TABLE ai_message_queue ADD COLUMN IF NOT EXISTS lease_token uuid`, "lease_token")
  await exec(`CREATE INDEX IF NOT EXISTS ai_message_queue_orphan_idx ON ai_message_queue(claimed_at) WHERE status = 'processing'`, "idx orphan")

  // ─── 0021: phase08_inbox ──────────────────────────────────────────────────────
  console.log("\n[0021] phase08_inbox")
  await exec(`ALTER TABLE ai_agent_deployments ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false`, "paused")
  await exec(`ALTER TABLE ai_agent_deployments ADD COLUMN IF NOT EXISTS paused_at timestamptz`, "paused_at")
  await exec(`ALTER TABLE ai_agent_deployments ADD COLUMN IF NOT EXISTS paused_by text REFERENCES "user"(id) ON DELETE SET NULL`, "paused_by")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_deployment_schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      deployment_id uuid NOT NULL REFERENCES ai_agent_deployments(id) ON DELETE CASCADE,
      timezone text NOT NULL DEFAULT 'UTC',
      windows jsonb NOT NULL DEFAULT '{}',
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (deployment_id)
    )`, "ai_deployment_schedules")
  await exec(`CREATE INDEX IF NOT EXISTS ai_deployment_schedules_org_id_idx ON ai_deployment_schedules (org_id)`, "idx")

  await exec(`
    CREATE TABLE IF NOT EXISTS wa_conversation_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
      author_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "wa_conversation_notes")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conversation_notes_conversation_id_idx ON wa_conversation_notes (conversation_id)`, "idx conv")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conversation_notes_org_id_idx ON wa_conversation_notes (org_id)`, "idx org")

  // ─── 0022: phase09_usage_budget ──────────────────────────────────────────────
  console.log("\n[0022] phase09_usage_budget")

  // ai_pricing_tiers: may already exist from apply-phase09.ts run earlier
  await exec(`
    CREATE TABLE IF NOT EXISTS ai_pricing_tiers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider text NOT NULL,
      model text NOT NULL,
      display_name text NOT NULL,
      input_millicents_per_token bigint NOT NULL,
      output_millicents_per_token bigint NOT NULL,
      cache_read_millicents_per_token bigint,
      cache_write_millicents_per_token bigint,
      source text NOT NULL DEFAULT 'anthropic_published',
      note text,
      effective_from timestamptz NOT NULL DEFAULT now(),
      effective_to timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_pricing_tiers")
  await exec(`CREATE INDEX IF NOT EXISTS ai_pricing_tiers_provider_model_idx ON ai_pricing_tiers (provider, model, effective_from DESC)`, "idx")

  // Seed rates idempotently
  const existing = await db`SELECT model FROM ai_pricing_tiers WHERE provider = 'anthropic'`
  const seeded = new Set(existing.map((r: any) => r.model))
  if (!seeded.has("claude-sonnet-4-6")) {
    await db`INSERT INTO ai_pricing_tiers (provider,model,display_name,input_millicents_per_token,output_millicents_per_token,cache_read_millicents_per_token,cache_write_millicents_per_token,source,note) VALUES ('anthropic','claude-sonnet-4-6','Claude Sonnet 4.6',300,1500,30,375,'anthropic_published','Anthropic published rates 2026-10-10. Callbell internal rates differ.')`
    console.log("  ✓ Seeded Sonnet 4.6 rates")
  } else { console.log("  · Sonnet 4.6 already seeded") }
  if (!seeded.has("claude-haiku-4-5-20251001")) {
    await db`INSERT INTO ai_pricing_tiers (provider,model,display_name,input_millicents_per_token,output_millicents_per_token,cache_read_millicents_per_token,cache_write_millicents_per_token,source,note) VALUES ('anthropic','claude-haiku-4-5-20251001','Claude Haiku 4.5',80,400,8,100,'anthropic_published','Anthropic published rates 2026-10-10.')`
    console.log("  ✓ Seeded Haiku 4.5 rates")
  } else { console.log("  · Haiku 4.5 already seeded") }

  // Extend ai_usage_records
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS cache_read_tokens integer NOT NULL DEFAULT 0`, "cache_read_tokens")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS cache_write_tokens integer NOT NULL DEFAULT 0`, "cache_write_tokens")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS input_cost_millicents bigint`, "input_cost_millicents")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS output_cost_millicents bigint`, "output_cost_millicents")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS cache_read_cost_millicents bigint`, "cache_read_cost_millicents")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS cache_write_cost_millicents bigint`, "cache_write_cost_millicents")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS total_cost_millicents bigint`, "total_cost_millicents")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS pricing_tier_id uuid REFERENCES ai_pricing_tiers(id) ON DELETE SET NULL`, "pricing_tier_id")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false`, "is_sandbox")
  await exec(`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS call_type text NOT NULL DEFAULT 'inference'`, "call_type")
  await exec(`CREATE INDEX IF NOT EXISTS ai_usage_records_analytics_idx ON ai_usage_records (org_id, created_at DESC, is_sandbox)`, "idx analytics")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_budget_limits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      daily_limit_millicents bigint,
      monthly_limit_millicents bigint,
      per_conversation_limit_millicents bigint,
      alert_threshold_pct integer NOT NULL DEFAULT 80,
      pause_on_exhaust boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, "ai_budget_limits")

  await exec(`
    CREATE TABLE IF NOT EXISTS ai_budget_reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      queue_item_id uuid NOT NULL UNIQUE REFERENCES ai_message_queue(id) ON DELETE CASCADE,
      episode_id uuid REFERENCES ai_episodes(id) ON DELETE SET NULL,
      reserved_millicents bigint NOT NULL,
      status text NOT NULL DEFAULT 'reserved',
      released_reason text,
      reserved_at timestamptz NOT NULL DEFAULT now(),
      settled_at timestamptz,
      usage_record_id uuid REFERENCES ai_usage_records(id) ON DELETE SET NULL
    )`, "ai_budget_reservations")
  await exec(`CREATE INDEX IF NOT EXISTS ai_budget_reservations_org_status_idx ON ai_budget_reservations (org_id, status)`, "idx status")
  await exec(`CREATE INDEX IF NOT EXISTS ai_budget_reservations_orphan_idx ON ai_budget_reservations (reserved_at) WHERE status = 'reserved'`, "idx orphan")

  // Analytics indexes on ai_episodes
  await exec(`CREATE INDEX IF NOT EXISTS ai_episodes_org_started_idx ON ai_episodes (org_id, started_at DESC)`, "idx episodes org+started")
  await exec(`CREATE INDEX IF NOT EXISTS ai_episodes_org_campaign_idx ON ai_episodes (org_id, campaign_id)`, "idx episodes org+campaign")
  await exec(`CREATE INDEX IF NOT EXISTS ai_episodes_exit_reason_idx ON ai_episodes (org_id, exit_reason) WHERE status = 'ended'`, "idx episodes exit")

  // ─── Final verification ───────────────────────────────────────────────────────
  console.log("\n[verify]")
  const tables = await db`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  const names = tables.map((r: any) => r.table_name)
  const required = [
    "wa_business_accounts","wa_phone_numbers","wa_conversations","wa_conversation_messages",
    "wa_conversation_notes","wa_agent_events","ai_agents","ai_agent_versions","ai_agent_deployments",
    "ai_knowledge_sources","ai_knowledge_revisions","ai_agent_version_knowledge",
    "ai_campaign_rules","ai_episodes","ai_message_queue","ai_tool_executions","ai_usage_records",
    "ai_deployment_schedules","ai_pricing_tiers","ai_budget_limits","ai_budget_reservations",
  ]
  const missing = required.filter(t => !names.includes(t))
  if (missing.length > 0) {
    throw new Error(`Missing tables: ${missing.join(", ")}`)
  }

  const usageCols = await db`SELECT column_name FROM information_schema.columns WHERE table_name='ai_usage_records' ORDER BY ordinal_position`
  console.log(`  ✓ All ${required.length} required AI tables present`)
  console.log(`  ✓ ai_usage_records: ${usageCols.length} columns`)
  console.log(`  ✓ Total tables in Neon: ${names.length}`)
  console.log("\n✅ All migrations applied successfully.")
}

main().catch((err) => { console.error("\n❌", err.message ?? err); process.exit(1) })
