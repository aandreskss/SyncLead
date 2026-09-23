"use client"

import { useState, useTransition } from "react"
import { AdSearchForm } from "./AdSearchForm"
import { AdResultsGrid } from "./AdResultsGrid"
import { AdLibrary } from "./AdLibrary"
import { searchAdsAction } from "@/domains/ad-research/actions"
import type { AdResult, SavedAd, AdCollection } from "@/domains/ad-research/types"
import type { SearchParams } from "./AdSearchForm"

interface Props {
  initialCollections: AdCollection[]
  initialSavedAds: SavedAd[]
}

type TabId = 'search' | 'library'

export function AdResearchDashboard({ initialCollections, initialSavedAds }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('search')
  const [results, setResults] = useState<AdResult[]>([])
  const [searchCountry, setSearchCountry] = useState<string>('VE')
  const [error, setError] = useState<string | null>(null)
  const [loading, startTransition] = useTransition()

  const [collections, setCollections] = useState<AdCollection[]>(initialCollections)
  const [savedAds, setSavedAds] = useState<SavedAd[]>(initialSavedAds)

  function handleSearch(params: SearchParams) {
    setSearchCountry(params.countries[0] ?? 'VE')
    startTransition(async () => {
      try {
        setError(null)
        const res = await searchAdsAction({
          query: params.query,
          countries: params.countries,
          platforms: params.platforms,
          activeOnly: params.activeOnly,
          period: params.period,
        })
        if (res.error) { setError(res.error); return }
        setResults(res.data ?? [])
      } catch (e) {
        setError("Error al buscar anuncios.")
      }
    })
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'search', label: 'Buscar' },
    { id: 'library', label: `Mi Biblioteca (${savedAds.length})` },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--sg-ink)" }}>
          Investigador de Anuncios
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--sg-muted)" }}>
          Explora anuncios de la competencia en Meta Ad Library y TikTok Creative Center
        </p>
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: "var(--sg-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === tab.id ? "var(--sg-ink)" : "var(--sg-muted)",
            }}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                style={{ background: "var(--sg-accent)" }}
              />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'search' && (
        <div className="space-y-2">
          <AdSearchForm onSearch={handleSearch} loading={loading} />
          {error && (
            <p className="text-sm" style={{ color: "var(--sg-danger)" }}>{error}</p>
          )}
          <AdResultsGrid
            results={results}
            loading={loading}
            collections={collections}
            country={searchCountry}
            onSaved={(saved) => {
              setSavedAds((prev) => [saved, ...prev])
            }}
          />
        </div>
      )}

      {activeTab === 'library' && (
        <AdLibrary
          savedAds={savedAds}
          collections={collections}
          onAdDeleted={(id) => setSavedAds((prev) => prev.filter((a) => a.id !== id))}
          onAdMoved={(adId, collectionId) => {
            setSavedAds((prev) =>
              prev.map((a) =>
                a.id === adId
                  ? {
                      ...a,
                      collectionId,
                      collectionName: collections.find((c) => c.id === collectionId)?.name ?? null,
                    }
                  : a
              )
            )
          }}
          onCollectionCreated={(col) => {
            setCollections((prev) => [...prev, col])
          }}
          onCollectionDeleted={(id) => {
            setCollections((prev) => prev.filter((c) => c.id !== id))
            setSavedAds((prev) =>
              prev.map((a) => (a.collectionId === id ? { ...a, collectionId: null, collectionName: null } : a))
            )
          }}
        />
      )}
    </div>
  )
}
