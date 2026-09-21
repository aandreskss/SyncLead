import { Suspense } from "react"
import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getOrganizationById } from "@/domains/organizations/repository"
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
  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const org = await getOrganizationById(ctx.orgId)
  if (!org) redirect("/login")

  const sp = await searchParams
  const range = parseDateRange(sp.range ?? "30d", sp.from, sp.to)
  const clients = await getClientsByOrgId(org.id)
  const selectedClient = clients.find((c) => c.id === sp.clientId)

  return (
    <div className="space-y-5 px-4 py-5 md:px-7 md:py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ops-tx">Resumen ejecutivo</h1>
          <p className="mt-0.5 text-sm text-ops-tx2">
            Resultados de {selectedClient ? selectedClient.name : org.name} · {formatRangeLabel(range.from, range.to)}
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
          isAdmin={ctx.role === "owner" || ctx.role === "admin"}
        />
      </Suspense>

      {/* Live event feed — solo cuando hay cliente seleccionado */}
      {sp.clientId && (
        <LiveEventFeed clientId={sp.clientId} />
      )}
    </div>
  )
}
