import "server-only"

import { db } from "@/lib/db"
import { metaCatalogCampaigns, metaCatalogAdsets, metaCatalogAds, campaigns as campaignsTable } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import type { MetaAdsClient } from "@/lib/meta-ads/client"

/**
 * Sync campaigns, adsets, and ads for an account into the catalog tables.
 * Idempotent — safe to call multiple times.
 */
export async function syncAdCatalog(
  client: MetaAdsClient,
  orgId: string,
  clientId: string
): Promise<{ campaigns: number; adsets: number; ads: number }> {
  const [campaigns, adsets, ads] = await Promise.all([
    client.getCampaigns(),
    client.getAdsets(),
    client.getAds(),
  ])

  // Build name → internalCampaignId map for auto-linking
  const internalCampaigns = await db
    .select({ id: campaignsTable.id, name: campaignsTable.name })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.orgId, orgId), eq(campaignsTable.clientId, clientId)))
  const internalNameMap = new Map(
    internalCampaigns.map((c) => [c.name.toLowerCase().trim(), c.id])
  )

  const now = new Date()

  for (const c of campaigns) {
    const matchedInternalId = internalNameMap.get(c.name.toLowerCase().trim()) ?? null

    await db
      .insert(metaCatalogCampaigns)
      .values({
        orgId,
        clientId,
        adAccountId: client.accountId,
        metaCampaignId: c.id,
        name: c.name,
        status: c.status,
        effectiveStatus: c.effective_status,
        objective: c.objective ?? null,
        startTime: c.start_time ? new Date(c.start_time) : null,
        stopTime: c.stop_time ? new Date(c.stop_time) : null,
        dailyBudget: c.daily_budget ?? null,
        lifetimeBudget: c.lifetime_budget ?? null,
        internalCampaignId: matchedInternalId,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [metaCatalogCampaigns.orgId, metaCatalogCampaigns.metaCampaignId],
        set: {
          name: c.name,
          status: c.status,
          effectiveStatus: c.effective_status,
          objective: c.objective ?? null,
          startTime: c.start_time ? new Date(c.start_time) : null,
          stopTime: c.stop_time ? new Date(c.stop_time) : null,
          dailyBudget: c.daily_budget ?? null,
          lifetimeBudget: c.lifetime_budget ?? null,
          // Only auto-link if not already manually set
          ...(matchedInternalId
            ? { internalCampaignId: sql`COALESCE(${metaCatalogCampaigns.internalCampaignId}, ${matchedInternalId}::uuid)` }
            : {}),
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .catch(() => undefined)
  }

  for (const a of adsets) {
    await db
      .insert(metaCatalogAdsets)
      .values({
        orgId,
        clientId,
        adAccountId: client.accountId,
        metaAdsetId: a.id,
        metaCampaignId: a.campaign_id,
        name: a.name,
        status: a.status,
        effectiveStatus: a.effective_status,
        targetingJson: (a.targeting as Record<string, unknown>) ?? {},
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [metaCatalogAdsets.orgId, metaCatalogAdsets.metaAdsetId],
        set: {
          name: a.name,
          status: a.status,
          effectiveStatus: a.effective_status,
          targetingJson: (a.targeting as Record<string, unknown>) ?? {},
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .catch(() => undefined)
  }

  for (const ad of ads) {
    await db
      .insert(metaCatalogAds)
      .values({
        orgId,
        clientId,
        adAccountId: client.accountId,
        metaAdId: ad.id,
        metaAdsetId: ad.adset_id,
        metaCampaignId: ad.campaign_id,
        name: ad.name,
        status: ad.status,
        effectiveStatus: ad.effective_status,
        creativeName: ad.creative?.name ?? null,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [metaCatalogAds.orgId, metaCatalogAds.metaAdId],
        set: {
          name: ad.name,
          status: ad.status,
          effectiveStatus: ad.effective_status,
          creativeName: ad.creative?.name ?? null,
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .catch(() => undefined)
  }

  return { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length }
}
