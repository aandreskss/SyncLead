import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { db } from "@/lib/db"
import { aiAgents, waPhoneNumbers, aiAgentDeployments } from "@/lib/db/schema"
import { eq, and, ne, desc, inArray } from "drizzle-orm"
import { PageShell } from "@/components/app/ops"
import AgentsListView from "./_components/AgentsListView"

export const dynamic = "force-dynamic"

export default async function AgentsPage() {
  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const [agents, phoneNumbers] = await Promise.all([
    db
      .select()
      .from(aiAgents)
      .where(
        and(
          eq(aiAgents.orgId, ctx.orgId),
          ne(aiAgents.status, "archived"),
        )
      )
      .orderBy(desc(aiAgents.updatedAt)),
    db
      .select({
        id: waPhoneNumbers.id,
        displayPhoneNumber: waPhoneNumbers.displayPhoneNumber,
        verifiedName: waPhoneNumbers.verifiedName,
      })
      .from(waPhoneNumbers)
      .where(eq(waPhoneNumbers.orgId, ctx.orgId)),
  ])

  // Fetch active deployments for each agent
  const agentIds = agents.map(a => a.id)
  const deployments = agentIds.length > 0
    ? await db
        .select({
          agentId: aiAgentDeployments.agentId,
          phoneNumberId: aiAgentDeployments.phoneNumberId,
        })
        .from(aiAgentDeployments)
        .where(
          and(
            eq(aiAgentDeployments.orgId, ctx.orgId),
            eq(aiAgentDeployments.active, true),
            inArray(aiAgentDeployments.agentId, agentIds),
          )
        )
    : []

  const phoneMap = new Map(phoneNumbers.map(p => [p.id, p]))
  const agentsWithPhones = agents.map(agent => {
    const agentDeployments = deployments.filter(d => d.agentId === agent.id)
    const phones = agentDeployments
      .map(d => phoneMap.get(d.phoneNumberId))
      .filter(Boolean)
    return { ...agent, associatedPhones: phones }
  })

  const canManage = ["owner", "admin", "manager"].includes(ctx.role)

  return (
    <PageShell>
      <AgentsListView
        agents={agentsWithPhones as Parameters<typeof AgentsListView>[0]["agents"]}
        canManage={canManage}
      />
    </PageShell>
  )
}
