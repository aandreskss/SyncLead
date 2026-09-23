"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2, BookOpen } from "lucide-react"
import { AdCard } from "./AdCard"
import type { SavedAd, AdCollection, AdPlatform } from "@/domains/ad-research/types"
import { createCollectionAction, deleteCollectionAction } from "@/domains/ad-research/actions"

interface Props {
  savedAds: SavedAd[]
  collections: AdCollection[]
  onAdDeleted: (id: string) => void
  onAdMoved: (adId: string, collectionId: string | null) => void
  onCollectionCreated: (col: AdCollection) => void
  onCollectionDeleted: (id: string) => void
}

export function AdLibrary({
  savedAds,
  collections,
  onAdDeleted,
  onAdMoved,
  onCollectionCreated,
  onCollectionDeleted,
}: Props) {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | ''>('')
  const [showNewCollectionForm, setShowNewCollectionForm] = useState(false)
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
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: selectedCollectionId === null ? "var(--sg-accent)" : "var(--sg-s2)",
              color: selectedCollectionId === null ? "var(--sg-on-accent)" : "var(--sg-muted)",
              border: "1px solid var(--sg-border)",
            }}
          >
            Todos
          </button>

          <button
            onClick={() => setSelectedCollectionId('__none__')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: selectedCollectionId === '__none__' ? "var(--sg-accent)" : "var(--sg-s2)",
              color: selectedCollectionId === '__none__' ? "var(--sg-on-accent)" : "var(--sg-muted)",
              border: "1px solid var(--sg-border)",
            }}
          >
            Sin colección
          </button>

          {collections.map((col) => (
            <div key={col.id} className="flex items-center gap-1">
              <button
                onClick={() => setSelectedCollectionId(col.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: selectedCollectionId === col.id ? "var(--sg-accent)" : "var(--sg-s2)",
                  color: selectedCollectionId === col.id ? "var(--sg-on-accent)" : "var(--sg-muted)",
                  border: "1px solid var(--sg-border)",
                }}
              >
                {col.name} ({col.itemCount})
              </button>
              <button
                onClick={() => handleDeleteCollection(col.id)}
                className="p-1 rounded transition-colors"
                style={{ color: "var(--sg-subtle)" }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}

          <button
            onClick={() => setShowNewCollectionForm(!showNewCollectionForm)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ color: "var(--sg-muted)", background: "var(--sg-s2)", border: "1px solid var(--sg-border)" }}
          >
            <Plus className="h-3 w-3" />
            Nueva colección
          </button>
        </div>

        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value as AdPlatform | '')}
          className="px-3 py-1.5 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--sg-s2)",
            border: "1px solid var(--sg-border)",
            color: "var(--sg-ink)",
          }}
        >
          <option value="">Todas las plataformas</option>
          <option value="meta">Meta</option>
          <option value="tiktok">TikTok</option>
        </select>
      </div>

      {showNewCollectionForm && (
        <form
          onSubmit={handleCreateCollection}
          className="flex gap-2 items-center p-3 rounded-xl border"
          style={{ borderColor: "var(--sg-border)", background: "var(--sg-s1)" }}
        >
          <input
            type="text"
            placeholder="Nombre de la colección..."
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{
              background: "var(--sg-s2)",
              border: "1px solid var(--sg-border)",
              color: "var(--sg-ink)",
            }}
          />
          <button
            type="submit"
            disabled={isPending || !newColName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--sg-accent)", color: "var(--sg-on-accent)" }}
          >
            Crear
          </button>
        </form>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--sg-danger)" }}>{error}</p>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="h-10 w-10 mb-3" style={{ color: "var(--sg-subtle)" }} />
          <p className="text-base font-medium" style={{ color: "var(--sg-ink)" }}>
            No hay anuncios guardados
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--sg-muted)" }}>
            Busca y guarda anuncios desde la pestaña Buscar
          </p>
        </div>
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
