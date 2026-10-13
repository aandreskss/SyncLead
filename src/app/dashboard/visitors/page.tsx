import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { getVisitorSessionsByClient } from "@/domains/tracking/repository"
import { getClientLeadLandingStats } from "@/domains/leads/repository"
import { VisitorsView } from "./_components/VisitorsView"

export default async function VisitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; days?: string }>
}) {
  let ctx: { orgId: string; userId: string }
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const sp = await searchParams
  const clientId = sp.clientId || undefined
  const days = sp.days === "7" ? 7 : sp.days === "90" ? 90 : 30

  const clients = await getClientsByOrgId(ctx.orgId)

  const [sessions, leadStats] = clientId
    ? await Promise.all([
        getVisitorSessionsByClient(ctx.orgId, clientId, 400, days),
        getClientLeadLandingStats(ctx.orgId, clientId, days),
      ])
    : ([([] as Awaited<ReturnType<typeof getVisitorSessionsByClient>>), { total: 0, breakdown: [] as { path: string; count: number }[] }] as const)

  return (
    <VisitorsView
      clients={clients}
      sessions={sessions}
      leadStats={leadStats}
      currentClientId={clientId}
      currentDays={String(days)}
    />
  )
}
