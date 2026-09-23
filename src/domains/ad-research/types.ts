import type { MetaAdResult } from "@/lib/ad-research/meta"
import type { TikTokAdResult } from "@/lib/ad-research/tiktok"

export type AdPlatform = 'meta' | 'tiktok'

export type AdResult = MetaAdResult | TikTokAdResult

export interface SavedAd {
  id: string
  platform: AdPlatform
  advertiserName: string
  adTitle: string | null
  adBody: string | null
  mediaType: string
  mediaUrls: string[]
  thumbnailUrl: string | null
  landingPageUrl: string | null
  impressionsMin: number | null
  impressionsMax: number | null
  likesCount: number | null
  commentsCount: number | null
  sharesCount: number | null
  daysRunning: number | null
  tags: string[]
  notes: string | null
  collectionId: string | null
  collectionName: string | null
  savedAt: Date
}

export interface AdCollection {
  id: string
  name: string
  description: string | null
  itemCount: number
  createdAt: Date
}

export const SUPPORTED_COUNTRIES = [
  { code: 'VE', name: 'Venezuela' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'CO', name: 'Colombia' },
  { code: 'MX', name: 'México' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'PE', name: 'Perú' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'ES', name: 'España' },
  { code: 'BR', name: 'Brasil' },
] as const
