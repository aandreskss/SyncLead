import { notFound, redirect } from "next/navigation"
import { requireClientAccess } from "@/lib/auth/server"
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors"
import {
  getTrackingSitesAction,
  getTrackingOverviewAction,
  getOpenIssuesAction,
} from "@/domains/tracking/actions"
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

  const [sitesResult, definitionsResult, issuesResult] = await Promise.all([
    getTrackingSitesAction(id),
    getTrackingOverviewAction(id),
    getOpenIssuesAction(id),
  ])

  const sites = sitesResult.data ?? []
  const definitions = definitionsResult.data ?? []
  const issues = issuesResult.data ?? []

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <TrackingDashboard
          clientId={id}
          sites={sites}
          definitions={definitions}
          issues={issues}
        />
      </div>
    </div>
  )
}
