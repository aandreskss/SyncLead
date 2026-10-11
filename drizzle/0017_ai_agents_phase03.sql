-- Phase 03: AI Agents UI — add agentConfig + status to ai_agents
-- Additive only — no drops, no renames.

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS agent_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'draft';

COMMENT ON COLUMN ai_agents.agent_config IS
  'Structured config for the 6 editor tabs (objetivo, personalidad, conocimiento, acciones, reglas, despliegue). Mutable; published snapshot lives in ai_agent_versions.snapshot.';

COMMENT ON COLUMN ai_agents.status IS
  'Lifecycle state: draft | active | paused | archived. Active = published version deployed and responding. Never deleted when referenced by ai_agent_deployments or ai_episodes — archive instead.';

-- Index for the agents list view (filter by status per org)
CREATE INDEX IF NOT EXISTS ai_agents_org_status_idx ON ai_agents (org_id, status);
