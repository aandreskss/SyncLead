import { redirect, notFound } from "next/navigation"
import { requireRole } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { db } from "@/lib/db"
import { aiAgents } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { getDefaultAgentConfig } from "@/domains/ai-agents/templates"
import type { AgentConfig } from "@/domains/ai-agents/types"
import SimulatorView from "./_components/SimulatorView"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export default async function SimulatorPage({ params }: Props) {
  const { id } = await params

  let ctx: Awaited<ReturnType<typeof requireRole>>
  try {
    ctx = await requireRole(["owner", "admin"])
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const agentRows = await db
    .select()
    .from(aiAgents)
    .where(and(eq(aiAgents.id, id), eq(aiAgents.orgId, ctx.orgId)))
    .limit(1)

  const agent = agentRows[0]
  if (!agent) notFound()

  // Merge stored agentConfig with defaults to ensure all fields exist
  const defaults = getDefaultAgentConfig()
  const stored = (agent.agentConfig ?? {}) as Partial<AgentConfig>
  const config: AgentConfig = {
    objetivo: { ...defaults.objetivo, ...stored.objetivo },
    personalidad: { ...defaults.personalidad, ...stored.personalidad },
    conocimiento: { ...defaults.conocimiento, ...stored.conocimiento },
    acciones: { ...defaults.acciones, ...stored.acciones },
    reglas: { ...defaults.reglas, ...stored.reglas },
    despliegue: { ...defaults.despliegue, ...stored.despliegue },
  }

  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY)
  const canRun = agent.status !== "archived" && hasApiKey

  return (
    <SimulatorView
      agent={{
        id: agent.id,
        name: agent.name,
        status: agent.status,
        model: agent.model,
        maxTokens: agent.maxTokens,
        agentConfig: config,
      }}
      hasApiKey={hasApiKey}
      canRun={canRun}
    />
  )
}
