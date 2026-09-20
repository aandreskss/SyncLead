import { db } from "@/lib/db"
import { campaigns, clients, leads } from "@/lib/db/schema"
import { eq, and, count } from "drizzle-orm"
import type { Campaign, Client, NewCampaign } from "@/lib/db/schema"

export type CampaignWithClient = Campaign & {
  client: Client | null
  leadCount: number
}

export async function getCampaignWithClientById(
  campaignId: string,
  orgId: string
): Promise<(Campaign & { client: Client | null }) | null> {
  const result = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)),
    with: { client: true },
  })
  return result ?? null
}

export async function getCampaignsWithClientAndCounts(orgId: string): Promise<CampaignWithClient[]> {
  const [allCampaigns, leadCounts] = await Promise.all([
    db.query.campaigns.findMany({
      where: eq(campaigns.orgId, orgId),
      with: { client: true },
      orderBy: (c, { desc: d }) => [d(c.createdAt)],
    }),
    db
      .select({ campaignId: leads.campaignId, count: count(leads.id) })
      .from(leads)
      .where(eq(leads.orgId, orgId))
      .groupBy(leads.campaignId),
  ])

  const countMap: Record<string, number> = {}
  for (const r of leadCounts) {
    countMap[r.campaignId] = Number(r.count)
  }

  return allCampaigns.map((c) => ({
    ...c,
    leadCount: countMap[c.id] ?? 0,
  }))
}

export async function getCampaignByApiKey(apiKey: string): Promise<Campaign | undefined> {
  return db.query.campaigns.findFirst({
    where: eq(campaigns.apiKey, apiKey),
  })
}

export async function createCampaign(data: NewCampaign): Promise<Campaign> {
  const [campaign] = await db.insert(campaigns).values(data).returning()
  return campaign
}

export async function updateCampaign(
  campaignId: string,
  orgId: string,
  data: Partial<NewCampaign>
): Promise<Campaign | undefined> {
  const [updated] = await db
    .update(campaigns)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning()
  return updated
}

export async function deleteCampaign(campaignId: string, orgId: string): Promise<void> {
  await db
    .delete(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
}
