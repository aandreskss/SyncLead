-- Phase 01: AI WhatsApp Agents Foundation
-- Additive migration — all statements use IF NOT EXISTS

-- wa_business_accounts: one row per Meta WhatsApp Business Account per org
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
);
CREATE INDEX IF NOT EXISTS wa_business_accounts_org_id_idx ON wa_business_accounts (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS wa_business_accounts_org_waba_idx ON wa_business_accounts (org_id, waba_id);

-- wa_phone_numbers: individual phone numbers within a WABA
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
);
CREATE INDEX IF NOT EXISTS wa_phone_numbers_org_id_idx ON wa_phone_numbers (org_id);
CREATE INDEX IF NOT EXISTS wa_phone_numbers_waba_id_idx ON wa_phone_numbers (waba_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS wa_phone_numbers_org_phone_id_idx ON wa_phone_numbers (org_id, phone_number_id);

-- ai_agents: reusable agent configurations
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
);
CREATE INDEX IF NOT EXISTS ai_agents_org_id_idx ON ai_agents (org_id);

-- ai_agent_deployments: links one agent to one phone number (unique per phone+org)
CREATE TABLE IF NOT EXISTS ai_agent_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  phone_number_id uuid NOT NULL REFERENCES wa_phone_numbers(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_agent_deployments_org_id_idx ON ai_agent_deployments (org_id);
CREATE INDEX IF NOT EXISTS ai_agent_deployments_agent_id_idx ON ai_agent_deployments (agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_deployments_phone_org_idx ON ai_agent_deployments (phone_number_id, org_id);

-- wa_conversations: one thread per (org, phone_number, customer_phone)
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
);
CREATE INDEX IF NOT EXISTS wa_conversations_org_id_idx ON wa_conversations (org_id);
CREATE INDEX IF NOT EXISTS wa_conversations_phone_number_id_idx ON wa_conversations (phone_number_id);
CREATE INDEX IF NOT EXISTS wa_conversations_lead_id_idx ON wa_conversations (lead_id);
CREATE INDEX IF NOT EXISTS wa_conversations_last_msg_idx ON wa_conversations (last_message_at);
CREATE UNIQUE INDEX IF NOT EXISTS wa_conversations_org_phone_customer_idx ON wa_conversations (org_id, phone_number_id, customer_phone);

-- wa_conversation_messages: individual messages in a thread
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
);
CREATE INDEX IF NOT EXISTS wa_conv_messages_conversation_id_idx ON wa_conversation_messages (conversation_id);
CREATE INDEX IF NOT EXISTS wa_conv_messages_org_id_idx ON wa_conversation_messages (org_id);
CREATE INDEX IF NOT EXISTS wa_conv_messages_created_at_idx ON wa_conversation_messages (created_at);
CREATE UNIQUE INDEX IF NOT EXISTS wa_conv_messages_external_id_idx ON wa_conversation_messages (external_message_id) WHERE external_message_id IS NOT NULL;

-- wa_agent_events: AI tool calls, handoffs, errors
CREATE TABLE IF NOT EXISTS wa_agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_agent_events_org_id_idx ON wa_agent_events (org_id);
CREATE INDEX IF NOT EXISTS wa_agent_events_conversation_id_idx ON wa_agent_events (conversation_id);
CREATE INDEX IF NOT EXISTS wa_agent_events_created_at_idx ON wa_agent_events (created_at);
