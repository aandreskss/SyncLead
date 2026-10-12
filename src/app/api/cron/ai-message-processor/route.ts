import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { withJobRun } from "@/lib/jobs/runner"
import { db } from "@/lib/db"
import {
  aiAgentVersions,
  aiAgents,
  aiAgentDeployments,
  aiMessageQueue,
  waConversations,
  waConversationMessages,
  waPhoneNumbers,
  waBusinessAccounts,
  leads,
} from "@/lib/db/schema"
import { eq, and, asc } from "drizzle-orm"
import { hasPendingMediaInConversation } from "@/domains/ai-agents/media/repository"
import { runEngine } from "@/domains/ai-agents/engine"
import {
  recordUsage,
  endEpisode,
  claimNextQueueItem,
  markQueueItemDone,
  markQueueItemFailed,
  markQueueItemDeadLetter,
  insertConversationMessage,
  updateConversationSummary,
  recoverOrphanedQueueItems,
  cancelPendingAiMessages,
} from "@/domains/ai-agents/repository"
import {
  checkBudgetAndReserve,
  settleReservation,
  releaseOrphanedReservations,
} from "@/domains/ai-agents/budget-repository"
import {
  resolveModelPricingTier,
  computeCostMillicents,
  computeConservativeReservationMillicents,
} from "@/domains/ai-agents/cost-calculator"
import { resolveEpisodeForConversation } from "@/domains/ai-agents/router"
import { checkSendEligibility } from "@/domains/wa-cloud/eligibility"
import { updateOutboundMessageStatus } from "@/domains/wa-cloud/repository"
import { CloudApiClient } from "@/domains/wa-cloud/client"
import { decryptTokenVersioned } from "@/lib/crypto"
import type { AgentConfig } from "@/domains/ai-agents/types"
import type { LLMMessage } from "@/lib/llm/provider"
import { defaultProvider } from "@/lib/llm"
import type { AiPricingTier } from "@/lib/db/schema"

export const dynamic = "force-dynamic"
// 60s: engine uses ≤25s; remaining budget covers DB I/O, send attempt, and cleanup.
export const maxDuration = 60

const MAX_ATTEMPTS = 5
// History window: keep last N messages in the engine context
const HISTORY_WINDOW = 10
// When conversation reaches this many messages, start using the summary
const SUMMARY_TRIGGER = 12
// Regenerate summary every N total messages
const SUMMARY_INTERVAL = 8

// ─── Summary generation ───────────────────────────────────────────────────────

async function generateAndStoreSummary(
  orgId: string,
  conversationId: string,
  recentMessages: Array<{ role: string; content: string }>
): Promise<void> {
  try {
    const historyText = recentMessages
      .map((m) => `${m.role === "user" ? "Cliente" : "Agente"}: ${m.content}`)
      .join("\n")

    const summaryPrompt =
      "Genera un resumen estructurado de esta conversación. Incluye:\n" +
      "- Datos confirmados del contacto (nombre, teléfono, email, ciudad, intereses)\n" +
      "- Estado actual (qué se discutió, qué necesita el contacto)\n" +
      "- Decisiones o acuerdos pendientes\n\n" +
      "Sé conciso. Máximo 200 palabras. Solo incluye información confirmada por el cliente, no inferida.\n\n" +
      "Conversación:\n" + historyText

    const result = await defaultProvider.chat({
      model: "claude-haiku-4-5-20251001",
      systemPrompt: "Eres un asistente que genera resúmenes operativos de conversaciones de ventas. Responde solo con el resumen, sin preámbulos.",
      messages: [{ role: "user", content: summaryPrompt }],
      tools: [],
      maxTokens: 400,
    })

    const summaryText = result.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim()

    if (summaryText) {
      await updateConversationSummary(conversationId, orgId, summaryText)
    }
  } catch {
    // Non-fatal — summary generation failure never blocks the main flow
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const run = await withJobRun("ai-message-processor", async (ctx) => {
    // ── Step 0: Recover orphaned queue items ───────────────────────────
    // Items stuck in 'processing' for > 10 minutes are reset to 'enqueued'.
    // This catches workers that crashed or hit the function time limit without
    // completing their run. Runs before claiming to avoid processing the same
    // conversation twice in the same invocation.
    await recoverOrphanedQueueItems().catch(() => undefined)

    // ── Step 0.5: Release orphaned budget reservations ─────────────────
    // Reservations stuck in 'reserved' > 30min have no corresponding engine run.
    // Release them before claiming to prevent budget overcounting.
    await releaseOrphanedReservations().catch(() => undefined)

    // ── Step 1: Claim one queue item (two-step optimistic lock) ────────
    // The claim query filters by claimAt <= NOW() (burst debounce) and
    // excludes conversations already being processed (serialization).
    // The returned item carries a lease token for subsequent fencing checks.
    const claimed = await claimNextQueueItem(ctx.correlationId)
    if (!claimed) {
      console.log("[processor] no queue items to process")
      return { itemsProcessed: 0 }
    }
    console.log("[processor] claimed item:", claimed.id, "conv:", claimed.conversationId, "attempt:", claimed.attemptCount)

    const leaseToken = claimed.leaseToken ?? undefined
    const engineStart = Date.now()
    let processed = 0
    // Phase 09 — declared outside try so they're accessible in the catch block
    let reservationId: string | undefined = undefined
    let pricingTier: AiPricingTier | null = null

    try {
      // ── Step 1.5: Media gate ────────────────────────────────────────
      // If there are media messages in this conversation that are still pending
      // or being processed, release the claim and re-enqueue with a short delay.
      // This ensures the AI sees the image description / transcription before replying.
      const pendingMedia = await hasPendingMediaInConversation(
        claimed.conversationId,
        claimed.orgId,
      ).catch(() => false)

      if (pendingMedia) {
        // Re-enqueue with a 5-second delay so the media processor can finish
        // before the next text-job pick-up attempt.
        const retryAt = new Date(Date.now() + 5_000)
        await db
          .update(aiMessageQueue)
          .set({ status: "enqueued", claimAt: retryAt, updatedAt: new Date() })
          .where(
            leaseToken
              ? and(eq(aiMessageQueue.id, claimed.id), eq(aiMessageQueue.leaseToken, leaseToken))
              : eq(aiMessageQueue.id, claimed.id)
          )
          .catch(() => undefined)
        return { itemsProcessed: 0, mediaPending: true }
      }

      // ── Step 2: Load conversation ──────────────────────────────────
      const conversationRows = await db
        .select({
          id: waConversations.id,
          orgId: waConversations.orgId,
          controlMode: waConversations.controlMode,
          leadId: waConversations.leadId,
          deploymentId: waConversations.deploymentId,
          summary: waConversations.summary,
          messageCount: waConversations.messageCount,
          phoneNumberId: waConversations.phoneNumberId,
          customerPhone: waConversations.customerPhone,
        })
        .from(waConversations)
        .where(eq(waConversations.id, claimed.conversationId))
        .limit(1)

      const conversation = conversationRows[0]
      if (!conversation) {
        await markQueueItemFailed(claimed.id, "conversation_not_found", new Date(), leaseToken)
        return { itemsProcessed: 0, itemsFailed: 1 }
      }

      // Skip if conversation is not in AI control mode
      if (conversation.controlMode !== "ai") {
        await markQueueItemDone(claimed.id, leaseToken)
        return { itemsProcessed: 1 }
      }

      // ── Step 2.5: Backfill deploymentId if missing ─────────────────
      // Conversations created before the webhook was updated to pass deploymentId
      // will have deploymentId = null. Look it up by phone number and backfill.
      if (!conversation.deploymentId && conversation.phoneNumberId) {
        const depRows = await db
          .select({ id: aiAgentDeployments.id })
          .from(aiAgentDeployments)
          .where(
            and(
              eq(aiAgentDeployments.phoneNumberId, conversation.phoneNumberId),
              eq(aiAgentDeployments.orgId, claimed.orgId),
              eq(aiAgentDeployments.active, true),
            )
          )
          .limit(1)
          .catch(() => [])

        const dep = depRows[0]
        if (dep) {
          conversation.deploymentId = dep.id
          await db
            .update(waConversations)
            .set({ deploymentId: dep.id, updatedAt: new Date() })
            .where(eq(waConversations.id, claimed.conversationId))
            .catch(() => undefined)
        }
      }

      // ── Step 3: Resolve episode via router ──────────────────────────
      // Reuses an active episode or creates a new one by evaluating campaign
      // rules. Returns null if no agent can handle this conversation, in which
      // case we escalate to human visibility.
      const resolved = await resolveEpisodeForConversation({
        orgId: claimed.orgId,
        conversationId: claimed.conversationId,
        deploymentId: conversation.deploymentId ?? null,
        leadId: conversation.leadId ?? null,
        triggerMessageId: claimed.incomingMessageId,
      })

      if (!resolved) {
        // No agent available (no deployment, no published version, or no matching
        // campaign rule and no catch-all). Escalate to human visibility.
        await db
          .update(waConversations)
          .set({ controlMode: "waiting_human", updatedAt: new Date() })
          .where(
            and(
              eq(waConversations.id, claimed.conversationId),
              eq(waConversations.orgId, claimed.orgId),
            )
          )
          .catch(() => undefined)
        await markQueueItemDone(claimed.id, leaseToken)
        return { itemsProcessed: 1 }
      }

      const episode = resolved

      // ── Step 4: Load agent version + agent ─────────────────────────
      const versionRows = await db
        .select()
        .from(aiAgentVersions)
        .where(
          and(
            eq(aiAgentVersions.id, episode.agentVersionId),
            eq(aiAgentVersions.orgId, claimed.orgId)
          )
        )
        .limit(1)

      const agentVersion = versionRows[0]
      if (!agentVersion) {
        await markQueueItemFailed(claimed.id, "agent_version_not_found", new Date(), leaseToken)
        return { itemsProcessed: 0, itemsFailed: 1 }
      }

      const agentRows = await db
        .select()
        .from(aiAgents)
        .where(
          and(
            eq(aiAgents.id, (agentVersion as typeof agentVersion & { agentId: string }).agentId),
            eq(aiAgents.orgId, claimed.orgId)
          )
        )
        .limit(1)

      const agent = agentRows[0]
      if (!agent) {
        await markQueueItemFailed(claimed.id, "agent_not_found", new Date(), leaseToken)
        return { itemsProcessed: 0, itemsFailed: 1 }
      }

      // ── Step 3.5: Budget check + reservation ───────────────────────────
      // Resolve pricing tier for the agent's actual model (available now after Step 4).
      // If no pricing tier is configured, skip budget check (unlimited with no cost tracking).
      pricingTier = await resolveModelPricingTier("anthropic", agent.model).catch(() => null)

      if (pricingTier) {
        // Conservative reservation: estimate 2000 input tokens (history) + maxTokens output.
        const estimatedMillicents = computeConservativeReservationMillicents(
          2000,
          agent.maxTokens,
          pricingTier,
        )

        const budgetResult = await checkBudgetAndReserve({
          orgId: claimed.orgId,
          queueItemId: claimed.id,
          episodeId: episode.episodeId,
          conversationId: claimed.conversationId,
          estimatedMillicents,
        })

        if (!budgetResult.allowed) {
          // Budget exhausted — escalate to human visibility so the conversation
          // is not silently invisible. Do not leave it stuck in AI control.
          await db
            .update(waConversations)
            .set({ controlMode: "waiting_human", updatedAt: new Date() })
            .where(
              and(
                eq(waConversations.id, claimed.conversationId),
                eq(waConversations.orgId, claimed.orgId),
              )
            )
            .catch(() => undefined)

          await endEpisode(episode.episodeId, claimed.orgId, {
            exitReason: "budget",
            exitDetail: `Budget limit exceeded: ${budgetResult.reason}`,
          }).catch(() => undefined)

          await markQueueItemDone(claimed.id, leaseToken)
          return { itemsProcessed: 1, budgetExhausted: true }
        }

        reservationId = budgetResult.reservationId
      }

      // ── Step 5: Load message history ────────────────────────────────
      const historyLimit = conversation.messageCount > SUMMARY_TRIGGER
        ? Math.min(HISTORY_WINDOW, 8)
        : HISTORY_WINDOW

      const recentMessages = await db
        .select({
          role: waConversationMessages.role,
          content: waConversationMessages.content,
          contentType: waConversationMessages.contentType,
          imageDescription: waConversationMessages.imageDescription,
          transcriptionText: waConversationMessages.transcriptionText,
          mediaProcessingStatus: waConversationMessages.mediaProcessingStatus,
        })
        .from(waConversationMessages)
        .where(
          and(
            eq(waConversationMessages.conversationId, claimed.conversationId),
            eq(waConversationMessages.orgId, claimed.orgId)
          )
        )
        .orderBy(asc(waConversationMessages.createdAt))
        .limit(historyLimit)

      const history: LLMMessage[] = recentMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          let content = m.content || ""

          // Enrich media messages with processed descriptions (untrusted user content)
          if (m.imageDescription) {
            content = content
              ? `${content}\n[Imagen: ${m.imageDescription}]`
              : `[Imagen: ${m.imageDescription}]`
          } else if (m.transcriptionText) {
            content = content
              ? `${content}\n[Audio: ${m.transcriptionText}]`
              : `[Audio: ${m.transcriptionText}]`
          } else if (
            m.mediaProcessingStatus === "unsupported" &&
            m.contentType !== "text"
          ) {
            content = content || `[Mensaje de ${m.contentType ?? "media"} — no procesable]`
          }

          return { role: m.role as "user" | "assistant", content }
        })

      // ── Step 6: Lead context ────────────────────────────────────────
      let leadContext = undefined
      if (conversation.leadId) {
        const leadRows = await db
          .select({
            name: leads.name,
            phone: leads.phone,
            email: leads.email,
          })
          .from(leads)
          .where(eq(leads.id, conversation.leadId))
          .limit(1)

        if (leadRows[0]) {
          leadContext = {
            name: leadRows[0].name ?? undefined,
            phone: leadRows[0].phone ?? undefined,
            email: leadRows[0].email ?? undefined,
          }
        }
      }

      // ── Step 7: Parse agent config ──────────────────────────────────
      const snapshot = agentVersion.snapshot as Record<string, unknown>
      const agentConfig = (snapshot.agentConfig ?? snapshot) as AgentConfig

      // ── Step 7.5: Greeting guard ────────────────────────────────────
      // Weak models (Gemini Flash, small Llamas) ignore system-prompt instructions
      // and repeat the greeting every turn. Injecting the presentation as a
      // synthetic first assistant message makes the model literally SEE that the
      // greeting was already sent, which is reliable across all model families.
      // Only inject when history has no prior assistant message AND the conversation
      // is past its first turn (messageCount > 1 means at least one exchange happened).
      {
        const hasAssistantMsg = history.some(m => m.role === "assistant")
        const presentation = agentConfig.personalidad?.presentation
        const isPastFirstTurn = (conversation.messageCount ?? 0) > 1
        if (!hasAssistantMsg && isPastFirstTurn && presentation) {
          const resolved = presentation
            .replace(/\{\{nombre_empresa\}\}/gi, agentConfig.personalidad?.internalName ?? "")
          history.unshift({ role: "assistant", content: resolved })
        }
      }

      // ── Step 8: Run engine ──────────────────────────────────────────
      const llmProvider = (agentConfig as AgentConfig).personalidad?.llmProvider ?? "anthropic"
      console.log("[processor] calling engine provider:", llmProvider, "model:", agent.model, "conv:", claimed.conversationId)
      const engineResult = await runEngine({
        orgId: claimed.orgId,
        agentConfig,
        model: agent.model,
        maxTokens: agent.maxTokens,
        episodeId: episode.episodeId,
        conversationId: claimed.conversationId,
        leadId: conversation.leadId ?? null,
        leadContext,
        conversationSummary: conversation.summary ?? undefined,
        history,
        sandbox: false,
        queueItemId: claimed.id,
      })

      const latencyMs = Date.now() - engineStart
      console.log("[processor] engine done stopReason:", engineResult.stopReason, "respLen:", engineResult.response?.length ?? 0, "latencyMs:", latencyMs)

      // ── Step 9: Persist AI reply ────────────────────────────────────
      // Insert with status "pending" — updated to "accepted" after successful send.
      let insertedMessageId: string | null = null
      if (engineResult.response) {
        const insertedMsg = await insertConversationMessage(claimed.orgId, claimed.conversationId, {
          direction: "outbound",
          role: "assistant",
          content: engineResult.response,
          contentType: "text",
          isAi: true,
          tokenCount: engineResult.totalOutputTokens,
          status: "pending",
        })
        insertedMessageId = insertedMsg.id
      }

      // ── Step 10: Pre-send controlMode re-check (takeover guard) ────
      // A human operator may have taken over during the engine run (up to 25s).
      // Re-reading controlMode minimises the race window before sending.
      // IMPORTANT: a send already accepted by Meta cannot be retracted — this
      // guard only prevents new sends, not in-flight ones.
      if (insertedMessageId && engineResult.response && conversation.phoneNumberId && conversation.customerPhone) {
        const freshRows = await db
          .select({ controlMode: waConversations.controlMode })
          .from(waConversations)
          .where(eq(waConversations.id, claimed.conversationId))
          .limit(1)
          .catch(() => null)

        const currentMode = freshRows?.[0]?.controlMode ?? conversation.controlMode

        if (currentMode !== "ai") {
          // Human took over during engine run — discard the pending AI reply.
          await cancelPendingAiMessages(claimed.conversationId, claimed.orgId)
        } else {
          await sendReplyToMeta({
            orgId: claimed.orgId,
            conversationId: claimed.conversationId,
            messageRowId: insertedMessageId,
            phoneNumberRowId: conversation.phoneNumberId,
            customerPhone: conversation.customerPhone,
            text: engineResult.response,
          })
        }
      }

      // ── Step 11: Record usage with cost data + settle reservation ─────
      const usageRecord =
        engineResult.totalInputTokens > 0 || engineResult.totalOutputTokens > 0
          ? await (async () => {
              // Use the pricing tier resolved in Step 3.5, or try to resolve it now
              // in case the model chosen by the engine differs from agent.model.
              const tier =
                pricingTier ??
                (await resolveModelPricingTier(
                  "anthropic",
                  engineResult.modelUsed,
                ).catch(() => null))

              const costData = tier
                ? computeCostMillicents(
                    {
                      inputTokens: engineResult.totalInputTokens,
                      outputTokens: engineResult.totalOutputTokens,
                      cacheReadTokens: engineResult.totalCacheReadTokens,
                      cacheWriteTokens: engineResult.totalCacheWriteTokens,
                    },
                    tier,
                  )
                : null

              return recordUsage(claimed.orgId, {
                episodeId: episode.episodeId,
                conversationId: claimed.conversationId,
                provider: "anthropic",
                model: engineResult.modelUsed,
                inputTokens: engineResult.totalInputTokens,
                outputTokens: engineResult.totalOutputTokens,
                latencyMs,
                cacheReadTokens: engineResult.totalCacheReadTokens,
                cacheWriteTokens: engineResult.totalCacheWriteTokens,
                isSandbox: false,
                // attemptCount is incremented before the engine runs; >1 = retry after failure
                callType: claimed.attemptCount > 1 ? "retry" : "inference",
                ...(costData && {
                  inputCostMillicents: costData.inputCostMillicents,
                  outputCostMillicents: costData.outputCostMillicents,
                  cacheReadCostMillicents: costData.cacheReadCostMillicents,
                  cacheWriteCostMillicents: costData.cacheWriteCostMillicents,
                  totalCostMillicents: costData.totalCostMillicents,
                  pricingTierId: tier?.id,
                }),
              }).catch(() => undefined)
            })()
          : undefined

      // Settle the budget reservation (links to actual usage record)
      if (reservationId) {
        await settleReservation({
          queueItemId: claimed.id,
          orgId: claimed.orgId,
          status: "consumed",
          usageRecordId: usageRecord?.id,
        }).catch(() => undefined)
      }

      // ── Step 12: Close episode if terminal ─────────────────────────
      if (
        engineResult.stopReason === "error" ||
        engineResult.stopReason === "limit" ||
        engineResult.stopReason === "transfer"
      ) {
        const exitReason =
          engineResult.stopReason === "transfer"
            ? "transfer_rule"
            : engineResult.stopReason === "limit"
            ? "limit"
            : "error"

        await endEpisode(episode.episodeId, claimed.orgId, {
          exitReason,
          tokenCountIn: engineResult.totalInputTokens,
          tokenCountOut: engineResult.totalOutputTokens,
        }).catch(() => undefined)
      }

      // ── Step 13: Regenerate summary when interval triggers ────────
      const newCount = conversation.messageCount + 1
      if (newCount >= SUMMARY_TRIGGER && newCount % SUMMARY_INTERVAL === 0) {
        db.select({ role: waConversationMessages.role, content: waConversationMessages.content })
          .from(waConversationMessages)
          .where(
            and(
              eq(waConversationMessages.conversationId, claimed.conversationId),
              eq(waConversationMessages.orgId, claimed.orgId)
            )
          )
          .orderBy(asc(waConversationMessages.createdAt))
          .limit(20)
          .then((msgs) => generateAndStoreSummary(claimed.orgId, claimed.conversationId, msgs))
          .catch(() => undefined)
      }

      // ── Step 14: Mark queue item done (with lease token) ───────────
      // The lease token check ensures a stale worker that lost its lease cannot
      // mark done an item already reclaimed by another worker.
      await markQueueItemDone(claimed.id, leaseToken)
      processed = 1
    } catch (err) {
      const errCode = err instanceof Error ? err.constructor.name : typeof err
      const errMsg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)
      console.log("[processor] outer catch itemId:", claimed.id, "err:", errCode, errMsg)
      const attemptCount = claimed.attemptCount + 1
      if (attemptCount >= MAX_ATTEMPTS) {
        await markQueueItemDeadLetter(claimed.id, "max_attempts_reached", leaseToken)
      } else {
        const backoffMs = Math.min(Math.pow(2, attemptCount) * 1000, 300_000)
        const retryAt = new Date(Date.now() + backoffMs)
        await markQueueItemFailed(claimed.id, "processing_error", retryAt, leaseToken)
      }

      // Release budget reservation on failure — no cost was confirmed yet.
      if (reservationId) {
        await settleReservation({
          queueItemId: claimed.id,
          orgId: claimed.orgId,
          status: "released",
          releasedReason: "processing_error",
        }).catch(() => undefined)
      }

      return { itemsProcessed: 0, itemsFailed: 1 }
    }

    return {
      itemsProcessed: processed,
      result: { correlationId: ctx.correlationId },
    }
  })

  return NextResponse.json({
    ok: run.ok,
    correlationId: run.correlationId,
    durationMs: run.durationMs,
    processed: 1,
  })
}

// ─── Send helper ──────────────────────────────────────────────────────────────

async function sendReplyToMeta(params: {
  orgId: string
  conversationId: string
  messageRowId: string
  phoneNumberRowId: string
  customerPhone: string
  text: string
}): Promise<void> {
  try {
    // Load Meta phone number ID + WABA access token (scoped to this org)
    const phoneRows = await db
      .select({
        metaPhoneNumberId: waPhoneNumbers.phoneNumberId,
        accessTokenEnc: waBusinessAccounts.accessTokenEnc,
      })
      .from(waPhoneNumbers)
      .innerJoin(waBusinessAccounts, eq(waPhoneNumbers.wabaAccountId, waBusinessAccounts.id))
      .where(
        and(
          eq(waPhoneNumbers.id, params.phoneNumberRowId),
          eq(waPhoneNumbers.orgId, params.orgId),
        )
      )
      .limit(1)

    const phoneRow = phoneRows[0]
    if (!phoneRow?.accessTokenEnc) {
      // No credentials — message stays "pending" in DB
      return
    }

    // Check 24-hour messaging window before sending
    const eligibility = await checkSendEligibility(params.conversationId, params.orgId)
    if (!eligibility.eligible) {
      // Window closed — cannot send free-form text. Message stays "pending".
      // Operator must initiate a template message externally to re-open the window.
      return
    }

    const accessToken = decryptTokenVersioned(phoneRow.accessTokenEnc)
    // Tight timeout: we've already used most of the function budget on the engine.
    const client = new CloudApiClient(accessToken, { timeoutMs: 8_000, maxRetries: 0 })

    const outcome = await client.sendText({
      phoneNumberId: phoneRow.metaPhoneNumberId,
      to: params.customerPhone,
      text: params.text,
    })

    if (outcome.kind === "accepted") {
      await updateOutboundMessageStatus(params.messageRowId, params.orgId, {
        wamid: outcome.messageId,
        status: "accepted",
      })
    } else if (outcome.kind === "error" && outcome.permanent) {
      await updateOutboundMessageStatus(params.messageRowId, params.orgId, {
        status: "failed",
      })
    }
    // timeout_unknown or transient error: status stays "pending".
    // A "timeout_unknown" means Meta may have received the request.
    // Delivery webhooks (sent/delivered/read) will update status if it was accepted.
  } catch {
    // Non-fatal: reply is persisted in DB regardless of send outcome.
    // Operations team can inspect "pending" messages and retry manually.
  }
}

export { GET as POST }
