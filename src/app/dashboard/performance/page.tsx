import Link from "next/link"
import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getOrganizationById } from "@/domains/organizations/repository"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { parseDateRange, formatRangeLabel } from "@/lib/date-range"
import { getPerformanceTable, getMetaSpendForPeriod } from "@/domains/analytics/repository"
import { getVisitorSessionsByClient } from "@/domains/tracking/repository"
import { DateRangeSelector } from "../_components/DateRangeSelector"
import { PageShell, PageHeader } from "@/components/app/ops"
import { SummaryCards } from "./_components/SummaryCards"
import { PerformanceView } from "./_components/PerformanceView"
import { VisitorsTab } from "./_components/VisitorsTab"
import { InsightsDecisionCenter } from "./_components/InsightsDecisionCenter"

type Tab = "rendimiento" | "visitantes" | "insights"

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string
    from?: string
    to?: string
    clientId?: string
    tab?: string
    action?: string
    days?: string
  }>
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
  const tab: Tab =
    sp.tab === "visitantes"
      ? "visitantes"
      : sp.tab === "insights"
      ? "insights"
      : "rendimiento"
  const currentAction = sp.action ?? "all"
  const currentDays = sp.days ?? "30"
  const daysNum = currentDays === "7" ? 7 : currentDays === "90" ? 90 : 30
  const insightsDays = sp.days === "7" ? 7 : sp.days === "90" ? 90 : 30

  const clients = await getClientsByOrgId(ctx.orgId)
  const selectedClient = clientId ? clients.find((c) => c.id === clientId) : null

  // Only fetch performance data when on that tab
  const [rows, prevRows, metaSpend] =
    tab === "rendimiento"
      ? await Promise.all([
          getPerformanceTable(ctx.orgId, range.from, range.to, clientId),
          getPerformanceTable(ctx.orgId, range.prevFrom, range.prevTo, clientId),
          clientId ? getMetaSpendForPeriod(ctx.orgId, clientId, range.from, range.to) : Promise.resolve(null),
        ])
      : [[], [], null]

  // Only fetch visitor data when on that tab and a client is selected
  const allSessions =
    tab === "visitantes" && clientId
      ? await getVisitorSessionsByClient(ctx.orgId, clientId, 200, daysNum)
      : []

  // Base URL params to preserve across tab/filter links in the visitors tab
  const baseParams: Record<string, string> = { tab: "visitantes" }
  if (clientId) baseParams.clientId = clientId
  if (sp.range) baseParams.range = sp.range

  const TABS: { key: Tab; label: string }[] = [
    { key: "rendimiento", label: "Rendimiento" },
    { key: "visitantes", label: "Visitantes" },
    { key: "insights", label: "Insights Meta" },
  ]

  function tabHref(key: Tab): string {
    const p = new URLSearchParams({ tab: key })
    if (clientId) p.set("clientId", clientId)
    if (key !== "insights" && sp.range) p.set("range", sp.range)
    return `/dashboard/performance?${p}`
  }

  let tabContent: React.ReactNode = null

  if (tab === "rendimiento") {
    tabContent = (
      <>
        <SummaryCards rows={rows} metaSpend={metaSpend} />
        <PerformanceView rows={rows} prevRows={prevRows} />
      </>
    )
  } else if (tab === "visitantes" && clientId) {
    tabContent = (
      <VisitorsTab
        clientId={clientId}
        allSessions={allSessions}
        currentAction={currentAction}
        currentDays={currentDays}
        baseParams={baseParams}
      />
    )
  } else if (tab === "visitantes" && !clientId) {
    tabContent = (
      <div className="rounded-lg border border-ops-line bg-ops-s1 px-6 py-16 text-center space-y-2">
        <p className="text-sm font-medium text-ops-tx">Selecciona un cliente</p>
        <p className="text-xs text-ops-tx3">
          Usa el filtro de arriba para elegir un cliente y ver sus visitantes de Meta.
        </p>
      </div>
    )
  } else if (tab === "insights" && clientId) {
    tabContent = (
      <InsightsDecisionCenter
        clientId={clientId}
        orgId={ctx.orgId}
        days={insightsDays}
      />
    )
  } else if (tab === "insights" && !clientId) {
    tabContent = (
      <div className="rounded-lg border border-ops-line bg-ops-s1 px-6 py-16 text-center space-y-2">
        <p className="text-sm font-medium text-ops-tx">Selecciona un cliente</p>
        <p className="text-xs text-ops-tx3">
          Usa el filtro de arriba para elegir un cliente y ver el Centro de Decisiones de Meta Ads.
        </p>
      </div>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Rendimiento"
        subtitle="Resultados por campaña, conjunto y anuncio."
        actions={
          <DateRangeSelector
            currentPreset={range.preset}
            customFrom={sp.from}
            customTo={sp.to}
            basePath="/dashboard/performance"
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            currentClientId={clientId}
          />
        }
      />
      <p className="-mt-3 text-xs text-ops-tx3">
        {formatRangeLabel(range.from, range.to)} · {selectedClient?.name ?? orgName}
      </p>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-ops-line">
        {TABS.map(({ key, label }) => (
          <Link
            key={key}
            href={tabHref(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? "border-ops-blue text-ops-tx"
                : "border-transparent text-ops-tx3 hover:text-ops-tx2"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tabContent}
    </PageShell>
  )
}
