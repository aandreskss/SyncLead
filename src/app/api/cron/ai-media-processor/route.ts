import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { withJobRun } from "@/lib/jobs/runner"
import { db } from "@/lib/db"
import { waBusinessAccounts, waPhoneNumbers, waConversations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { processMediaItem } from "@/domains/ai-agents/media/processor"
import {
  claimNextMediaJob,
  markMediaJobDone,
  markMediaJobUnsupported,
  markMediaJobFailed,
  updateMessageMediaResult,
} from "@/domains/ai-agents/media/repository"
import { decryptTokenVersioned } from "@/lib/crypto"
import Anthropic from "@anthropic-ai/sdk"
import { MediaUrlNotAllowedError } from "@/domains/ai-agents/media/allowlist"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const run = await withJobRun("ai-media-processor", async (ctx) => {
    const job = await claimNextMediaJob(ctx.correlationId)
    if (!job) return { itemsProcessed: 0 }

    // ── Resolve WABA access token ───────────────────────────────────────────────
    // orgId filter is required — ensures tenant isolation even if queue data is corrupt.
    const convRows = await db
      .select({
        phoneNumberId: waConversations.phoneNumberId,
      })
      .from(waConversations)
      .where(and(eq(waConversations.id, job.conversationId), eq(waConversations.orgId, job.orgId)))
      .limit(1)

    const phoneNumberId = convRows[0]?.phoneNumberId
    if (!phoneNumberId) {
      await markMediaJobFailed(job.id, "conversation_or_phone_not_found", 1)
      return { itemsProcessed: 0, itemsFailed: 1 }
    }

    const phoneRows = await db
      .select({
        accessTokenEnc: waBusinessAccounts.accessTokenEnc,
        keyVersion: waBusinessAccounts.keyVersion,
      })
      .from(waPhoneNumbers)
      .innerJoin(waBusinessAccounts, eq(waPhoneNumbers.wabaAccountId, waBusinessAccounts.id))
      .where(eq(waPhoneNumbers.id, phoneNumberId))
      .limit(1)

    const tokenInfo = phoneRows[0]
    if (!tokenInfo?.accessTokenEnc) {
      await markMediaJobFailed(job.id, "waba_token_not_found", 1)
      return { itemsProcessed: 0, itemsFailed: 1 }
    }

    const anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    try {
      const result = await processMediaItem({
        waMediaId: job.waMediaId,
        mimeType: job.mimeType,
        orgId: job.orgId,
        accessTokenEnc: tokenInfo.accessTokenEnc,
        keyVersion: tokenInfo.keyVersion,
        anthropicClient,
      })

      if (result.status === "unsupported") {
        await updateMessageMediaResult({
          orgId: job.orgId,
          messageId: job.messageId,
          mediaProcessingStatus: "unsupported",
        })
        await markMediaJobUnsupported(job.id, result.unsupportedReason ?? "unsupported_type")
        return { itemsProcessed: 1, unsupported: true }
      }

      await updateMessageMediaResult({
        orgId: job.orgId,
        messageId: job.messageId,
        mediaProcessingStatus: "done",
        mediaStorageKey: result.storageKey,
        mediaSizeBytes: result.sizeBytes,
        imageDescription: result.imageDescription,
        transcriptionText: result.transcriptionText,
        mediaTokensUsed: result.mediaTokensUsed,
      })

      await markMediaJobDone(job.id)
      return { itemsProcessed: 1, hasDescription: !!result.imageDescription }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)

      // URL-not-allowed errors are permanent — don't retry
      if (err instanceof MediaUrlNotAllowedError) {
        await updateMessageMediaResult({
          orgId: job.orgId,
          messageId: job.messageId,
          mediaProcessingStatus: "error",
        })
        await markMediaJobFailed(job.id, msg, 1)
        return { itemsProcessed: 0, itemsFailed: 1, urlNotAllowed: true }
      }

      await updateMessageMediaResult({
        orgId: job.orgId,
        messageId: job.messageId,
        mediaProcessingStatus: "error",
      })
      await markMediaJobFailed(job.id, msg)
      return { itemsProcessed: 0, itemsFailed: 1 }
    }
  })

  return NextResponse.json(run)
}
