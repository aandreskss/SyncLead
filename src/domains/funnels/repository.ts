import { db } from "@/lib/db"
import { funnels, leads, campaigns } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import type { Funnel, NewFunnel, Lead, LeadStage, Temperature } from "@/lib/db/schema"

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
): Promise<Lead[]> {
  if (stageKeys.length === 0) return []

  return db.query.leads.findMany({
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
