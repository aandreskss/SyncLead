import { config } from "dotenv"
config({ path: ".env.local" })

import { Pool, neon } from "@neondatabase/serverless"

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const nsql = neon(process.env.DATABASE_URL!)

async function exec(query: string, label?: string): Promise<void> {
  try {
    await pool.query(query)
    if (label) console.log(`  ✓ ${label}`)
  } catch (e: any) {
    const msg: string = e?.message ?? ""
    if (
      msg.includes("already exists") ||
      msg.includes("42701") || // column already exists
      msg.includes("42P07") || // relation already exists
      msg.includes("42710")    // constraint already exists
    ) {
      if (label) console.log(`  · ${label} (already exists, skipped)`)
    } else {
      throw new Error(`SQL failed [${label ?? "?"}]: ${msg}`)
    }
  }
}

async function main() {
  console.log("─── Phase 10: Documents + Media ────────────────────────────────")

  // ── Extend ai_knowledge_sources ──────────────────────────────────────────────
  console.log("Extending ai_knowledge_sources...")
  await exec(`ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'available'`, "processing_status")
  await exec(`ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS processing_error TEXT`, "processing_error")
  await exec(`ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS content_fingerprint TEXT`, "content_fingerprint")
  await exec(`ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS page_count INTEGER`, "page_count")
  await exec(`ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS row_count INTEGER`, "row_count")
  await exec(`ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT`, "file_size_bytes")
  await exec(`ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS mime_type TEXT`, "mime_type")
  await exec(`ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS original_filename TEXT`, "original_filename")

  await exec(`CREATE INDEX IF NOT EXISTS ai_knowledge_sources_fingerprint_idx ON ai_knowledge_sources (org_id, content_fingerprint) WHERE content_fingerprint IS NOT NULL`, "fingerprint_idx")
  await exec(`CREATE INDEX IF NOT EXISTS ai_knowledge_sources_proc_status_idx ON ai_knowledge_sources (org_id, processing_status) WHERE source_type = 'file'`, "proc_status_idx")

  // ── ai_knowledge_chunks ───────────────────────────────────────────────────────
  console.log("Creating ai_knowledge_chunks...")
  await exec(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_id       UUID NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
      revision_id     UUID NOT NULL REFERENCES ai_knowledge_revisions(id) ON DELETE CASCADE,
      chunk_index     INTEGER NOT NULL,
      content         TEXT NOT NULL,
      content_length  INTEGER NOT NULL DEFAULT 0,
      location_ref    JSONB NOT NULL DEFAULT '{}',
      search_vector   TSVECTOR,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, "table created")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_chunks_dedup_idx ON ai_knowledge_chunks (source_id, revision_id, chunk_index)`, "dedup_idx")
  await exec(`CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_source_idx ON ai_knowledge_chunks (source_id)`, "source_idx")
  await exec(`CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_org_idx ON ai_knowledge_chunks (org_id)`, "org_idx")
  await exec(`CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_fts_idx ON ai_knowledge_chunks USING gin(search_vector)`, "fts_idx")

  // ── ai_document_queue ─────────────────────────────────────────────────────────
  console.log("Creating ai_document_queue...")
  await exec(`
    CREATE TABLE IF NOT EXISTS ai_document_queue (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_id       UUID NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
      status          TEXT NOT NULL DEFAULT 'pending',
      attempt_count   INTEGER NOT NULL DEFAULT 0,
      claim_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      claimed_at      TIMESTAMPTZ,
      claimed_by      TEXT,
      error_last      TEXT,
      dead_lettered_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, "table created")
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_document_queue_source_active_idx ON ai_document_queue (source_id) WHERE status IN ('pending', 'processing')`, "source_active_idx")
  await exec(`CREATE INDEX IF NOT EXISTS ai_document_queue_status_idx ON ai_document_queue (status, claim_at)`, "status_idx")

  // ── Extend wa_conversation_messages ──────────────────────────────────────────
  console.log("Extending wa_conversation_messages...")
  await exec(`ALTER TABLE wa_conversation_messages ADD COLUMN IF NOT EXISTS media_processing_status TEXT`, "media_processing_status")
  await exec(`ALTER TABLE wa_conversation_messages ADD COLUMN IF NOT EXISTS media_storage_key TEXT`, "media_storage_key")
  await exec(`ALTER TABLE wa_conversation_messages ADD COLUMN IF NOT EXISTS media_size_bytes BIGINT`, "media_size_bytes")
  await exec(`ALTER TABLE wa_conversation_messages ADD COLUMN IF NOT EXISTS transcription_text TEXT`, "transcription_text")
  await exec(`ALTER TABLE wa_conversation_messages ADD COLUMN IF NOT EXISTS image_description TEXT`, "image_description")
  await exec(`ALTER TABLE wa_conversation_messages ADD COLUMN IF NOT EXISTS media_tokens_used INTEGER`, "media_tokens_used")
  await exec(`ALTER TABLE wa_conversation_messages ADD COLUMN IF NOT EXISTS media_processed_at TIMESTAMPTZ`, "media_processed_at")
  await exec(`CREATE INDEX IF NOT EXISTS wa_conv_messages_media_status_idx ON wa_conversation_messages (conversation_id, media_processing_status) WHERE media_processing_status IS NOT NULL`, "media_status_idx")

  // ── ai_media_queue ────────────────────────────────────────────────────────────
  console.log("Creating ai_media_queue...")
  await exec(`
    CREATE TABLE IF NOT EXISTS ai_media_queue (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id UUID NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
      message_id      UUID NOT NULL UNIQUE REFERENCES wa_conversation_messages(id) ON DELETE CASCADE,
      wa_media_id     TEXT NOT NULL,
      mime_type       TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      attempt_count   INTEGER NOT NULL DEFAULT 0,
      claim_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      claimed_at      TIMESTAMPTZ,
      claimed_by      TEXT,
      error_last      TEXT,
      dead_lettered_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, "table created")
  await exec(`CREATE INDEX IF NOT EXISTS ai_media_queue_status_idx ON ai_media_queue (status, claim_at)`, "status_idx")
  await exec(`CREATE INDEX IF NOT EXISTS ai_media_queue_conversation_idx ON ai_media_queue (conversation_id, status)`, "conversation_idx")

  // ── Verify ────────────────────────────────────────────────────────────────────
  const tablesRes = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
  )
  const names = tablesRes.rows.map((r: any) => r.table_name)
  const required = ["ai_knowledge_chunks", "ai_document_queue", "ai_media_queue"]
  for (const t of required) {
    if (!names.includes(t)) throw new Error(`Table ${t} not found after migration!`)
  }

  const srcColsRes = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_knowledge_sources' ORDER BY ordinal_position"
  )
  const msgColsRes = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'wa_conversation_messages' ORDER BY ordinal_position"
  )

  const srcColNames = srcColsRes.rows.map((r: any) => r.column_name)
  const msgColNames = msgColsRes.rows.map((r: any) => r.column_name)

  for (const c of ["processing_status", "content_fingerprint", "file_size_bytes"]) {
    if (!srcColNames.includes(c)) throw new Error(`Column ai_knowledge_sources.${c} not found!`)
  }
  for (const c of ["media_processing_status", "transcription_text", "image_description"]) {
    if (!msgColNames.includes(c)) throw new Error(`Column wa_conversation_messages.${c} not found!`)
  }

  console.log(`\n✅ Phase 10 migration complete. Total tables: ${names.length}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
