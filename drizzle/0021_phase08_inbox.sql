-- Phase 08: Inbox real y controles de despliegue
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Pause controls on ai_agent_deployments
ALTER TABLE "ai_agent_deployments"
  ADD COLUMN "paused"      boolean    NOT NULL DEFAULT false,
  ADD COLUMN "paused_at"   timestamptz,
  ADD COLUMN "paused_by"   text       REFERENCES "user"("id") ON DELETE SET NULL;

-- 2. Per-deployment schedule (one row per deployment)
CREATE TABLE "ai_deployment_schedules" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid        NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "deployment_id" uuid        NOT NULL REFERENCES "ai_agent_deployments"("id") ON DELETE CASCADE,
  -- IANA timezone string, e.g. "America/Caracas"
  "timezone"      text        NOT NULL DEFAULT 'UTC',
  -- JSON: { mon:[{start:"09:00",end:"17:00"}], tue:[], ... }
  -- key = lowercase weekday 3-letter (mon, tue, wed, thu, fri, sat, sun)
  "windows"       jsonb       NOT NULL DEFAULT '{}',
  "enabled"       boolean     NOT NULL DEFAULT true,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("deployment_id")
);

CREATE INDEX "ai_deployment_schedules_org_id_idx" ON "ai_deployment_schedules" ("org_id");

-- 3. Private conversation notes (never shown as customer messages)
CREATE TABLE "wa_conversation_notes" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          uuid        NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "conversation_id" uuid        NOT NULL REFERENCES "wa_conversations"("id") ON DELETE CASCADE,
  "author_id"       text        NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "body"            text        NOT NULL,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "wa_conversation_notes_conversation_id_idx" ON "wa_conversation_notes" ("conversation_id");
CREATE INDEX "wa_conversation_notes_org_id_idx" ON "wa_conversation_notes" ("org_id");
