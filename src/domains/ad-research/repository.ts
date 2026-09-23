import { db } from "@/lib/db"
import { adResearchCollections, adResearchItems } from "@/lib/db/schema"
import { eq, and, inArray, desc, sql } from "drizzle-orm"
import type { SavedAd, AdCollection, AdPlatform } from "./types"
import type { AdResult } from "./types"

function toSavedAd(
  item: typeof adResearchItems.$inferSelect,
  collectionName?: string | null
): SavedAd {
  return {
    id: item.id,
    platform: item.platform as AdPlatform,
    advertiserName: item.advertiserName,
    adTitle: item.adTitle,
    adBody: item.adBody,
    mediaType: item.mediaType,
    mediaUrls: item.mediaUrls,
    thumbnailUrl: item.thumbnailUrl,
    landingPageUrl: item.landingPageUrl,
    impressionsMin: item.impressionsLowerBound ?? null,
    impressionsMax: item.impressionsUpperBound ?? null,
    likesCount: item.likesCount ?? null,
    commentsCount: item.commentsCount ?? null,
    sharesCount: item.sharesCount ?? null,
    daysRunning: null,
    tags: item.tags,
    notes: item.notes,
    collectionId: item.collectionId ?? null,
    collectionName: collectionName ?? null,
    savedAt: item.savedAt,
  }
}

export async function saveAd(
  orgId: string,
  data: {
    result: AdResult
    collectionId?: string | null
    tags?: string[]
    notes?: string | null
    savedBy?: string | null
    country?: string
  }
): Promise<SavedAd> {
  const r = data.result
  const isMetaAd = r.platform === 'meta'

  const [inserted] = await db
    .insert(adResearchItems)
    .values({
      orgId,
      collectionId: data.collectionId ?? null,
      platform: r.platform,
      externalId: r.id,
      advertiserName: r.advertiserName,
      advertiserPageId: r.advertiserPageId,
      adTitle: r.adTitle,
      adBody: r.adBody,
      mediaType: r.mediaType,
      mediaUrls: r.mediaUrls,
      thumbnailUrl: isMetaAd ? null : (r as typeof r & { thumbnailUrl?: string | null }).thumbnailUrl ?? null,
      searchCountry: data.country ?? null,
      impressionsLowerBound: isMetaAd ? (r as { impressionsMin?: number | null }).impressionsMin ?? null : null,
      impressionsUpperBound: isMetaAd ? (r as { impressionsMax?: number | null }).impressionsMax ?? null : null,
      likesCount: !isMetaAd ? (r as { likesCount?: number }).likesCount ?? null : null,
      commentsCount: !isMetaAd ? (r as { commentsCount?: number }).commentsCount ?? null : null,
      sharesCount: !isMetaAd ? (r as { sharesCount?: number }).sharesCount ?? null : null,
      tags: data.tags ?? [],
      notes: data.notes ?? null,
      rawData: r as unknown as Record<string, unknown>,
      savedBy: data.savedBy ?? null,
    })
    .returning()

  return toSavedAd(inserted)
}

export async function getSavedAds(
  orgId: string,
  filters?: { collectionId?: string | null; platform?: AdPlatform; tags?: string[] }
): Promise<SavedAd[]> {
  const conditions = [eq(adResearchItems.orgId, orgId)]

  if (filters?.platform) {
    conditions.push(eq(adResearchItems.platform, filters.platform))
  }

  if (filters?.collectionId !== undefined) {
    if (filters.collectionId === null) {
      conditions.push(sql`${adResearchItems.collectionId} IS NULL`)
    } else {
      conditions.push(eq(adResearchItems.collectionId, filters.collectionId))
    }
  }

  const items = await db
    .select()
    .from(adResearchItems)
    .where(and(...conditions))
    .orderBy(desc(adResearchItems.savedAt))

  if (items.length === 0) return []

  const collectionIds = [...new Set(items.map((i) => i.collectionId).filter(Boolean) as string[])]
  const collections =
    collectionIds.length > 0
      ? await db
          .select({ id: adResearchCollections.id, name: adResearchCollections.name })
          .from(adResearchCollections)
          .where(inArray(adResearchCollections.id, collectionIds))
      : []

  const collectionMap = new Map(collections.map((c) => [c.id, c.name]))

  return items.map((item) =>
    toSavedAd(item, item.collectionId ? collectionMap.get(item.collectionId) ?? null : null)
  )
}

export async function deleteSavedAd(id: string, orgId: string): Promise<void> {
  await db
    .delete(adResearchItems)
    .where(and(eq(adResearchItems.id, id), eq(adResearchItems.orgId, orgId)))
}

export async function createCollection(
  orgId: string,
  data: { name: string; description?: string | null; createdBy?: string | null }
): Promise<AdCollection> {
  const [col] = await db
    .insert(adResearchCollections)
    .values({ orgId, name: data.name, description: data.description ?? null, createdBy: data.createdBy ?? null })
    .returning()

  return {
    id: col.id,
    name: col.name,
    description: col.description,
    itemCount: 0,
    createdAt: col.createdAt,
  }
}

export async function getCollections(orgId: string): Promise<AdCollection[]> {
  const cols = await db
    .select()
    .from(adResearchCollections)
    .where(eq(adResearchCollections.orgId, orgId))
    .orderBy(adResearchCollections.createdAt)

  if (cols.length === 0) return []

  const counts = await db
    .select({
      collectionId: adResearchItems.collectionId,
      count: sql<number>`count(*)::int`,
    })
    .from(adResearchItems)
    .where(
      and(
        eq(adResearchItems.orgId, orgId),
        inArray(
          adResearchItems.collectionId,
          cols.map((c) => c.id)
        )
      )
    )
    .groupBy(adResearchItems.collectionId)

  const countMap = new Map(counts.map((c) => [c.collectionId, c.count]))

  return cols.map((col) => ({
    id: col.id,
    name: col.name,
    description: col.description,
    itemCount: countMap.get(col.id) ?? 0,
    createdAt: col.createdAt,
  }))
}

export async function deleteCollection(id: string, orgId: string): Promise<void> {
  await db
    .delete(adResearchCollections)
    .where(and(eq(adResearchCollections.id, id), eq(adResearchCollections.orgId, orgId)))
}

export async function updateSavedAdNotes(id: string, orgId: string, notes: string): Promise<void> {
  await db
    .update(adResearchItems)
    .set({ notes })
    .where(and(eq(adResearchItems.id, id), eq(adResearchItems.orgId, orgId)))
}

export async function addTagToSavedAd(id: string, orgId: string, tag: string): Promise<void> {
  await db
    .update(adResearchItems)
    .set({ tags: sql`array_append(${adResearchItems.tags}, ${tag})` })
    .where(and(eq(adResearchItems.id, id), eq(adResearchItems.orgId, orgId)))
}

export async function importAdFromUrl(
  orgId: string,
  data: {
    url: string
    platform: AdPlatform
    advertiserName: string
    adTitle?: string | null
    adBody?: string | null
    mediaUrl?: string | null
    collectionId?: string | null
    tags?: string[]
    notes?: string | null
    savedBy?: string | null
  }
): Promise<SavedAd> {
  const mediaUrls = data.mediaUrl ? [data.mediaUrl] : []
  const isVideo = data.mediaUrl ? /\.(mp4|webm|mov|avi)/i.test(data.mediaUrl) : false

  const [inserted] = await db
    .insert(adResearchItems)
    .values({
      orgId,
      platform: data.platform,
      advertiserName: data.advertiserName,
      adTitle: data.adTitle ?? null,
      adBody: data.adBody ?? null,
      mediaType: mediaUrls.length > 0 ? (isVideo ? 'video' : 'image') : 'unknown',
      mediaUrls,
      thumbnailUrl: !isVideo && data.mediaUrl ? data.mediaUrl : null,
      landingPageUrl: data.url,
      collectionId: data.collectionId ?? null,
      tags: data.tags ?? [],
      notes: data.notes ?? null,
      rawData: { sourceUrl: data.url },
      savedBy: data.savedBy ?? null,
    })
    .returning()

  return toSavedAd(inserted)
}

export async function moveToCollection(id: string, orgId: string, collectionId: string | null): Promise<void> {
  await db
    .update(adResearchItems)
    .set({ collectionId })
    .where(and(eq(adResearchItems.id, id), eq(adResearchItems.orgId, orgId)))
}
