export interface TikTokAdResult {
  id: string
  platform: 'tiktok'
  advertiserName: string
  advertiserPageId: string
  adTitle: string | null
  adBody: string | null
  mediaType: 'video'
  mediaUrls: string[]
  thumbnailUrl: string | null
  likesCount: number
  commentsCount: number
  sharesCount: number
  daysRunning: number | null
  country: string
}

export const TIKTOK_INDUSTRIES: Record<string, string> = {
  'E-commerce': 'ecommerce',
  'Ropa y moda': 'clothing_accessories',
  'Belleza': 'beauty',
  'Salud y fitness': 'health_fitness',
  'Tecnología': 'tech',
  'Alimentos y bebidas': 'food_beverage',
  'Entretenimiento': 'entertainment',
  'Educación': 'education',
  'Viajes': 'travel',
  'Finanzas': 'finance',
}

export async function searchTikTokTopAds(params: {
  country: string
  period: 7 | 30 | 180
  industryId?: string
  limit?: number
}): Promise<TikTokAdResult[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)

  try {
    const res = await fetch('https://ads.tiktok.com/creative_radar_api/v1/top_ads/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        industry_id: params.industryId ?? '',
        country_code: params.country,
        period_type: params.period,
        page: 1,
        limit: params.limit ?? 20,
      }),
      signal: controller.signal,
    })

    if (!res.ok) return []

    const json = await res.json() as { code?: number; data?: { materials?: unknown[] } }
    if (json.code !== 0 || !Array.isArray(json.data?.materials)) return []

    return json.data.materials.map((raw: unknown) => {
      const item = raw as Record<string, unknown>
      const metrics = item.metrics as Record<string, number> | undefined
      const advertiser = item.advertiser_info as Record<string, unknown> | undefined

      return {
        id: String(item.ad_id ?? item.id ?? ''),
        platform: 'tiktok' as const,
        advertiserName: String(advertiser?.name ?? item.advertiser_name ?? ''),
        advertiserPageId: String(advertiser?.id ?? ''),
        adTitle: item.ad_title ? String(item.ad_title) : null,
        adBody: item.body ? String(item.body) : null,
        mediaType: 'video' as const,
        mediaUrls: item.video_url ? [String(item.video_url)] : [],
        thumbnailUrl: item.cover ? String(item.cover) : null,
        likesCount: metrics?.like_count ?? 0,
        commentsCount: metrics?.comment_count ?? 0,
        sharesCount: metrics?.share_count ?? 0,
        daysRunning: null,
        country: params.country,
      }
    })
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
