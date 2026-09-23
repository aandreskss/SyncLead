import { notFound, redirect } from "next/navigation"
import { requireClientAccess } from "@/lib/auth/server"
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors"
import {
  getTrackingSitesAction,
  getTrackingOverviewAction,
  getOpenIssuesAction,
  getIngestErrorsByClientAction,
  getCheckoutFunnelAction,
} from "@/domains/tracking/actions"
import { getMetaConnectionsAction } from "@/domains/meta/actions"
import { TrackingDashboard } from "./_components/TrackingDashboard"

interface Props {
  params: Promise<{ id: string }>
}

export const metadata = {
  title: "Diagnóstico de conversiones — SyncLead",
}

export default async function TrackingPage({ params }: Props) {
  const { id } = await params

  try {
    await requireClientAccess(id)
  } catch (err) {
    if (err instanceof NotFoundError) notFound()
    if (err instanceof ForbiddenError) redirect("/dashboard/clients")
    redirect("/login")
  }

  const [sitesResult, definitionsResult, issuesResult, metaConnections, ingestErrorsResult, funnelResult] = await Promise.all([
    getTrackingSitesAction(id),
    getTrackingOverviewAction(id),
    getOpenIssuesAction(id),
    getMetaConnectionsAction(id),
    getIngestErrorsByClientAction(id),
    getCheckoutFunnelAction(id, 30),
  ])

  const sites = sitesResult.data ?? []
  const definitions = definitionsResult.data ?? []
  const issues = issuesResult.data ?? []
  const ingestErrors = ingestErrorsResult.data ?? []
  const checkoutFunnel = funnelResult.data ?? { startedCount: 0, completedCount: 0, abandonedCount: 0, abandonmentRate: 0, bySource: [] }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <TrackingDashboard
          clientId={id}
          sites={sites}
          definitions={definitions}
          issues={issues}
          metaConnections={metaConnections}
          ingestErrors={ingestErrors}
          checkoutFunnel={checkoutFunnel}
        />
      </div>
    </div>
  )
}
