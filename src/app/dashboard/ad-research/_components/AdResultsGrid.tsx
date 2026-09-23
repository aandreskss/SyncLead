"use client"

import { useState } from "react"
import { AdCard } from "./AdCard"
import type { AdResult, SavedAd, AdCollection } from "@/domains/ad-research/types"

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
            className="rounded-xl border h-72 animate-pulse"
            style={{ borderColor: "var(--sg-border)", background: "var(--sg-s1)" }}
          />
        ))}
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium" style={{ color: "var(--sg-ink)" }}>
          Busca anuncios de la competencia
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--sg-muted)" }}>
          Ingresa un keyword o nombre de advertiser y selecciona la plataforma
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--sg-muted)" }}>
          {results.length} anuncios encontrados
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--sg-muted)" }}>Ordenar:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="px-2 py-1 rounded-lg text-xs focus:outline-none"
            style={{
              background: "var(--sg-s2)",
              border: "1px solid var(--sg-border)",
              color: "var(--sg-ink)",
            }}
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
