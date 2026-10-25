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

export interface IgMessageSourcePublic {
  id: string
  igPageId: string
  verifyToken: string
  campaignId: string | null
  hasToken: boolean
}

export async function getIgMessageSourceByCampaignId(
  campaignId: string,
  orgId: string,
): Promise<IgMessageSourcePublic | null> {
  const rows = await db
    .select({
      id: instagramMessageSources.id,
      igPageId: instagramMessageSources.igPageId,
      verifyToken: instagramMessageSources.verifyToken,
      campaignId: instagramMessageSources.campaignId,
      pageAccessTokenEnc: instagramMessageSources.pageAccessTokenEnc,
    })
    .from(instagramMessageSources)
    .where(
      and(
        eq(instagramMessageSources.campaignId, campaignId),
        eq(instagramMessageSources.orgId, orgId),
      )
    )
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    igPageId: row.igPageId,
    verifyToken: row.verifyToken,
    campaignId: row.campaignId,
    hasToken: !!row.pageAccessTokenEnc,
  }
}

export async function insertIgMessageSource(data: {
  orgId: string
  campaignId: string
  igPageId: string
  pageAccessTokenEnc: string
  keyVersion: number
  verifyToken: string
}): Promise<IgMessageSourcePublic> {
  const [row] = await db
    .insert(instagramMessageSources)
    .values({ ...data, isActive: true })
    .returning({
      id: instagramMessageSources.id,
      igPageId: instagramMessageSources.igPageId,
      verifyToken: instagramMessageSources.verifyToken,
      campaignId: instagramMessageSources.campaignId,
    })
  return { ...row, hasToken: true }
}

export async function updateIgMessageSource(
  id: string,
  orgId: string,
  data: { igPageId?: string; pageAccessTokenEnc?: string; keyVersion?: number },
): Promise<void> {
  await db
    .update(instagramMessageSources)
    .set(data)
    .where(
      and(
        eq(instagramMessageSources.id, id),
        eq(instagramMessageSources.orgId, orgId),
      )
    )
}

export async function deleteIgMessageSourceByCampaign(
  campaignId: string,
  orgId: string,
): Promise<void> {
  await db
    .delete(instagramMessageSources)
    .where(
      and(
        eq(instagramMessageSources.campaignId, campaignId),
        eq(instagramMessageSources.orgId, orgId),
      )
    )
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
