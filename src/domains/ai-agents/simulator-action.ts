"use server"

import { requireOrganizationMembership } from "@/lib/auth/server"
import { db } from "@/lib/db"
import { aiAgents } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { runEngine } from "@/domains/ai-agents/engine"
import { getDefaultAgentConfig } from "./templates"
import { resolveModelPricingTier, computeCostMillicents, formatMillicentsAsUsd } from "./cost-calculator"
import type { AgentConfig } from "./types"
import type { LLMMessage } from "@/lib/llm/provider"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimulatorDebugInfo {
  toolsExecuted: Array<{ name: string; status: "success" | "error" }>
  stopReason: string
  estimatedCost: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    totalCostMillicents: number | null  // null if no pricing tier configured
    totalCostUsd: string               // formatted e.g. "$0.00042" or "N/D"
    pricingSource: string | null       // e.g. "anthropic_published"
  }
  modelUsed: string
}

interface SimulatorResult {
  success: boolean
  reply?: string
  debugInfo?: SimulatorDebugInfo
  error?: string
  testMode?: boolean // true when running without real API key
  latencyMs?: number
}

// ─── Server Action ────────────────────────────────────────────────────────────

export async function simulatorRunAction(
  agentId: string,
  userMessage: string,
  previousMessages: Array<{ role: "user" | "assistant"; text: string }>
): Promise<SimulatorResult> {
  try {
    // Auth: require org membership
    const ctx = await requireOrganizationMembership()

    // Validate inputs
    if (!agentId || !userMessage?.trim()) {
      return { success: false, error: "Parametros invalidos" }
    }

    // Load agent — orgId guard ensures cross-tenant safety
    const agentRows = await db
      .select()
      .from(aiAgents)
      .where(and(eq(aiAgents.id, agentId), eq(aiAgents.orgId, ctx.orgId)))
      .limit(1)

    const agent = agentRows[0]
    if (!agent) return { success: false, error: "Agente no encontrado" }
    if (agent.status === "archived") return { success: false, error: "El agente esta archivado" }

    // ── Test mode: no API key configured ──────────────────────────────────
    const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY)
    if (!hasApiKey) {
      return {
        success: true,
        testMode: true,
        reply:
          "[MODO DE PRUEBA — API key no configurada]\n\n" +
          "Este es un mensaje de ejemplo generado sin llamar al modelo real. " +
          "El agente respondería según su configuración de objetivo, personalidad y reglas.\n\n" +
          "Para usar el motor real, configura la variable de entorno `ANTHROPIC_API_KEY` " +
          "en el panel de Vercel o en tu archivo `.env.local` y recarga.",
        debugInfo: {
          toolsExecuted: [],
          stopReason: "test_mode",
          estimatedCost: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalCostMillicents: null,
            totalCostUsd: "N/D",
            pricingSource: null,
          },
          modelUsed: agent.model,
        },
        latencyMs: 0,
      }
    }

    // Parse agentConfig
    const defaults = getDefaultAgentConfig()
    const stored = (agent.agentConfig ?? {}) as Partial<AgentConfig>
    const agentConfig: AgentConfig = {
      objetivo: { ...defaults.objetivo, ...stored.objetivo },
      personalidad: { ...defaults.personalidad, ...stored.personalidad },
      conocimiento: { ...defaults.conocimiento, ...stored.conocimiento },
      acciones: { ...defaults.acciones, ...stored.acciones },
      reglas: { ...defaults.reglas, ...stored.reglas },
      despliegue: { ...defaults.despliegue, ...stored.despliegue },
    }

    // Build LLM message history (keep last 8 previous messages + current user message)
    const recentPrevious = previousMessages.slice(-8)
    const history: LLMMessage[] = [
      ...recentPrevious.map((m) => ({ role: m.role, content: m.text })),
      { role: "user" as const, content: userMessage },
    ]

    // Run engine in sandbox mode
    const engineStart = Date.now()
    const engineResult = await runEngine({
      orgId: ctx.orgId,
      agentConfig,
      model: agent.model,
      maxTokens: agent.maxTokens,
      episodeId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      leadId: null,
      history,
      sandbox: true,
    })

    const latencyMs = Date.now() - engineStart

    // Use the cost-calculator for accurate pricing from DB tiers (sandbox run — not recorded)
    const tier = await resolveModelPricingTier("anthropic", engineResult.modelUsed).catch(() => null)
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

    return {
      success: true,
      reply: engineResult.response,
      latencyMs,
      debugInfo: {
        toolsExecuted: engineResult.toolsExecuted,
        stopReason: engineResult.stopReason,
        estimatedCost: {
          inputTokens: engineResult.totalInputTokens,
          outputTokens: engineResult.totalOutputTokens,
          cacheReadTokens: engineResult.totalCacheReadTokens,
          cacheWriteTokens: engineResult.totalCacheWriteTokens,
          totalCostMillicents: costData?.totalCostMillicents ?? null,
          totalCostUsd: costData ? formatMillicentsAsUsd(costData.totalCostMillicents) : "N/D",
          pricingSource: tier?.source ?? null,
        },
        modelUsed: engineResult.modelUsed,
      },
    }
  } catch {
    // Never expose raw error to client — could contain API details
    return { success: false, error: "Error al ejecutar el simulador" }
  }
}
