import "server-only"

import type { AgentConfig } from "../types"
import type { LLMProvider } from "@/lib/llm/provider"
import { defaultProvider, createProvider } from "@/lib/llm"
import { buildSystemPrompt, type LeadContext } from "./prompts"
import { loadKnowledgeChunks, formatKnowledgeForPrompt } from "./knowledge"
import { getEnabledTools, executeTool, type ToolContext } from "./tools"
import type { LLMMessage, LLMContentBlock } from "@/lib/llm/provider"
import { getProviderApiKey, type ProviderName } from "../provider-keys-repository"

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_INTERNAL_TURNS = 5
const MAX_OUTPUT_CHARS = 2000
const ENGINE_TIMEOUT_MS = 25_000 // 25s total; leaves headroom for Vercel 30s limit

// ─── Engine context ───────────────────────────────────────────────────────────

export interface EngineContext {
  orgId: string
  agentConfig: AgentConfig
  model: string
  maxTokens: number
  episodeId: string
  conversationId: string
  leadId: string | null
  leadContext?: LeadContext
  conversationSummary?: string // persisted rolling summary — replaces older history beyond window
  history: LLMMessage[] // limited recent history (caller is responsible for trimming)
  sandbox: boolean
  queueItemId?: string // from cron worker — enables per-tool idempotency keys on retry
  provider?: LLMProvider // injectable for tests; defaults to defaultProvider
}

// ─── Engine result ────────────────────────────────────────────────────────────

export interface EngineResult {
  response: string
  toolsExecuted: Array<{ name: string; status: "success" | "error" }>
  stopReason: "end_turn" | "limit" | "error" | "transfer"
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number  // tokens served from prompt cache (cheaper)
  totalCacheWriteTokens: number // tokens written to prompt cache (more expensive)
  modelUsed: string
}

// ─── Main engine function ─────────────────────────────────────────────────────

export async function runEngine(ctx: EngineContext): Promise<EngineResult> {
  const agentLlmProvider = ctx.agentConfig.personalidad.llmProvider ?? "anthropic"
  let provider: LLMProvider
  if (ctx.provider) {
    provider = ctx.provider
  } else {
    // Look up org API key from DB; fall back to env var if not stored
    const orgKey = await getProviderApiKey(ctx.orgId, agentLlmProvider as ProviderName)
    provider = createProvider(agentLlmProvider, orgKey ?? undefined)
  }
  const config = ctx.agentConfig

  // 1. Load knowledge chunks
  const knowledgeChunks = await loadKnowledgeChunks(
    ctx.orgId,
    config.conocimiento.knowledgeSourceIds
  )

  // 2. Build system prompt
  let systemPrompt = buildSystemPrompt(config, ctx.leadContext, ctx.conversationSummary)
  if (knowledgeChunks.length > 0) {
    systemPrompt += "\n\n---\n\n## Base de Conocimiento\n" + formatKnowledgeForPrompt(knowledgeChunks)
  }

  // 3. Get enabled tools
  const enabledTools = getEnabledTools(config.acciones.actions, ctx.sandbox)

  // 4. Initialize accumulators
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let totalCacheWriteTokens = 0
  const toolsExecuted: Array<{ name: string; status: "success" | "error" }> = []

  // 5. Build message list (shallow copy — we append tool results)
  const messages: LLMMessage[] = [...ctx.history]

  // Base tool context — IDs always from server context, never from AI input.
  // toolCallIndex is set per-call in the loop below.
  const baseToolCtx = {
    orgId: ctx.orgId,
    leadId: ctx.leadId,
    episodeId: ctx.episodeId,
    conversationId: ctx.conversationId,
    knowledgeChunks,
    sandbox: ctx.sandbox,
    queueItemId: ctx.queueItemId,
  }

  // 6. Engine loop
  let turn = 0
  let finalResponse = ""
  let loopStopReason: "end_turn" | "limit" | "error" | "transfer" = "end_turn"
  let toolCallCounter = 0

  const startTime = Date.now()

  while (turn < MAX_INTERNAL_TURNS) {
    const elapsed = Date.now() - startTime
    const remaining = ENGINE_TIMEOUT_MS - elapsed
    if (remaining <= 1000) {
      // Not enough time for another LLM call
      loopStopReason = "limit"
      break
    }

    let llmResponse
    try {
      llmResponse = await provider.chat({
        model: ctx.model,
        systemPrompt,
        messages,
        tools: enabledTools,
        maxTokens: ctx.maxTokens,
        timeoutMs: remaining,
      })
    } catch (err) {
      // Log error type/code only — never log raw message (may contain API key)
      const errCode = err instanceof Error ? err.constructor.name : typeof err
      const errMsg = err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400)
      console.log("[engine] LLM call failed provider:", agentLlmProvider, "model:", ctx.model, "err:", errCode, errMsg)
      return {
        response:
          "Ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo.",
        toolsExecuted,
        stopReason: "error",
        totalInputTokens,
        totalOutputTokens,
        totalCacheReadTokens,
        totalCacheWriteTokens,
        modelUsed: ctx.model,
      }
    }

    // Accumulate usage
    totalInputTokens += llmResponse.usage.inputTokens
    totalOutputTokens += llmResponse.usage.outputTokens
    totalCacheReadTokens += llmResponse.usage.cacheReadTokens ?? 0
    totalCacheWriteTokens += llmResponse.usage.cacheWriteTokens ?? 0
    turn++

    if (
      llmResponse.stopReason === "end_turn" ||
      llmResponse.stopReason === "max_tokens"
    ) {
      // Extract text content from response
      finalResponse = extractText(llmResponse.content)
      // Trim to MAX_OUTPUT_CHARS if needed
      if (finalResponse.length > MAX_OUTPUT_CHARS) {
        finalResponse = finalResponse.slice(0, MAX_OUTPUT_CHARS)
      }
      loopStopReason = "end_turn"
      break
    }

    if (llmResponse.stopReason === "tool_use") {
      // Push assistant message with tool_use blocks
      messages.push({ role: "assistant", content: llmResponse.content })

      // Process each tool_use block
      const toolResultBlocks: LLMContentBlock[] = []
      let signalBreak = false

      for (const block of llmResponse.content) {
        if (block.type !== "tool_use") continue

        // Validate tool name is in enabled tools
        const toolAllowed = enabledTools.some((t) => t.name === block.name)
        if (!toolAllowed) {
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: Tool '${block.name}' is not available.`,
            is_error: true,
          })
          toolsExecuted.push({ name: block.name, status: "error" })
          continue
        }

        // Validate input is a proper object
        const toolInput =
          typeof block.input === "object" && block.input !== null
            ? (block.input as Record<string, unknown>)
            : {}

        // Execute the tool with a stable per-call index for idempotency
        const callCtx: ToolContext = { ...baseToolCtx, toolCallIndex: toolCallCounter++ }
        const result = await executeTool(block.name, toolInput, callCtx)

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.success ? JSON.stringify(result.data) : result.error,
          is_error: !result.success,
        })

        toolsExecuted.push({
          name: block.name,
          status: result.success ? "success" : "error",
        })

        // Detect flow signals from tools like transfer_to_human / end_conversation
        if (result.success && result.signal === "transfer") {
          loopStopReason = "transfer"
          signalBreak = true
        } else if (result.success && result.signal === "end") {
          signalBreak = true
        }
      }

      // Push tool results as a user message
      if (toolResultBlocks.length > 0) {
        messages.push({ role: "user", content: toolResultBlocks })
      }

      // Tools requested an engine stop (transfer or end) — break before next LLM call
      if (signalBreak) break

      // Continue loop to get next assistant response
      continue
    }

    // Unknown stop reason — treat as end
    finalResponse = extractText(llmResponse.content)
    if (finalResponse.length > MAX_OUTPUT_CHARS) {
      finalResponse = finalResponse.slice(0, MAX_OUTPUT_CHARS)
    }
    break
  }

  // Check if we exhausted turns without a natural end
  if (turn >= MAX_INTERNAL_TURNS && loopStopReason === "end_turn" && !finalResponse) {
    loopStopReason = "limit"
    finalResponse = "He alcanzado el límite de procesamiento para este mensaje. Por favor intenta de nuevo."
  }

  // 7. Check for transfer trigger
  if (
    config.reglas.transferRule &&
    finalResponse &&
    containsTransferTrigger(finalResponse, config.reglas.transferRule)
  ) {
    loopStopReason = "transfer"
  }

  return {
    response: finalResponse,
    toolsExecuted,
    stopReason: loopStopReason,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    modelUsed: ctx.model,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText(blocks: LLMContentBlock[]): string {
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim()
}

function containsTransferTrigger(text: string, transferRule: string): boolean {
  // Extract keywords from the transfer rule (simple word matching)
  const keywords = transferRule
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter((k) => k.length > 3)

  if (keywords.length === 0) return false

  const lowerText = text.toLowerCase()
  return keywords.some((keyword) => lowerText.includes(keyword))
}
