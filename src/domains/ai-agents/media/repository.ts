import "server-only"
import { db } from "@/lib/db"
import { aiMediaQueue, waConversationMessages } from "@/lib/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"

// ─── Media queue ──────────────────────────────────────────────────────────────

export async function enqueueMediaMessage(params: {
  orgId: string
  conversationId: string
  messageId: string
  waMediaId: string
  mimeType: string
}): Promise<void> {
  // Mark the message as pending so the text job can detect it
  await db
    .update(waConversationMessages)
    .set({ mediaProcessingStatus: "pending" })
    .where(
      and(
        eq(waConversationMessages.id, params.messageId),
        eq(waConversationMessages.orgId, params.orgId),
      )
    )
    .catch(() => undefined)

  await db
    .insert(aiMediaQueue)
    .values({
      orgId: params.orgId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      waMediaId: params.waMediaId,
      mimeType: params.mimeType,
      status: "pending",
    })
    .onConflictDoNothing() // idempotent: duplicate webhook retry
    .catch(() => undefined)
}

export async function claimNextMediaJob(workerId: string) {
  const now = new Date()
  const rows = await db
    .select({
      id: aiMediaQueue.id,
      orgId: aiMediaQueue.orgId,
      conversationId: aiMediaQueue.conversationId,
      messageId: aiMediaQueue.messageId,
      waMediaId: aiMediaQueue.waMediaId,
      mimeType: aiMediaQueue.mimeType,
      attemptCount: aiMediaQueue.attemptCount,
    })
    .from(aiMediaQueue)
    .where(
      and(
        eq(aiMediaQueue.status, "pending"),
        sql`claim_at <= ${now}`
      )
    )
    .limit(1)

  const item = rows[0]
  if (!item) return null

  await db
    .update(aiMediaQueue)
    .set({
      status: "processing",
      claimedAt: now,
      claimedBy: workerId,
      attemptCount: item.attemptCount + 1,
      updatedAt: now,
    })
    .where(and(eq(aiMediaQueue.id, item.id), eq(aiMediaQueue.status, "pending")))

  return item
}

export async function markMediaJobDone(jobId: string): Promise<void> {
  await db
    .update(aiMediaQueue)
    .set({ status: "done", updatedAt: new Date() })
    .where(eq(aiMediaQueue.id, jobId))
}

export async function markMediaJobUnsupported(jobId: string, reason: string): Promise<void> {
  await db
    .update(aiMediaQueue)
    .set({ status: "unsupported", errorLast: reason, updatedAt: new Date() })
    .where(eq(aiMediaQueue.id, jobId))
}

export async function markMediaJobFailed(
  jobId: string,
  error: string,
  maxAttempts = 3,
): Promise<void> {
  const rows = await db
    .select({ attemptCount: aiMediaQueue.attemptCount })
    .from(aiMediaQueue)
    .where(eq(aiMediaQueue.id, jobId))
    .limit(1)

  const attempts = rows[0]?.attemptCount ?? 0
  const backoffMs = Math.min(2 ** attempts * 30_000, 300_000)

  if (attempts >= maxAttempts) {
    await db
      .update(aiMediaQueue)
      .set({
        status: "dead_letter",
        errorLast: error,
        deadLetteredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiMediaQueue.id, jobId))
  } else {
    await db
      .update(aiMediaQueue)
      .set({
        status: "pending",
        errorLast: error,
        claimAt: new Date(Date.now() + backoffMs),
        updatedAt: new Date(),
      })
      .where(eq(aiMediaQueue.id, jobId))
  }
}

// ─── Message media state ──────────────────────────────────────────────────────

export async function updateMessageMediaResult(params: {
  orgId: string
  messageId: string
  mediaProcessingStatus: string
  mediaStorageKey?: string
  mediaSizeBytes?: number
  imageDescription?: string
  transcriptionText?: string
  mediaTokensUsed?: number
}): Promise<void> {
  await db
    .update(waConversationMessages)
    .set({
      mediaProcessingStatus: params.mediaProcessingStatus,
      mediaStorageKey: params.mediaStorageKey ?? null,
      mediaSizeBytes: params.mediaSizeBytes ?? null,
      imageDescription: params.imageDescription ?? null,
      transcriptionText: params.transcriptionText ?? null,
      mediaTokensUsed: params.mediaTokensUsed ?? null,
      mediaProcessedAt: new Date(),
    })
    .where(
      and(
        eq(waConversationMessages.id, params.messageId),
        eq(waConversationMessages.orgId, params.orgId),
      )
    )
}

/**
 * Check whether a conversation has any media messages that are still
 * pending or being processed. The text job must wait for these to complete.
 */
export async function hasPendingMediaInConversation(
  conversationId: string,
  orgId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: aiMediaQueue.id })
    .from(aiMediaQueue)
    .where(
      and(
        eq(aiMediaQueue.conversationId, conversationId),
        eq(aiMediaQueue.orgId, orgId),
        inArray(aiMediaQueue.status, ["pending", "processing"]),
      )
    )
    .limit(1)

  return rows.length > 0
}
