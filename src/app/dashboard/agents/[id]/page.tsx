import { redirect, notFound } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { db } from "@/lib/db"
import { aiAgents, aiAgentVersions, waPhoneNumbers, aiKnowledgeSources, campaigns, clients, aiAgentDeployments, aiDeploymentSchedules } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { PageShell } from "@/components/app/ops"
import AgentEditor from "./_components/AgentEditor"
import type { AgentConfig } from "@/domains/ai-agents/types"
import { getDefaultAgentConfig } from "@/domains/ai-agents/templates"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export default async function AgentEditorPage({ params }: Props) {
  const { id } = await params

  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const [agentRows, versions, phoneNumbers, knowledgeSources, orgCampaigns, deploymentRows] = await Promise.all([
    db
      .select()
      .from(aiAgents)
      .where(and(eq(aiAgents.id, id), eq(aiAgents.orgId, ctx.orgId)))
      .limit(1),
    db
      .select()
      .from(aiAgentVersions)
      .where(and(eq(aiAgentVersions.agentId, id), eq(aiAgentVersions.orgId, ctx.orgId)))
      .orderBy(desc(aiAgentVersions.versionNumber))
      .limit(10),
    db
      .select({
        id: waPhoneNumbers.id,
        displayPhoneNumber: waPhoneNumbers.displayPhoneNumber,
        verifiedName: waPhoneNumbers.verifiedName,
        status: waPhoneNumbers.status,
      })
      .from(waPhoneNumbers)
      .where(eq(waPhoneNumbers.orgId, ctx.orgId)),
    db
      .select({
        id: aiKnowledgeSources.id,
        name: aiKnowledgeSources.name,
        sourceType: aiKnowledgeSources.sourceType,
        status: aiKnowledgeSources.status,
        processingStatus: aiKnowledgeSources.processingStatus,
        processingError: aiKnowledgeSources.processingError,
      })
      .from(aiKnowledgeSources)
      .where(and(eq(aiKnowledgeSources.orgId, ctx.orgId), eq(aiKnowledgeSources.status, "active")))
      .orderBy(aiKnowledgeSources.name),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        clientName: clients.name,
      })
      .from(campaigns)
      .innerJoin(clients, eq(campaigns.clientId, clients.id))
      .where(and(eq(campaigns.orgId, ctx.orgId), eq(campaigns.active, true)))
      .orderBy(clients.name, campaigns.name),
    db
      .select({
        id: aiAgentDeployments.id,
        paused: aiAgentDeployments.paused,
        scheduleTimezone: aiDeploymentSchedules.timezone,
        scheduleWindows: aiDeploymentSchedules.windows,
        scheduleEnabled: aiDeploymentSchedules.enabled,
      })
      .from(aiAgentDeployments)
      .leftJoin(aiDeploymentSchedules, eq(aiAgentDeployments.id, aiDeploymentSchedules.deploymentId))
      .where(and(eq(aiAgentDeployments.agentId, id), eq(aiAgentDeployments.orgId, ctx.orgId)))
      .limit(1),
  ])

  const agent = agentRows[0]
  if (!agent) notFound()

  const canManage = ["owner", "admin", "manager"].includes(ctx.role)
  const deployment = deploymentRows[0] ?? null

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

  return (
    <PageShell>
      <AgentEditor
        orgId={ctx.orgId}
        agent={{ ...agent, agentConfig: config }}
        versions={versions}
        phoneNumbers={phoneNumbers}
        knowledgeSources={knowledgeSources}
        campaigns={orgCampaigns}
        canManage={canManage}
        deployment={deployment}
      />
    </PageShell>
  )
}
