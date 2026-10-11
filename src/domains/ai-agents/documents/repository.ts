import "server-only"
import { db } from "@/lib/db"
import { aiKnowledgeSources, aiKnowledgeRevisions, aiKnowledgeChunks, aiDocumentQueue } from "@/lib/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import { createHash } from "crypto"

// ─── Source management ────────────────────────────────────────────────────────

export async function getSourceForProcessing(sourceId: string, orgId: string) {
  const rows = await db
    .select({
      id: aiKnowledgeSources.id,
      orgId: aiKnowledgeSources.orgId,
      sourceType: aiKnowledgeSources.sourceType,
      fileKey: aiKnowledgeSources.fileKey,
      mimeType: aiKnowledgeSources.mimeType,
      contentFingerprint: aiKnowledgeSources.contentFingerprint,
      pageCount: aiKnowledgeSources.pageCount,
      rowCount: aiKnowledgeSources.rowCount,
      status: aiKnowledgeSources.status,
      processingStatus: aiKnowledgeSources.processingStatus,
    })
    .from(aiKnowledgeSources)
    .where(and(eq(aiKnowledgeSources.id, sourceId), eq(aiKnowledgeSources.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function markSourceProcessing(sourceId: string, orgId: string): Promise<void> {
  await db
    .update(aiKnowledgeSources)
    .set({ processingStatus: "processing", processingError: null, updatedAt: new Date() })
    .where(and(eq(aiKnowledgeSources.id, sourceId), eq(aiKnowledgeSources.orgId, orgId)))
}

export async function markSourceAvailable(
  sourceId: string,
  orgId: string,
  opts: { pageCount?: number; rowCount?: number; fingerprint: string },
): Promise<void> {
  await db
    .update(aiKnowledgeSources)
    .set({
      processingStatus: "available",
      processingError: null,
      contentFingerprint: opts.fingerprint,
      pageCount: opts.pageCount ?? null,
      rowCount: opts.rowCount ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(aiKnowledgeSources.id, sourceId), eq(aiKnowledgeSources.orgId, orgId)))
}

export async function markSourceError(
  sourceId: string,
  orgId: string,
  error: string,
): Promise<void> {
  await db
    .update(aiKnowledgeSources)
    .set({ processingStatus: "error", processingError: error, updatedAt: new Date() })
    .where(and(eq(aiKnowledgeSources.id, sourceId), eq(aiKnowledgeSources.orgId, orgId)))
}

// ─── Revision management ──────────────────────────────────────────────────────

export async function getLatestRevision(sourceId: string) {
  const rows = await db
    .select({ id: aiKnowledgeRevisions.id, revisionNumber: aiKnowledgeRevisions.revisionNumber })
    .from(aiKnowledgeRevisions)
    .where(eq(aiKnowledgeRevisions.sourceId, sourceId))
    .orderBy(sql`revision_number DESC`)
    .limit(1)
  return rows[0] ?? null
}

export async function createRevision(params: {
  orgId: string
  sourceId: string
  content: string
}): Promise<{ id: string; revisionNumber: number }> {
  const existing = await getLatestRevision(params.sourceId)
  const revisionNumber = (existing?.revisionNumber ?? 0) + 1
  const contentHash = createHash("sha256").update(params.content).digest("hex")

  const [rev] = await db
    .insert(aiKnowledgeRevisions)
    .values({
      orgId: params.orgId,
      sourceId: params.sourceId,
      revisionNumber,
      contentHash,
      content: params.content,
    })
    .returning({ id: aiKnowledgeRevisions.id, revisionNumber: aiKnowledgeRevisions.revisionNumber })

  return rev
}

// ─── Chunk storage ────────────────────────────────────────────────────────────

export async function upsertChunks(params: {
  orgId: string
  sourceId: string
  revisionId: string
  chunks: Array<{
    chunkIndex: number
    content: string
    locationRef: Record<string, unknown>
  }>
}): Promise<void> {
  if (params.chunks.length === 0) return

  // Insert chunks in batches of 50 to avoid hitting Neon's parameter limit
  const BATCH = 50
  for (let i = 0; i < params.chunks.length; i += BATCH) {
    const batch = params.chunks.slice(i, i + BATCH)
    await db
      .insert(aiKnowledgeChunks)
      .values(
        batch.map((c) => ({
          orgId: params.orgId,
          sourceId: params.sourceId,
          revisionId: params.revisionId,
          chunkIndex: c.chunkIndex,
          content: c.content,
          contentLength: c.content.length,
          locationRef: c.locationRef,
        }))
      )
      .onConflictDoNothing()
  }

  // Update tsvector for the inserted chunks using Spanish FTS configuration.
  // This runs as a separate UPDATE to avoid inline RETURNING complexity.
  await db.execute(
    sql`
      UPDATE ai_knowledge_chunks
      SET search_vector = to_tsvector('spanish', content)
      WHERE source_id = ${params.sourceId}
        AND revision_id = ${params.revisionId}
        AND search_vector IS NULL
    `
  )
}

export async function deleteChunksForSource(sourceId: string): Promise<void> {
  await db.delete(aiKnowledgeChunks).where(eq(aiKnowledgeChunks.sourceId, sourceId))
}

export async function deleteChunksForRevision(revisionId: string): Promise<void> {
  await db.delete(aiKnowledgeChunks).where(eq(aiKnowledgeChunks.revisionId, revisionId))
}

// ─── Document queue management ────────────────────────────────────────────────

export async function enqueueDocument(orgId: string, sourceId: string): Promise<void> {
  await db
    .insert(aiDocumentQueue)
    .values({ orgId, sourceId, status: "pending", claimAt: new Date() })
    .onConflictDoNothing() // idempotent: active job already exists
    .catch(() => undefined)
}

export async function claimNextDocumentJob(workerId: string) {
  const now = new Date()
  const rows = await db
    .select({
      id: aiDocumentQueue.id,
      orgId: aiDocumentQueue.orgId,
      sourceId: aiDocumentQueue.sourceId,
      attemptCount: aiDocumentQueue.attemptCount,
    })
    .from(aiDocumentQueue)
    .where(
      and(
        eq(aiDocumentQueue.status, "pending"),
        sql`claim_at <= ${now}`
      )
    )
    .limit(1)

  const item = rows[0]
  if (!item) return null

  await db
    .update(aiDocumentQueue)
    .set({
      status: "processing",
      claimedAt: now,
      claimedBy: workerId,
      attemptCount: item.attemptCount + 1,
      updatedAt: now,
    })
    .where(and(eq(aiDocumentQueue.id, item.id), eq(aiDocumentQueue.status, "pending")))

  return item
}

export async function markDocumentJobDone(jobId: string): Promise<void> {
  await db
    .update(aiDocumentQueue)
    .set({ status: "done", updatedAt: new Date() })
    .where(eq(aiDocumentQueue.id, jobId))
}

export async function markDocumentJobFailed(
  jobId: string,
  error: string,
  maxAttempts = 3,
): Promise<void> {
  const rows = await db
    .select({ attemptCount: aiDocumentQueue.attemptCount })
    .from(aiDocumentQueue)
    .where(eq(aiDocumentQueue.id, jobId))
    .limit(1)

  const attempts = rows[0]?.attemptCount ?? 0
  const backoffMs = Math.min(2 ** attempts * 30_000, 600_000)

  if (attempts >= maxAttempts) {
    await db
      .update(aiDocumentQueue)
      .set({
        status: "dead_letter",
        errorLast: error,
        deadLetteredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiDocumentQueue.id, jobId))
  } else {
    await db
      .update(aiDocumentQueue)
      .set({
        status: "pending",
        errorLast: error,
        claimAt: new Date(Date.now() + backoffMs),
        updatedAt: new Date(),
      })
      .where(eq(aiDocumentQueue.id, jobId))
  }
}

// ─── FTS retrieval ────────────────────────────────────────────────────────────

export interface RetrievedChunk {
  sourceId: string
  revisionId: string
  chunkIndex: number
  content: string
  locationRef: Record<string, unknown>
  rank: number
}

/**
 * Full-text search over chunks authorized for this episode.
 * Only returns chunks from active (non-revoked) sources.
 * Revoked sources are excluded even if their IDs appear in knowledgeSnapshot.
 */
export async function searchChunks(params: {
  orgId: string
  authorizedSourceIds: string[]
  query: string
  limit?: number
}): Promise<RetrievedChunk[]> {
  if (params.authorizedSourceIds.length === 0 || !params.query.trim()) return []

  // Latest revision per source — join to get only the most recent chunks
  const rows = await db.execute(sql`
    WITH latest_revisions AS (
      SELECT DISTINCT ON (source_id) id AS revision_id, source_id
      FROM ai_knowledge_revisions
      WHERE source_id = ANY(${params.authorizedSourceIds}::uuid[])
      ORDER BY source_id, revision_number DESC
    ),
    active_sources AS (
      SELECT id FROM ai_knowledge_sources
      WHERE org_id = ${params.orgId}
        AND id = ANY(${params.authorizedSourceIds}::uuid[])
        AND status = 'active'
        AND processing_status = 'available'
    )
    SELECT
      c.source_id    AS "sourceId",
      c.revision_id  AS "revisionId",
      c.chunk_index  AS "chunkIndex",
      c.content,
      c.location_ref AS "locationRef",
      ts_rank_cd(c.search_vector, query, 32) AS rank
    FROM ai_knowledge_chunks c
    JOIN latest_revisions lr ON lr.revision_id = c.revision_id AND lr.source_id = c.source_id
    JOIN active_sources   as_ ON as_.id = c.source_id
    , websearch_to_tsquery('spanish', ${params.query}) AS query
    WHERE c.org_id = ${params.orgId}
      AND c.search_vector @@ query
    ORDER BY rank DESC
    LIMIT ${params.limit ?? 8}
  `)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows as unknown as any[]).map((r): RetrievedChunk => ({
    sourceId: String(r.sourceId),
    revisionId: String(r.revisionId),
    chunkIndex: Number(r.chunkIndex),
    content: String(r.content),
    locationRef: (r.locationRef as Record<string, unknown>) ?? {},
    rank: parseFloat(String(r.rank ?? "0")),
  }))
}
