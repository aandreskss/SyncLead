import "server-only"

export interface MetaAdResult {
  id: string
  platform: 'meta'
  advertiserName: string
  advertiserPageId: string
  adTitle: string | null
  adBody: string | null
  mediaType: 'image' | 'video' | 'unknown'
  mediaUrls: string[]
  snapshotUrl: string | null
  impressionsMin: number | null
  impressionsMax: number | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  daysRunning: number
  country: string
}

function calcDaysRunning(startDate: string | null, endDate: string | null): number {
  if (!startDate) return 0
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : new Date()
  const diffMs = end.getTime() - start.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export async function searchMetaAds(params: {
  searchTerms?: string
  pageId?: string
  countries: string[]
  activeOnly?: boolean
  mediaType?: 'ALL' | 'IMAGE' | 'VIDEO'
  limit?: number
}): Promise<MetaAdResult[]> {
  // Prefer long-lived user token (requires Ads Library API access approval)
  // Fallback to App Token (APP_ID|APP_SECRET) — both need Ads Library API access
  const userToken = process.env.META_USER_ACCESS_TOKEN
  const appId = process.env.META_AD_LIBRARY_APP_ID
  const appSecret = process.env.META_APP_SECRET

  const token = userToken ?? (appId && appSecret ? `${appId}|${appSecret}` : null)

  if (!token) {
    throw new Error('META_USER_ACCESS_TOKEN no está configurado.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const searchQuery = params.searchTerms || params.pageId || ''
    if (!searchQuery) return []

    const qs = new URLSearchParams({
      access_token: token,
      search_terms: params.searchTerms || '',
      ad_reached_countries: JSON.stringify(params.countries),
      ad_active_status: params.activeOnly ? 'ACTIVE' : 'ALL',
      ad_type: 'ALL',
      limit: String(Math.min(params.limit ?? 20, 100)),
      fields: 'id,page_name,page_id,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,impressions,spend,media_type',
    })

    if (params.pageId && !params.searchTerms) {
      qs.delete('search_terms')
      qs.set('search_page_ids', JSON.stringify([params.pageId]))
    }

    if (params.mediaType && params.mediaType !== 'ALL') {
      qs.set('media_type', params.mediaType)
    }

    const apiVersion = process.env.META_GRAPH_API_VERSION ?? 'v19.0'
    const url = `https://graph.facebook.com/${apiVersion}/ads_archive?${qs.toString()}`

    const res = await fetch(url, { signal: controller.signal })
    const json = await res.json() as { data?: unknown[]; error?: { message?: string; code?: number } }

    if (!res.ok || json.error) {
      const subcode = json.error?.code
      if (subcode === 10) {
        throw new Error('META_ACCESS_PENDING')
      }
      throw new Error(json.error?.message ?? `Meta API error ${res.status}`)
    }

    if (!Array.isArray(json.data)) return []

    const results: MetaAdResult[] = json.data.map((raw: unknown) => {
      const item = raw as Record<string, unknown>
      const impressions = item.impressions as { lower_bound?: string; upper_bound?: string } | undefined
      const bodies = item.ad_creative_bodies as string[] | undefined
      const titles = item.ad_creative_link_titles as string[] | undefined
      const startDate = item.ad_delivery_start_time as string | null ?? null
      const endDate = item.ad_delivery_stop_time as string | null ?? null
      const rawMediaType = (item.media_type as string | undefined)?.toLowerCase() ?? ''
      const mediaType: 'image' | 'video' | 'unknown' =
        rawMediaType === 'image' ? 'image' : rawMediaType === 'video' ? 'video' : 'unknown'

      return {
        id: String(item.id ?? ''),
        platform: 'meta' as const,
        advertiserName: String(item.page_name ?? ''),
        advertiserPageId: String(item.page_id ?? ''),
        adTitle: titles?.[0] ?? null,
        adBody: bodies?.[0] ?? null,
        mediaType,
        mediaUrls: [],
        snapshotUrl: item.ad_snapshot_url ? String(item.ad_snapshot_url) : null,
        impressionsMin: impressions?.lower_bound ? parseInt(impressions.lower_bound, 10) : null,
        impressionsMax: impressions?.upper_bound ? parseInt(impressions.upper_bound, 10) : null,
        startDate,
        endDate,
        isActive: !endDate || new Date(endDate) > new Date(),
        daysRunning: calcDaysRunning(startDate, endDate),
        country: params.countries[0] ?? '',
      }
    })

    results.sort((a, b) => b.daysRunning - a.daysRunning)
    return results
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
