-- Phase 10A: Document knowledge (PDF/CSV) + Phase 10B: Incoming media (images/audio)

-- ── Extend ai_knowledge_sources ────────────────────────────────────────────────
ALTER TABLE ai_knowledge_sources
  ADD COLUMN IF NOT EXISTS processing_status  TEXT NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS processing_error   TEXT,
  ADD COLUMN IF NOT EXISTS content_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS page_count         INTEGER,
  ADD COLUMN IF NOT EXISTS row_count          INTEGER,
  ADD COLUMN IF NOT EXISTS file_size_bytes    BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type          TEXT,
  ADD COLUMN IF NOT EXISTS original_filename  TEXT;

CREATE INDEX IF NOT EXISTS ai_knowledge_sources_fingerprint_idx
  ON ai_knowledge_sources (org_id, content_fingerprint)
  WHERE content_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_knowledge_sources_proc_status_idx
  ON ai_knowledge_sources (org_id, processing_status)
  WHERE source_type = 'file';

-- ── ai_knowledge_chunks (FTS fragments extracted from documents) ───────────────
CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id       UUID NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
  revision_id     UUID NOT NULL REFERENCES ai_knowledge_revisions(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  content         TEXT NOT NULL,
  content_length  INTEGER NOT NULL DEFAULT 0,
  -- {page: 1} for PDF  |  {sheet: "Sheet1", row_start: 1, row_end: 50} for CSV
  location_ref    JSONB NOT NULL DEFAULT '{}',
  -- tsvector for full-text search (written by processor via to_tsvector)
  search_vector   TSVECTOR,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_chunks_dedup_idx
  ON ai_knowledge_chunks (source_id, revision_id, chunk_index);

CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_source_idx
  ON ai_knowledge_chunks (source_id);

CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_org_idx
  ON ai_knowledge_chunks (org_id);

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_fts_idx
  ON ai_knowledge_chunks USING gin(search_vector);

-- ── ai_document_queue (async processing jobs per source) ──────────────────────
CREATE TABLE IF NOT EXISTS ai_document_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id       UUID NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
  -- pending | processing | done | dead_letter
  status          TEXT NOT NULL DEFAULT 'pending',
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  claim_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at      TIMESTAMPTZ,
  claimed_by      TEXT,
  error_last      TEXT,
  dead_lettered_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active job per source (pending or processing)
CREATE UNIQUE INDEX IF NOT EXISTS ai_document_queue_source_active_idx
  ON ai_document_queue (source_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS ai_document_queue_status_idx
  ON ai_document_queue (status, claim_at);

-- ── Extend wa_conversation_messages ────────────────────────────────────────────
ALTER TABLE wa_conversation_messages
  ADD COLUMN IF NOT EXISTS media_processing_status  TEXT,
  ADD COLUMN IF NOT EXISTS media_storage_key         TEXT,
  ADD COLUMN IF NOT EXISTS media_size_bytes          BIGINT,
  ADD COLUMN IF NOT EXISTS transcription_text        TEXT,
  ADD COLUMN IF NOT EXISTS image_description         TEXT,
  ADD COLUMN IF NOT EXISTS media_tokens_used         INTEGER,
  ADD COLUMN IF NOT EXISTS media_processed_at        TIMESTAMPTZ;

-- Index to check for pending/processing media within a conversation
CREATE INDEX IF NOT EXISTS wa_conv_messages_media_status_idx
  ON wa_conversation_messages (conversation_id, media_processing_status)
  WHERE media_processing_status IS NOT NULL;

-- ── ai_media_queue (async media download + understanding jobs) ────────────────
CREATE TABLE IF NOT EXISTS ai_media_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  -- UNIQUE: one job per message (idempotent webhook retries)
  message_id      UUID NOT NULL UNIQUE REFERENCES wa_conversation_messages(id) ON DELETE CASCADE,
  -- Meta Graph API media ID (used to download the file)
  wa_media_id     TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  -- pending | processing | done | unsupported | dead_letter
  status          TEXT NOT NULL DEFAULT 'pending',
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  claim_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at      TIMESTAMPTZ,
  claimed_by      TEXT,
  error_last      TEXT,
  dead_lettered_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_media_queue_status_idx
  ON ai_media_queue (status, claim_at);

CREATE INDEX IF NOT EXISTS ai_media_queue_conversation_idx
  ON ai_media_queue (conversation_id, status);
