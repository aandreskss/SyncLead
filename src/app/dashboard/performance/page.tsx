import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getOrganizationById } from "@/domains/organizations/repository"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { parseDateRange, formatRangeLabel } from "@/lib/date-range"
import { getPerformanceTable } from "@/domains/analytics/repository"
import { DateRangeSelector } from "../_components/DateRangeSelector"
import { SummaryCards } from "./_components/SummaryCards"
import { PerformanceView } from "./_components/PerformanceView"

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; clientId?: string }>
}) {
  let ctx: { orgId: string; userId: string }
  let orgName: string

  try {
    ctx = await requireOrganizationMembership()
    const org = await getOrganizationById(ctx.orgId)
    if (!org) redirect("/login")
    orgName = org.name
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    if (e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const sp = await searchParams
  const range = parseDateRange(sp.range ?? "30d", sp.from, sp.to)
  const clientId = sp.clientId || undefined

  const [clients, rows, prevRows] = await Promise.all([
    getClientsByOrgId(ctx.orgId),
    getPerformanceTable(ctx.orgId, range.from, range.to, clientId),
    getPerformanceTable(ctx.orgId, range.prevFrom, range.prevTo, clientId),
  ])

  const selectedClient = clientId ? clients.find((c) => c.id === clientId) : null

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Rendimiento de anuncios</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {formatRangeLabel(range.from, range.to)} · {selectedClient?.name ?? orgName}
          </p>
        </div>
        <DateRangeSelector
          currentPreset={range.preset}
          customFrom={sp.from}
          customTo={sp.to}
          basePath="/dashboard/performance"
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          currentClientId={clientId}
        />
      </div>

      <SummaryCards rows={rows} />
      <PerformanceView rows={rows} prevRows={prevRows} />
    </div>
  )
}
