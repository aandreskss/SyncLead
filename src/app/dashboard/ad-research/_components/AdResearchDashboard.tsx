"use client"

import { useState, useTransition } from "react"
import { AdSearchForm } from "./AdSearchForm"
import { AdResultsGrid } from "./AdResultsGrid"
import { AdLibrary } from "./AdLibrary"
import { searchAdsAction } from "@/domains/ad-research/actions"
import type { AdResult, SavedAd, AdCollection } from "@/domains/ad-research/types"
import type { SearchParams } from "./AdSearchForm"
import { PageShell, PageHeader, Panel, opsBtnPrimary } from "@/components/app/ops"

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
  const [pendingAccess, setPendingAccess] = useState(false)
  const [loading, startTransition] = useTransition()

  const [collections, setCollections] = useState<AdCollection[]>(initialCollections)
  const [savedAds, setSavedAds] = useState<SavedAd[]>(initialSavedAds)

  function handleSearch(params: SearchParams) {
    setSearchCountry(params.countries[0] ?? 'VE')
    startTransition(async () => {
      try {
        setError(null)
        setPendingAccess(false)
        const res = await searchAdsAction({
          query: params.query,
          countries: params.countries,
          platforms: params.platforms,
          activeOnly: params.activeOnly,
          period: params.period,
        })
        if (res.pendingAccess) { setPendingAccess(true); setResults([]); return }
        if (res.error) { setError(res.error); return }
        setResults(res.data ?? [])
      } catch {
        setError("Error al buscar anuncios.")
      }
    })
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'search', label: 'Buscar' },
    { id: 'library', label: `Mi Biblioteca (${savedAds.length})` },
  ]

  return (
    <PageShell>
      <PageHeader
        eyebrow="INVESTIGADOR DE ANUNCIOS"
        title="Investigador de Anuncios"
        subtitle="Explora anuncios de la competencia en Meta Ad Library y TikTok Creative Center"
      />

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-full bg-ops-s2 border border-ops-line p-1 self-start w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? "rounded-full bg-ops-sel px-4 py-1.5 text-sm font-semibold text-ops-blue transition-colors"
                : "rounded-full px-4 py-1.5 text-sm text-ops-tx3 transition-colors hover:text-ops-tx2"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'search' && (
        <div className="space-y-4">
          <AdSearchForm onSearch={handleSearch} loading={loading} />
          {error && (
            <p className="text-sm text-ops-coral">{error}</p>
          )}
          {pendingAccess && (
            <Panel variant="coral">
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <p className="text-sm font-semibold text-ops-tx">
                  Acceso a Meta Ad Library pendiente de aprobación
                </p>
                <p className="text-sm text-ops-tx2 max-w-md">
                  Para buscar anuncios de competidores necesitas solicitar acceso al API de Meta Ad Library.
                  El proceso toma entre 1 y 7 días.
                </p>
                <a
                  href="https://www.facebook.com/ads/library/api/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={opsBtnPrimary}
                >
                  Solicitar acceso en Meta →
                </a>
              </div>
            </Panel>
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
          onAdSaved={(ad) => setSavedAds((prev) => [ad, ...prev])}
        />
      )}
    </PageShell>
  )
}
