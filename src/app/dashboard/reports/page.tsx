import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { getOrganizationById } from "@/domains/organizations/repository"
import { getReportData } from "@/domains/analytics/reports"
import { ReportsView } from "./_components/ReportsView"
import { PageShell, PageHeader } from "@/components/app/ops"

function currentMonthString() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

function parseMonth(month: string): { from: Date; to: Date } {
  const m = month.match(/^(\d{4})-(\d{2})$/)
  if (!m) {
    const now = new Date()
    return {
      from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
    }
  }
  const year = parseInt(m[1])
  const mon = parseInt(m[2]) - 1
  return {
    from: new Date(Date.UTC(year, mon, 1)),
    to: new Date(Date.UTC(year, mon + 1, 0, 23, 59, 59, 999)),
  }
}

export const metadata = { title: "Reportes — SyncLead" }

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; clientId?: string }>
}) {
  let ctx: { orgId: string; userId: string }
  let orgMonthlyEmail = false

  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const sp = await searchParams
  const month = sp.month ?? currentMonthString()
  const range = parseMonth(month)

  const [allClients, org] = await Promise.all([
    getClientsByOrgId(ctx.orgId),
    getOrganizationById(ctx.orgId),
  ])
  orgMonthlyEmail = (org as { monthlyReportEmail?: boolean } | null)?.monthlyReportEmail ?? false

  const clientId = sp.clientId ?? allClients[0]?.id
  const reportData = clientId
    ? await getReportData(ctx.orgId, clientId, range.from, range.to)
    : null

  return (
    <PageShell>
      <PageHeader title="Reportes" subtitle="Resúmenes mensuales por cliente y campaña" />
      <ReportsView
        clients={allClients.map((c) => ({ id: c.id, name: c.name }))}
        selectedClientId={clientId ?? null}
        month={month}
        reportData={reportData}
        monthlyEmailEnabled={orgMonthlyEmail}
      />
    </PageShell>
  )
}
