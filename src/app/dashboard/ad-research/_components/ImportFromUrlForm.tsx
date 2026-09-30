"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { Link, X, Image as ImageIcon, Loader2 } from "lucide-react"
import { importAdFromUrlAction } from "@/domains/ad-research/actions"
import { fetchAdPreviewAction } from "@/domains/ad-research/fetch-preview"
import type { AdPlatform, SavedAd, AdCollection } from "@/domains/ad-research/types"
import { opsField, opsBtnPrimary, opsBtnSecondary } from "@/components/app/ops"

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|avi|m4v)(\?|$)/i.test(url)
}

function MediaPreview({ url, onClear }: { url: string; onClear: () => void }) {
  const [videoFailed, setVideoFailed] = useState(false)
  const isVid = isVideoUrl(url)

  return (
    <div className="mt-2 rounded-[20px] overflow-hidden aspect-video relative bg-ops-s2 border border-ops-line">
      {isVid && !videoFailed ? (
        <video
          src={url}
          className="w-full h-full object-cover"
          controls
          muted
          playsInline
          onError={() => setVideoFailed(true)}
        />
      ) : isVid && videoFailed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <p className="text-xs text-ops-tx3">
            Video restringido (CORS) — se guardará el enlace
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={opsBtnPrimary + " text-xs"}
          >
            Ver video →
          </a>
        </div>
      ) : (
        <img
          src={url}
          alt="Preview"
          className="w-full h-full object-cover"
          onError={onClear}
        />
      )}
    </div>
  )
}

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
  const [thumbnailUrl, setThumbnailUrl] = useState("")
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
        thumbnailUrl: thumbnailUrl.trim() || null,
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
    <div className="rounded-[20px] border border-ops-line bg-ops-s1 shadow-ops-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4 text-ops-blue" />
          <span className="text-sm font-semibold text-ops-tx">
            Importar anuncio desde URL
          </span>
        </div>
        <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ops-tx3 transition-colors hover:bg-ops-hover hover:text-ops-tx">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* URL */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-ops-tx3">
            URL del anuncio *
          </label>
          <div className="relative">
            <input
              type="url"
              placeholder="https://www.facebook.com/ads/library/?id=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className={opsField + " w-full pr-36"}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {fetchingPreview && (
                <Loader2 className="h-3 w-3 animate-spin text-ops-tx3" />
              )}
              {detectedPlatform && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-ops-s2 text-ops-tx3 border border-ops-bd">
                  {platformLabel(detectedPlatform)}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Media preview + field */}
        <div className="space-y-1">
          <label className="text-xs font-medium flex items-center gap-1.5 text-ops-tx3">
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
              className={opsField + " flex-1"}
            />
            {mediaUrl && (
              <button
                type="button"
                onClick={() => setMediaUrl("")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ops-bd bg-ops-s2 text-ops-tx3 transition-colors hover:text-ops-tx"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {mediaUrl && (
            <MediaPreview url={mediaUrl} onClear={() => setMediaUrl("")} />
          )}
          {mediaUrl && isVideoUrl(mediaUrl) && (
            <div className="space-y-1 mt-2">
              <label className="text-xs font-medium flex items-center gap-1.5 text-ops-tx3">
                Imagen de portada del video
                <span className="font-normal opacity-70">(click derecho sobre el thumbnail en Facebook → copiar imagen)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://scontent.fbcdn.net/...jpg"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  className={opsField + " flex-1"}
                />
              </div>
              {thumbnailUrl && (
                <img
                  src={thumbnailUrl}
                  alt="Portada"
                  className="mt-1 w-full rounded-[12px] object-cover border border-ops-line"
                  style={{ maxHeight: 120 }}
                  onError={() => setThumbnailUrl("")}
                />
              )}
            </div>
          )}
        </div>

        {/* Advertiser + Title in 2 cols */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ops-tx3">
              Advertiser / Marca *
            </label>
            <input
              type="text"
              placeholder="Nombre del anunciante"
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              required
              className={opsField + " w-full"}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ops-tx3">
              Título del anuncio
            </label>
            <input
              type="text"
              placeholder="Ej: Oferta 50% descuento"
              value={adTitle}
              onChange={(e) => setAdTitle(e.target.value)}
              className={opsField + " w-full"}
            />
          </div>
        </div>

        {/* Body */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-ops-tx3">
            Copy del anuncio
          </label>
          <textarea
            placeholder="Texto del anuncio..."
            value={adBody}
            onChange={(e) => setAdBody(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-ops-bd bg-ops-s1 px-3 py-2 text-[13px] text-ops-tx outline-none transition-colors placeholder:text-ops-tx3 hover:border-ops-bd2 focus-visible:border-ops-blue focus-visible:ring-2 focus-visible:ring-ops-blue/20 resize-none"
          />
        </div>

        {/* Tags + Collection */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ops-tx3">
              Tags (separados por coma)
            </label>
            <input
              type="text"
              placeholder="moda, descuento, verano"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className={opsField + " w-full"}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ops-tx3">
              Colección
            </label>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className={opsField + " w-full"}
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
          <label className="text-xs font-medium text-ops-tx3">
            Notas / Por qué lo guardas
          </label>
          <input
            type="text"
            placeholder="Ej: Hook muy fuerte, buena prueba social..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={opsField + " w-full"}
          />
        </div>

        {error && (
          <p className="text-xs text-ops-coral">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={opsBtnSecondary}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending || !url.trim() || !advertiserName.trim()}
            className={opsBtnPrimary + " disabled:opacity-50"}
          >
            {isPending ? "Guardando..." : "Guardar anuncio"}
          </button>
        </div>
      </form>
    </div>
  )
}
