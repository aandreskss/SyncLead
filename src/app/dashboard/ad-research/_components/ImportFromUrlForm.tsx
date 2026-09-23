"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { Link, X, Image as ImageIcon, Loader2 } from "lucide-react"
import { importAdFromUrlAction } from "@/domains/ad-research/actions"
import { fetchAdPreviewAction } from "@/domains/ad-research/fetch-preview"
import type { AdPlatform, SavedAd, AdCollection } from "@/domains/ad-research/types"

function detectPlatform(url: string): AdPlatform {
  if (/facebook\.com|fb\.watch/i.test(url)) return 'meta'
  if (/instagram\.com/i.test(url)) return 'meta'
  if (/tiktok\.com/i.test(url)) return 'tiktok'
  return 'meta'
}

function platformLabel(p: AdPlatform) {
  return p === 'meta' ? 'Meta / Instagram' : 'TikTok'
}

interface Props {
  collections: AdCollection[]
  onSaved: (ad: SavedAd) => void
  onClose: () => void
}

export function ImportFromUrlForm({ collections, onSaved, onClose }: Props) {
  const [url, setUrl] = useState("")
  const [advertiserName, setAdvertiserName] = useState("")
  const [adTitle, setAdTitle] = useState("")
  const [adBody, setAdBody] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [tagsRaw, setTagsRaw] = useState("")
  const [collectionId, setCollectionId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [fetchingPreview, setFetchingPreview] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const detectedPlatform = url.trim() ? detectPlatform(url.trim()) : null

  // Auto-fetch OG preview when URL changes
  useEffect(() => {
    const trimmed = url.trim()
    if (!trimmed || !trimmed.startsWith("http")) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setFetchingPreview(true)
      try {
        const meta = await fetchAdPreviewAction(trimmed)
        if (meta.imageUrl && !mediaUrl) setMediaUrl(meta.imageUrl)
        if (meta.title && !adTitle) setAdTitle(meta.title)
        if (meta.description && !adBody) setAdBody(meta.description)
      } catch {}
      setFetchingPreview(false)
    }, 800)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || !advertiserName.trim()) return

    startTransition(async () => {
      setError(null)
      const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      const res = await importAdFromUrlAction({
        url: url.trim(),
        platform: detectPlatform(url.trim()),
        advertiserName: advertiserName.trim(),
        adTitle: adTitle.trim() || null,
        adBody: adBody.trim() || null,
        mediaUrl: mediaUrl.trim() || null,
        notes: notes.trim() || null,
        collectionId: collectionId || null,
        tags,
      })
      if (res.error) { setError(res.error); return }
      if (res.data) {
        onSaved(res.data)
        onClose()
      }
    })
  }

  return (
    <div
      className="rounded-xl border p-5 space-y-4"
      style={{ borderColor: "var(--sg-border)", background: "var(--sg-s1)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4" style={{ color: "var(--sg-accent)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--sg-ink)" }}>
            Importar anuncio desde URL
          </span>
        </div>
        <button onClick={onClose} style={{ color: "var(--sg-muted)" }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* URL */}
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: "var(--sg-muted)" }}>
            URL del anuncio *
          </label>
          <div className="relative">
            <input
              type="url"
              placeholder="https://www.facebook.com/ads/library/?id=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none pr-36"
              style={{
                background: "var(--sg-s2)",
                border: "1px solid var(--sg-border)",
                color: "var(--sg-ink)",
              }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {fetchingPreview && (
                <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--sg-muted)" }} />
              )}
              {detectedPlatform && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "var(--sg-s3)", color: "var(--sg-muted)" }}
                >
                  {platformLabel(detectedPlatform)}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Media preview + field */}
        <div className="space-y-1">
          <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: "var(--sg-muted)" }}>
            <ImageIcon className="h-3 w-3" />
            URL de imagen / video
            <span className="font-normal opacity-70">(se detecta automáticamente o pega la URL directa)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://scontent.fbcdn.net/... o cualquier imagen directa"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                background: "var(--sg-s2)",
                border: "1px solid var(--sg-border)",
                color: "var(--sg-ink)",
              }}
            />
            {mediaUrl && (
              <button
                type="button"
                onClick={() => setMediaUrl("")}
                className="px-2 rounded-lg"
                style={{ color: "var(--sg-muted)", background: "var(--sg-s2)", border: "1px solid var(--sg-border)" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {mediaUrl && (
            <div
              className="mt-2 rounded-lg overflow-hidden aspect-video relative"
              style={{ background: "var(--sg-s2)", border: "1px solid var(--sg-border)" }}
            >
              {/\.(mp4|webm|mov|avi)/i.test(mediaUrl) ? (
                <video
                  src={mediaUrl}
                  className="w-full h-full object-cover"
                  controls
                  muted
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={() => setMediaUrl("")}
                />
              )}
            </div>
          )}
        </div>

        {/* Advertiser + Title in 2 cols */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--sg-muted)" }}>
              Advertiser / Marca *
            </label>
            <input
              type="text"
              placeholder="Nombre del anunciante"
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                background: "var(--sg-s2)",
                border: "1px solid var(--sg-border)",
                color: "var(--sg-ink)",
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--sg-muted)" }}>
              Título del anuncio
            </label>
            <input
              type="text"
              placeholder="Ej: Oferta 50% descuento"
              value={adTitle}
              onChange={(e) => setAdTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                background: "var(--sg-s2)",
                border: "1px solid var(--sg-border)",
                color: "var(--sg-ink)",
              }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: "var(--sg-muted)" }}>
            Copy del anuncio
          </label>
          <textarea
            placeholder="Texto del anuncio..."
            value={adBody}
            onChange={(e) => setAdBody(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
            style={{
              background: "var(--sg-s2)",
              border: "1px solid var(--sg-border)",
              color: "var(--sg-ink)",
            }}
          />
        </div>

        {/* Tags + Collection */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--sg-muted)" }}>
              Tags (separados por coma)
            </label>
            <input
              type="text"
              placeholder="moda, descuento, verano"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                background: "var(--sg-s2)",
                border: "1px solid var(--sg-border)",
                color: "var(--sg-ink)",
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--sg-muted)" }}>
              Colección
            </label>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                background: "var(--sg-s2)",
                border: "1px solid var(--sg-border)",
                color: "var(--sg-ink)",
              }}
            >
              <option value="">Sin colección</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: "var(--sg-muted)" }}>
            Notas / Por qué lo guardas
          </label>
          <input
            type="text"
            placeholder="Ej: Hook muy fuerte, buena prueba social..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{
              background: "var(--sg-s2)",
              border: "1px solid var(--sg-border)",
              color: "var(--sg-ink)",
            }}
          />
        </div>

        {error && (
          <p className="text-xs" style={{ color: "var(--sg-danger)" }}>{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: "var(--sg-muted)" }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending || !url.trim() || !advertiserName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--sg-accent)", color: "var(--sg-on-accent)" }}
          >
            {isPending ? "Guardando..." : "Guardar anuncio"}
          </button>
        </div>
      </form>
    </div>
  )
}
