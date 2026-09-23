"use server"

import { requireOrganizationMembership } from "@/lib/auth/server"
import { searchMetaAds } from "@/lib/ad-research/meta"
import { searchTikTokTopAds } from "@/lib/ad-research/tiktok"
import {
  saveAd,
  getSavedAds,
  deleteSavedAd,
  createCollection,
  getCollections,
  deleteCollection,
  updateSavedAdNotes,
  moveToCollection,
  importAdFromUrl,
} from "./repository"
import type { AdPlatform, AdResult, SavedAd, AdCollection } from "./types"

type ActionResult<T> = { data?: T; error?: string; pendingAccess?: boolean }

export async function searchAdsAction(params: {
  query?: string
  pageId?: string
  countries: string[]
  platforms: AdPlatform[]
  activeOnly?: boolean
  period?: 7 | 30 | 180
  industryId?: string
}): Promise<ActionResult<AdResult[]>> {
  try {
    await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  const { query, pageId, countries, platforms, activeOnly, period, industryId } = params
  const country = countries[0] ?? 'VE'

  const tasks: Promise<AdResult[]>[] = []
  const errors: string[] = []
  let metaAccessPending = false

  if (platforms.includes('meta')) {
    tasks.push(
      searchMetaAds({
        searchTerms: query,
        pageId,
        countries,
        activeOnly,
        limit: 20,
      }).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Error desconocido'
        if (msg === 'META_ACCESS_PENDING') {
          metaAccessPending = true
        } else {
          errors.push(`Meta: ${msg}`)
        }
        return []
      })
    )
  }

  if (platforms.includes('tiktok')) {
    tasks.push(
      searchTikTokTopAds({
        country,
        period: period ?? 30,
        industryId,
        limit: 20,
      }).catch((e: unknown) => {
        errors.push(`TikTok: ${e instanceof Error ? e.message : 'Error desconocido'}`)
        return []
      })
    )
  }

  const results = await Promise.all(tasks)
  const combined = results.flat()

  if (combined.length === 0 && metaAccessPending) {
    return { pendingAccess: true, data: [] }
  }

  if (combined.length === 0 && errors.length > 0) {
    return { error: errors.join(' | ') }
  }

  return { data: combined }
}

export async function saveAdAction(input: {
  result: AdResult
  collectionId?: string | null
  tags?: string[]
  notes?: string | null
  country?: string
}): Promise<ActionResult<SavedAd>> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  try {
    const saved = await saveAd(ctx.orgId, {
      result: input.result,
      collectionId: input.collectionId,
      tags: input.tags,
      notes: input.notes,
      savedBy: ctx.userId,
      country: input.country,
    })
    return { data: saved }
  } catch (e) {
    console.error("[saveAdAction]", e)
    return { error: "Error al guardar el anuncio." }
  }
}

export async function deleteAdAction(id: string): Promise<ActionResult<void>> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  try {
    await deleteSavedAd(id, ctx.orgId)
    return {}
  } catch (e) {
    console.error("[deleteAdAction]", e)
    return { error: "Error al eliminar el anuncio." }
  }
}

export async function createCollectionAction(
  name: string,
  description?: string
): Promise<ActionResult<AdCollection>> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  try {
    const col = await createCollection(ctx.orgId, { name, description, createdBy: ctx.userId })
    return { data: col }
  } catch (e) {
    console.error("[createCollectionAction]", e)
    return { error: "Error al crear la colección." }
  }
}

export async function getCollectionsAction(): Promise<ActionResult<AdCollection[]>> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  try {
    const cols = await getCollections(ctx.orgId)
    return { data: cols }
  } catch (e) {
    console.error("[getCollectionsAction]", e)
    return { error: "Error al obtener colecciones." }
  }
}

export async function getSavedAdsAction(filters?: {
  collectionId?: string | null
  platform?: AdPlatform
  tags?: string[]
}): Promise<ActionResult<SavedAd[]>> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  try {
    const ads = await getSavedAds(ctx.orgId, filters)
    return { data: ads }
  } catch (e) {
    console.error("[getSavedAdsAction]", e)
    return { error: "Error al obtener anuncios guardados." }
  }
}

export async function deleteCollectionAction(id: string): Promise<ActionResult<void>> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  try {
    await deleteCollection(id, ctx.orgId)
    return {}
  } catch (e) {
    console.error("[deleteCollectionAction]", e)
    return { error: "Error al eliminar la colección." }
  }
}

export async function updateAdNotesAction(id: string, notes: string): Promise<ActionResult<void>> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  try {
    await updateSavedAdNotes(id, ctx.orgId, notes)
    return {}
  } catch (e) {
    console.error("[updateAdNotesAction]", e)
    return { error: "Error al actualizar notas." }
  }
}

export async function importAdFromUrlAction(input: {
  url: string
  platform: AdPlatform
  advertiserName: string
  adTitle?: string | null
  adBody?: string | null
  mediaUrl?: string | null
  thumbnailUrl?: string | null
  collectionId?: string | null
  tags?: string[]
  notes?: string | null
}): Promise<ActionResult<SavedAd>> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  try {
    const saved = await importAdFromUrl(ctx.orgId, { ...input, savedBy: ctx.userId, thumbnailUrl: input.thumbnailUrl })
    return { data: saved }
  } catch (e) {
    console.error("[importAdFromUrlAction]", e)
    return { error: "Error al importar el anuncio." }
  }
}

export async function moveAdToCollectionAction(
  adId: string,
  collectionId: string | null
): Promise<ActionResult<void>> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    return { error: "Sin acceso." }
  }

  try {
    await moveToCollection(adId, ctx.orgId, collectionId)
    return {}
  } catch (e) {
    console.error("[moveAdToCollectionAction]", e)
    return { error: "Error al mover el anuncio." }
  }
}
