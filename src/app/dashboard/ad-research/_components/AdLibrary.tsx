"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2, BookOpen, Link } from "lucide-react"
import { AdCard } from "./AdCard"
import { ImportFromUrlForm } from "./ImportFromUrlForm"
import type { SavedAd, AdCollection, AdPlatform } from "@/domains/ad-research/types"
import { createCollectionAction, deleteCollectionAction } from "@/domains/ad-research/actions"
import { EmptyState, Panel, opsBtnPrimary, opsBtnSecondary, opsField } from "@/components/app/ops"

interface Props {
  savedAds: SavedAd[]
  collections: AdCollection[]
  onAdDeleted: (id: string) => void
  onAdMoved: (adId: string, collectionId: string | null) => void
  onCollectionCreated: (col: AdCollection) => void
  onCollectionDeleted: (id: string) => void
  onAdSaved: (ad: SavedAd) => void
}

export function AdLibrary({
  savedAds,
  collections,
  onAdDeleted,
  onAdMoved,
  onCollectionCreated,
  onCollectionDeleted,
  onAdSaved,
}: Props) {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | ''>('')
  const [showNewCollectionForm, setShowNewCollectionForm] = useState(false)
  const [showImportForm, setShowImportForm] = useState(false)
  const [newColName, setNewColName] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const filtered = savedAds.filter((ad) => {
    const matchCollection =
      selectedCollectionId === null
        ? true
        : selectedCollectionId === '__none__'
        ? ad.collectionId == null
        : ad.collectionId === selectedCollectionId
    const matchPlatform = platformFilter ? ad.platform === platformFilter : true
    return matchCollection && matchPlatform
  })

  function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault()
    if (!newColName.trim()) return
    startTransition(async () => {
      try {
        setError(null)
        const res = await createCollectionAction(newColName.trim())
        if (res.error) { setError(res.error); return }
        if (res.data) {
          onCollectionCreated(res.data)
          setNewColName("")
          setShowNewCollectionForm(false)
        }
      } catch {
        setError("Error al crear la colección.")
      }
    })
  }

  function handleDeleteCollection(id: string) {
    startTransition(async () => {
      try {
        await deleteCollectionAction(id)
        onCollectionDeleted(id)
        if (selectedCollectionId === id) setSelectedCollectionId(null)
      } catch {
        setError("Error al eliminar la colección.")
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <button
            onClick={() => setSelectedCollectionId(null)}
            className={
              selectedCollectionId === null
                ? "rounded-full bg-ops-sel px-3 py-1.5 text-xs font-semibold text-ops-blue transition-colors"
                : "rounded-full border border-ops-bd bg-ops-s2 px-3 py-1.5 text-xs font-medium text-ops-tx3 transition-colors hover:text-ops-tx2"
            }
          >
            Todos
          </button>

          <button
            onClick={() => setSelectedCollectionId('__none__')}
            className={
              selectedCollectionId === '__none__'
                ? "rounded-full bg-ops-sel px-3 py-1.5 text-xs font-semibold text-ops-blue transition-colors"
                : "rounded-full border border-ops-bd bg-ops-s2 px-3 py-1.5 text-xs font-medium text-ops-tx3 transition-colors hover:text-ops-tx2"
            }
          >
            Sin colección
          </button>

          {collections.map((col) => (
            <div key={col.id} className="flex items-center gap-1">
              <button
                onClick={() => setSelectedCollectionId(col.id)}
                className={
                  selectedCollectionId === col.id
                    ? "rounded-full bg-ops-sel px-3 py-1.5 text-xs font-semibold text-ops-blue transition-colors"
                    : "rounded-full border border-ops-bd bg-ops-s2 px-3 py-1.5 text-xs font-medium text-ops-tx3 transition-colors hover:text-ops-tx2"
                }
              >
                {col.name} ({col.itemCount})
              </button>
              <button
                onClick={() => handleDeleteCollection(col.id)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ops-tx3 transition-colors hover:text-ops-coral"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}

          <button
            onClick={() => setShowNewCollectionForm(!showNewCollectionForm)}
            className={opsBtnSecondary + " text-xs"}
          >
            <Plus className="h-3 w-3" />
            Nueva colección
          </button>
        </div>

        <button
          onClick={() => { setShowImportForm(true); setShowNewCollectionForm(false) }}
          className={opsBtnPrimary}
        >
          <Link className="h-3.5 w-3.5" />
          Importar desde URL
        </button>

        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value as AdPlatform | '')}
          className="h-9 rounded-full border border-ops-bd bg-ops-s1 px-3 text-xs text-ops-tx outline-none transition-colors hover:border-ops-bd2"
        >
          <option value="">Todas las plataformas</option>
          <option value="meta">Meta</option>
          <option value="tiktok">TikTok</option>
        </select>
      </div>

      {showImportForm && (
        <ImportFromUrlForm
          collections={collections}
          onSaved={(ad) => { onAdSaved(ad); setShowImportForm(false) }}
          onClose={() => setShowImportForm(false)}
        />
      )}

      {showNewCollectionForm && (
        <Panel>
          <form
            onSubmit={handleCreateCollection}
            className="flex gap-2 items-center p-4"
          >
            <input
              type="text"
              placeholder="Nombre de la colección..."
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              className={opsField + " flex-1"}
            />
            <button
              type="submit"
              disabled={isPending || !newColName.trim()}
              className={opsBtnPrimary + " disabled:opacity-50"}
            >
              Crear
            </button>
          </form>
        </Panel>
      )}

      {error && (
        <p className="text-sm text-ops-coral">{error}</p>
      )}

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No hay anuncios guardados"
            text="Importa anuncios pegando su URL o búscalos desde la pestaña Buscar"
            action={
              <button
                onClick={() => setShowImportForm(true)}
                className={opsBtnPrimary}
              >
                <Link className="h-3.5 w-3.5" />
                Importar desde URL
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              isSaved
              collections={collections}
              onDeleted={onAdDeleted}
              onMoved={onAdMoved}
            />
          ))}
        </div>
      )}
    </div>
  )
}
