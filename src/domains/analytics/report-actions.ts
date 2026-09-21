"use server"

import { requireOrganizationMembership } from "@/lib/auth/server"
import { requireClientAccess } from "@/lib/auth/server"
import { getReportData } from "./reports"
import type { ReportData } from "./reports"
import { db } from "@/lib/db"
import { organizations, clients } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getClientsByOrgId } from "@/domains/clients/repository"

export type { ReportData }

function parseMonth(month: string): { from: Date; to: Date } | null {
  const m = month.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = parseInt(m[1])
  const mon = parseInt(m[2]) - 1
  const from = new Date(Date.UTC(year, mon, 1, 0, 0, 0))
  const to = new Date(Date.UTC(year, mon + 1, 0, 23, 59, 59, 999))
  return { from, to }
}

export async function getReportDataAction(
  clientId: string,
  month: string,
): Promise<{ data?: ReportData; error?: string }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const range = parseMonth(month)
  if (!range) return { error: "Periodo inválido. Usa formato YYYY-MM." }

  const data = await getReportData(ctx.orgId, clientId, range.from, range.to)
  if (!data) return { error: "Cliente no encontrado" }

  return { data }
}

export async function getClientsForReportsAction(): Promise<
  { data?: { id: string; name: string }[]; error?: string }
> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const all = await getClientsByOrgId(ctx.orgId)
  return { data: all.map((c) => ({ id: c.id, name: c.name })) }
}

export async function toggleMonthlyReportAction(
  enabled: boolean,
): Promise<{ success?: boolean; error?: string }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  await db
    .update(organizations)
    .set({ monthlyReportEmail: enabled })
    .where(eq(organizations.id, ctx.orgId))

  return { success: true }
}

export async function getMonthlyReportSettingAction(): Promise<
  { enabled?: boolean; error?: string }
> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, ctx.orgId),
    columns: { monthlyReportEmail: true },
  })

  return { enabled: org?.monthlyReportEmail ?? false }
}

/** Used by the monthly cron to get all orgs with the email flag enabled. */
export async function getOrgsWithMonthlyReportEnabled(): Promise<
  { id: string; name: string; ownerId: string }[]
> {
  const rows = await db.query.organizations.findMany({
    where: eq(organizations.monthlyReportEmail, true),
    columns: { id: true, name: true, ownerId: true },
  })
  return rows
}

/** Used by cron to get all clients for a given org. */
export async function getClientsByOrgForReport(orgId: string) {
  return db.query.clients.findMany({
    where: eq(clients.orgId, orgId),
    columns: { id: true, name: true },
  })
}
