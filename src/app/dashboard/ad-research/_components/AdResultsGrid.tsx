"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { AdCard } from "./AdCard"
import type { AdResult, SavedAd, AdCollection } from "@/domains/ad-research/types"
import { EmptyState, Panel } from "@/components/app/ops"

interface Props {
  results: AdResult[]
  loading: boolean
  collections: AdCollection[]
  country?: string
  onSaved?: (saved: SavedAd) => void
}

type SortKey = 'days' | 'impressions' | 'engagement'

export function AdResultsGrid({ results, loading, collections, country, onSaved }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('days')

  const sorted = [...results].sort((a, b) => {
    if (sortKey === 'days') {
      const dA = (a as { daysRunning?: number }).daysRunning ?? 0
      const dB = (b as { daysRunning?: number }).daysRunning ?? 0
      return dB - dA
    }
    if (sortKey === 'impressions') {
      const iA = (a as { impressionsMax?: number | null }).impressionsMax ?? 0
      const iB = (b as { impressionsMax?: number | null }).impressionsMax ?? 0
      return iB - iA
    }
    if (sortKey === 'engagement') {
      const eA = ((a as { likesCount?: number }).likesCount ?? 0) + ((a as { commentsCount?: number }).commentsCount ?? 0)
      const eB = ((b as { likesCount?: number }).likesCount ?? 0) + ((b as { commentsCount?: number }).commentsCount ?? 0)
      return eB - eA
    }
    return 0
  })

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[20px] border border-ops-line bg-ops-s1 h-72 animate-pulse shadow-ops-card"
          />
        ))}
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="Busca anuncios de la competencia"
          text="Ingresa un keyword o nombre de advertiser y selecciona la plataforma"
        />
      </Panel>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ops-tx3">
          {results.length} anuncios encontrados
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ops-tx3">Ordenar:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-8 rounded-full border border-ops-bd bg-ops-s1 px-3 text-xs text-ops-tx outline-none transition-colors hover:border-ops-bd2"
          >
            <option value="days">Días activo</option>
            <option value="impressions">Impresiones</option>
            <option value="engagement">Engagement</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((ad, i) => (
          <AdCard
            key={ad.id || i}
            ad={ad}
            collections={collections}
            country={country}
            onSaved={onSaved}
          />
        ))}
      </div>
    </div>
  )
}
