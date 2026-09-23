"use client"

import { useState, useTransition } from "react"
import { ExternalLink, Bookmark, Trash2, ChevronDown } from "lucide-react"
import type { AdResult, SavedAd, AdCollection } from "@/domains/ad-research/types"
import { saveAdAction, deleteAdAction, moveAdToCollectionAction } from "@/domains/ad-research/actions"

interface AdCardProps {
  ad: AdResult | SavedAd
  isSaved?: boolean
  collections?: AdCollection[]
  country?: string
  onSaved?: (saved: SavedAd) => void
  onDeleted?: (id: string) => void
  onMoved?: (adId: string, collectionId: string | null) => void
}

function isAdResult(ad: AdResult | SavedAd): ad is AdResult {
  return !('savedAt' in ad)
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function AdCard({ ad, isSaved, collections = [], country, onSaved, onDeleted, onMoved }: AdCardProps) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const id = ad.id
  const platform = ad.platform
  const advertiserName = ad.advertiserName
  const adTitle = ad.adTitle
  const adBody = ad.adBody
  const mediaUrls = ad.mediaUrls
  const thumbnailUrl = 'thumbnailUrl' in ad ? ad.thumbnailUrl : null
  const mediaType = ad.mediaType

  const firstMedia = mediaUrls[0] ?? thumbnailUrl
  const isDirectVideo = firstMedia ? /\.(mp4|webm|mov|avi|m4v)(\?|$)/i.test(firstMedia) : false
  const isVideo = isDirectVideo || mediaType === 'video'
  const [videoError, setVideoError] = useState(false)

  const daysRunning = isAdResult(ad)
    ? (ad as { daysRunning?: number }).daysRunning ?? null
    : (ad as SavedAd).daysRunning

  const impressionsMin = isAdResult(ad)
    ? (platform === 'meta' ? (ad as { impressionsMin?: number | null }).impressionsMin : null)
    : (ad as SavedAd).impressionsMin

  const impressionsMax = isAdResult(ad)
    ? (platform === 'meta' ? (ad as { impressionsMax?: number | null }).impressionsMax : null)
    : (ad as SavedAd).impressionsMax

  const likesCount = isAdResult(ad)
    ? (platform === 'tiktok' ? (ad as { likesCount?: number }).likesCount : null)
    : (ad as SavedAd).likesCount

  const commentsCount = isAdResult(ad)
    ? (platform === 'tiktok' ? (ad as { commentsCount?: number }).commentsCount : null)
    : (ad as SavedAd).commentsCount

  const snapshotUrl = isAdResult(ad) && platform === 'meta'
    ? (ad as { snapshotUrl?: string | null }).snapshotUrl
    : (!isAdResult(ad) ? (ad as SavedAd).landingPageUrl : null)

  function handleSave() {
    if (!isAdResult(ad)) return
    startTransition(async () => {
      try {
        setError(null)
        const res = await saveAdAction({
          result: ad,
          collectionId: selectedCollection || null,
          country,
        })
        if (res.error) { setError(res.error); return }
        setSaveOpen(false)
        if (res.data) onSaved?.(res.data)
      } catch (e) {
        setError("Error al guardar.")
      }
    })
  }

  function handleDelete() {
    if (!isSaved) return
    startTransition(async () => {
      try {
        await deleteAdAction(id)
        onDeleted?.(id)
      } catch {
        setError("Error al eliminar.")
      }
    })
  }

  function handleMove(collectionId: string | null) {
    startTransition(async () => {
      try {
        await moveAdToCollectionAction(id, collectionId)
        onMoved?.(id, collectionId)
      } catch {
        setError("Error al mover.")
      }
    })
  }

  return (
    <div
      className="rounded-xl border flex flex-col overflow-hidden transition-shadow hover:shadow-lg"
      style={{ borderColor: "var(--sg-border)", background: "var(--sg-s1)" }}
    >
      <div className="p-3 flex items-center justify-between">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
          style={{
            background: platform === 'meta' ? 'rgba(110,149,255,0.15)' : 'rgba(70,207,245,0.15)',
            color: platform === 'meta' ? 'var(--sg-accent)' : 'var(--sg-cyan)',
          }}
        >
          {platform === 'meta' ? 'Meta' : 'TikTok'}
        </span>
        {daysRunning != null && (
          <span className="text-[11px]" style={{ color: "var(--sg-muted)" }}>
            {daysRunning}d activo
          </span>
        )}
      </div>

      <div className="relative aspect-video overflow-hidden" style={{ background: "var(--sg-s2)" }}>
        {firstMedia ? (
          isDirectVideo && !videoError ? (
            <video
              src={firstMedia}
              className="w-full h-full object-cover"
              controls
              muted
              playsInline
              preload="metadata"
              onError={() => setVideoError(true)}
            />
          ) : (
            <>
              <img
                src={firstMedia}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {isVideo && snapshotUrl && (
                <a
                  href={snapshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{ background: "rgba(0,0,0,0.6)" }}
                  >
                    <div className="w-0 h-0 border-t-[9px] border-t-transparent border-b-[9px] border-b-transparent border-l-[16px] border-l-white ml-1" />
                  </div>
                </a>
              )}
              {isVideo && !snapshotUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.5)" }}
                  >
                    <div className="w-0 h-0 border-t-[9px] border-t-transparent border-b-[9px] border-b-transparent border-l-[16px] border-l-white ml-1" />
                  </div>
                </div>
              )}
            </>
          )
        ) : videoError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
            <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "var(--sg-s3)" }}>
              <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[14px] ml-1" style={{ borderLeftColor: "var(--sg-muted)" }} />
            </div>
            <p className="text-xs text-center" style={{ color: "var(--sg-muted)" }}>
              Video restringido por CORS
            </p>
            {(snapshotUrl ?? firstMedia) && (
              <a
                href={snapshotUrl ?? firstMedia!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: "var(--sg-accent)", color: "var(--sg-on-accent)" }}
              >
                Ver video →
              </a>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs" style={{ color: "var(--sg-subtle)" }}>Sin preview</span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--sg-ink)" }}>
          {advertiserName}
        </p>
        {adTitle && (
          <p className="text-xs truncate" style={{ color: "var(--sg-muted)" }}>{adTitle}</p>
        )}
        {adBody && (
          <p className="text-xs line-clamp-2" style={{ color: "var(--sg-subtle)" }}>{adBody}</p>
        )}

        {platform === 'meta' && (impressionsMin != null || impressionsMax != null) && (
          <p className="text-[11px] mt-1" style={{ color: "var(--sg-muted)" }}>
            Impresiones: {formatNumber(impressionsMin)} – {formatNumber(impressionsMax)}
          </p>
        )}
        {platform === 'tiktok' && likesCount != null && (
          <p className="text-[11px] mt-1 flex gap-3" style={{ color: "var(--sg-muted)" }}>
            <span>{formatNumber(likesCount)} likes</span>
            <span>{formatNumber(commentsCount)} comentarios</span>
          </p>
        )}
      </div>

      <div
        className="px-3 py-2 flex gap-2 border-t"
        style={{ borderColor: "var(--sg-border)" }}
      >
        {snapshotUrl && (
          <a
            href={snapshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg transition-colors"
            style={{ color: "var(--sg-muted)", background: "var(--sg-s2)" }}
          >
            <ExternalLink className="h-3 w-3" />
            Ver original
          </a>
        )}

        {!isSaved ? (
          <div className="relative ml-auto">
            <button
              onClick={() => setSaveOpen(!saveOpen)}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: "var(--sg-accent)", color: "var(--sg-on-accent)" }}
            >
              <Bookmark className="h-3 w-3" />
              Guardar
              <ChevronDown className="h-3 w-3" />
            </button>

            {saveOpen && (
              <div
                className="absolute right-0 bottom-10 w-52 rounded-xl border p-3 space-y-2 z-10"
                style={{ background: "var(--sg-s2)", borderColor: "var(--sg-border)" }}
              >
                <p className="text-xs font-medium" style={{ color: "var(--sg-ink)" }}>Guardar en colección</p>
                <select
                  value={selectedCollection}
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg text-xs focus:outline-none"
                  style={{
                    background: "var(--sg-s3)",
                    border: "1px solid var(--sg-border)",
                    color: "var(--sg-ink)",
                  }}
                >
                  <option value="">Sin colección</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {error && <p className="text-[11px]" style={{ color: "var(--sg-danger)" }}>{error}</p>}
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                  style={{ background: "var(--sg-accent)", color: "var(--sg-on-accent)" }}
                >
                  {isPending ? "Guardando..." : "Confirmar"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="ml-auto flex gap-2">
            {collections.length > 0 && (
              <select
                onChange={(e) => handleMove(e.target.value || null)}
                className="px-2 py-1 rounded-lg text-xs focus:outline-none"
                style={{
                  background: "var(--sg-s2)",
                  border: "1px solid var(--sg-border)",
                  color: "var(--sg-muted)",
                }}
                defaultValue={(ad as SavedAd).collectionId ?? ""}
              >
                <option value="">Sin colección</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ color: "var(--sg-danger)", background: "var(--sg-s2)" }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
