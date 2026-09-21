import { db } from "@/lib/db"
import { funnels, leads, campaigns, conversions } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import type { Funnel, NewFunnel, Lead, LeadStage, Temperature } from "@/lib/db/schema"
import type { LeadWithActivity } from "@/domains/leads/repository"

export async function getFunnelsByOrgId(orgId: string): Promise<Funnel[]> {
  return db.query.funnels.findMany({
    where: eq(funnels.orgId, orgId),
    orderBy: (f, { asc }) => [asc(f.createdAt)],
  })
}

export async function getFunnelById(funnelId: string, orgId: string): Promise<Funnel | null> {
  return (
    (await db.query.funnels.findFirst({
      where: and(eq(funnels.id, funnelId), eq(funnels.orgId, orgId)),
    })) ?? null
  )
}

export async function createFunnel(data: NewFunnel): Promise<Funnel> {
  const [funnel] = await db.insert(funnels).values(data).returning()
  return funnel
}

export async function updateFunnel(
  funnelId: string,
  orgId: string,
  data: Partial<NewFunnel>
): Promise<Funnel | null> {
  const [updated] = await db
    .update(funnels)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(funnels.id, funnelId), eq(funnels.orgId, orgId)))
    .returning()
  return updated ?? null
}

export async function deleteFunnel(funnelId: string, orgId: string): Promise<void> {
  await db.delete(funnels).where(and(eq(funnels.id, funnelId), eq(funnels.orgId, orgId)))
}

export interface KanbanFilters {
  campaignId?: string
  temperature?: string
  assignedTo?: string
}

export async function getLeadsForKanban(
  orgId: string,
  stageKeys: LeadStage[],
  filters: KanbanFilters = {}
): Promise<LeadWithActivity[]> {
  if (stageKeys.length === 0) return []

  const leadRows = await db.query.leads.findMany({
    where: and(
      eq(leads.orgId, orgId),
      inArray(leads.stage, stageKeys),
      filters.campaignId ? eq(leads.campaignId, filters.campaignId) : undefined,
      filters.temperature ? eq(leads.temperature, filters.temperature as Temperature) : undefined,
      filters.assignedTo ? eq(leads.assignedTo, filters.assignedTo) : undefined,
    ),
    orderBy: (l, { desc }) => [desc(l.createdAt)],
    limit: 500,
  })

  if (leadRows.length === 0) return []

  const leadIds = leadRows.map((l) => l.id)

  const convRows = await db
    .select({
      leadId: conversions.leadId,
      amount: conversions.amount,
      currency: conversions.currency,
    })
    .from(conversions)
    .where(
      and(
        eq(conversions.orgId, orgId),
        inArray(conversions.leadId, leadIds),
        eq(conversions.status, "confirmed")
      )
    )

  const convsByLead = new Map<string, typeof convRows>()
  for (const c of convRows) {
    if (!convsByLead.has(c.leadId)) convsByLead.set(c.leadId, [])
    convsByLead.get(c.leadId)!.push(c)
  }

  const saleSummary = new Map<string, { count: number; totalAmount: string | null; currency: string | null }>()
  for (const [lid, convs] of convsByLead) {
    const currencies = new Set(convs.map((c) => c.currency))
    if (currencies.size === 1) {
      const total = convs.reduce((acc, c) => acc + parseFloat(c.amount), 0)
      saleSummary.set(lid, { count: convs.length, totalAmount: total.toFixed(2), currency: convs[0].currency })
    } else {
      saleSummary.set(lid, { count: convs.length, totalAmount: null, currency: null })
    }
  }

  const emptyActivity = () => ({
    hasCheckout: false, hasAbandonedCart: false, hasFormSubmit: false,
    hasInfoRequest: false, hasAddToCart: false, lastEventAt: null,
  })

  return leadRows.map((lead) => {
    const sale = saleSummary.get(lead.id) ?? { count: 0, totalAmount: null, currency: null }
    return {
      ...lead,
      saleCount: sale.count,
      saleTotalAmount: sale.totalAmount,
      saleCurrency: sale.currency,
      hasPendingCapi: false,
      activity: emptyActivity(),
    }
  })
}

export async function getCampaignOptionsForFunnel(
  orgId: string
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .orderBy(campaigns.name)
}
