import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { db } from "@/lib/db"
import { aiAgents, waPhoneNumbers } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { PageShell, PageHeader } from "@/components/app/ops"
import { AnalyticsDashboard } from "./_components/AnalyticsDashboard"

export const dynamic = "force-dynamic"

export default async function AgentAnalyticsPage() {
  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const [agents, phoneNumbers] = await Promise.all([
    db
      .select({ id: aiAgents.id, name: aiAgents.name })
      .from(aiAgents)
      .where(eq(aiAgents.orgId, ctx.orgId))
      .orderBy(desc(aiAgents.updatedAt)),
    db
      .select({ id: waPhoneNumbers.id, displayPhoneNumber: waPhoneNumbers.displayPhoneNumber })
      .from(waPhoneNumbers)
      .where(eq(waPhoneNumbers.orgId, ctx.orgId))
      .orderBy(waPhoneNumbers.displayPhoneNumber),
  ])

  return (
    <PageShell>
      <PageHeader
        eyebrow="Agentes IA"
        title="Analíticas"
        subtitle="Episodios, mensajes, tokens y costos de producción"
      />
      <AnalyticsDashboard agents={agents} phoneNumbers={phoneNumbers} />
    </PageShell>
  )
}
