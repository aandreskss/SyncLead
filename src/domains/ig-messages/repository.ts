import "server-only"
import { db } from "@/lib/db"
import {
  instagramMessageSources,
  metaCatalogAds,
  metaCatalogCampaigns,
} from "@/lib/db/schema"
import { eq, and, isNotNull } from "drizzle-orm"

// ─── Source lookup ────────────────────────────────────────────────────────────

export interface IgMessageSourceRow {
  orgId: string
  campaignId: string | null
  pageAccessTokenEnc: string | null
  keyVersion: number
  verifyToken: string
}

/**
 * Finds an active Instagram message source by ig_page_id.
 * Used by the webhook to determine which org+campaign owns the inbound DM.
 */
export async function getIgMessageSourceByPageId(
  igPageId: string,
): Promise<IgMessageSourceRow | null> {
  const rows = await db
    .select({
      orgId: instagramMessageSources.orgId,
      campaignId: instagramMessageSources.campaignId,
      pageAccessTokenEnc: instagramMessageSources.pageAccessTokenEnc,
      keyVersion: instagramMessageSources.keyVersion,
      verifyToken: instagramMessageSources.verifyToken,
    })
    .from(instagramMessageSources)
    .where(
      and(
        eq(instagramMessageSources.igPageId, igPageId),
        eq(instagramMessageSources.isActive, true),
      )
    )
    .limit(1)

  return rows[0] ?? null
}

// ─── Campaign routing ─────────────────────────────────────────────────────────

/**
 * Resolves a SyncLead campaign from a Meta ad_id via the catalog chain:
 * meta_catalog_ads → meta_catalog_campaigns.internal_campaign_id
 *
 * Used as primary routing for IG DM leads when a specific campaign_id
 * is not configured on the instagram_message_sources row.
 */
export async function resolveIgCampaignFromAdId(
  orgId: string,
  metaAdId: string,
): Promise<{
  campaignId: string
  metaCampaignId: string
  metaAdsetId: string
  adName: string
  campaignName: string
} | null> {
  const adRows = await db
    .select({
      metaCampaignId: metaCatalogAds.metaCampaignId,
      metaAdsetId: metaCatalogAds.metaAdsetId,
      adName: metaCatalogAds.name,
    })
    .from(metaCatalogAds)
    .where(and(eq(metaCatalogAds.orgId, orgId), eq(metaCatalogAds.metaAdId, metaAdId)))
    .limit(1)

  const ad = adRows[0]
  if (!ad) return null

  const campaignRows = await db
    .select({
      internalCampaignId: metaCatalogCampaigns.internalCampaignId,
      campaignName: metaCatalogCampaigns.name,
    })
    .from(metaCatalogCampaigns)
    .where(
      and(
        eq(metaCatalogCampaigns.orgId, orgId),
        eq(metaCatalogCampaigns.metaCampaignId, ad.metaCampaignId),
        isNotNull(metaCatalogCampaigns.internalCampaignId),
      )
    )
    .limit(1)

  const campaign = campaignRows[0]
  if (!campaign?.internalCampaignId) return null

  return {
    campaignId: campaign.internalCampaignId,
    metaCampaignId: ad.metaCampaignId,
    metaAdsetId: ad.metaAdsetId,
    adName: ad.adName,
    campaignName: campaign.campaignName,
  }
}
