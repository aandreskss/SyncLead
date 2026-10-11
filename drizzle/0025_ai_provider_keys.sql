-- Phase 13: AI provider API keys (per-org, encrypted)
-- Stores Anthropic / OpenAI / Google API keys encrypted with AES-256-GCM,
-- same format used for meta_connections tokens.

CREATE TABLE IF NOT EXISTS "ai_provider_keys" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id"      uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider"    text NOT NULL,
  "key_enc"     text NOT NULL,
  "key_version" integer NOT NULL DEFAULT 1,
  "created_at"  timestamp NOT NULL DEFAULT now(),
  "updated_at"  timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_provider_keys_org_provider_idx"
  ON "ai_provider_keys" ("org_id", "provider");
