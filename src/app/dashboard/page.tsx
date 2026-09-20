import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getOrganizationByOwnerId } from "@/domains/organizations/repository"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { parseDateRange, formatRangeLabel } from "@/lib/date-range"
import { DateRangeSelector } from "./_components/DateRangeSelector"
import { DashboardMetrics } from "./_components/DashboardMetrics"
import { DashboardSkeleton } from "./_components/DashboardSkeleton"
import { LiveEventFeed } from "./clients/[id]/tracking/_components/LiveEventFeed"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; clientId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const org = await getOrganizationByOwnerId(session.user.id)
  if (!org) redirect("/onboarding")

  const sp = await searchParams
  const range = parseDateRange(sp.range ?? "30d", sp.from, sp.to)
  const clients = await getClientsByOrgId(org.id)
  const selectedClient = clients.find((c) => c.id === sp.clientId)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {formatRangeLabel(range.from, range.to)} · {selectedClient ? selectedClient.name : org.name}
          </p>
        </div>
        <DateRangeSelector
          currentPreset={range.preset}
          customFrom={sp.from}
          customTo={sp.to}
          clients={clients}
          currentClientId={sp.clientId}
        />
      </div>

      {/* Metrics — streamed */}
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardMetrics
          orgId={org.id}
          from={range.from}
          to={range.to}
          prevFrom={range.prevFrom}
          prevTo={range.prevTo}
          clientId={sp.clientId}
        />
      </Suspense>

      {/* Live event feed — solo cuando hay cliente seleccionado */}
      {sp.clientId && (
        <LiveEventFeed clientId={sp.clientId} />
      )}
    </div>
  )
}
