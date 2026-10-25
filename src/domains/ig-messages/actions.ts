"use server"

import { redirect } from "next/navigation"
import { randomBytes } from "crypto"
import { requireCampaignAccess } from "@/lib/auth/server"
import { encryptTokenVersioned } from "@/lib/crypto"
import { AuthError } from "@/lib/auth/errors"
import {
  getIgMessageSourceByCampaignId,
  insertIgMessageSource,
  updateIgMessageSource,
  deleteIgMessageSourceByCampaign,
  type IgMessageSourcePublic,
} from "./repository"

export async function getIgSourceAction(
  campaignId: string,
): Promise<{ data?: IgMessageSourcePublic; error?: string }> {
  try {
    const ctx = await requireCampaignAccess(campaignId)
    const data = await getIgMessageSourceByCampaignId(campaignId, ctx.orgId)
    return { data: data ?? undefined }
  } catch {
    return { error: "forbidden" }
  }
}

export async function saveIgSourceAction(
  campaignId: string,
  input: { igPageId: string; pageAccessToken: string },
): Promise<{ success?: boolean; source?: IgMessageSourcePublic; error?: string }> {
  let ctx
  try {
    ctx = await requireCampaignAccess(campaignId)
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso." }
  }

  const igPageId = input.igPageId.trim()
  const rawToken = input.pageAccessToken.trim()

  if (!igPageId) return { error: "El Page ID es requerido." }

  try {
    const existing = await getIgMessageSourceByCampaignId(campaignId, ctx.orgId)

    if (!existing) {
      // First-time setup — token required
      if (!rawToken) return { error: "El Page Access Token es requerido para la configuración inicial." }
      const { ciphertext, keyVersion } = encryptTokenVersioned(rawToken)
      const verifyToken = randomBytes(16).toString("hex")
      const source = await insertIgMessageSource({
        orgId: ctx.orgId,
        campaignId,
        igPageId,
        pageAccessTokenEnc: ciphertext,
        keyVersion,
        verifyToken,
      })
      return { success: true, source }
    }

    // Update existing — only change what was provided
    const updates: { igPageId?: string; pageAccessTokenEnc?: string; keyVersion?: number } = {}
    if (igPageId !== existing.igPageId) updates.igPageId = igPageId
    if (rawToken) {
      const { ciphertext, keyVersion } = encryptTokenVersioned(rawToken)
      updates.pageAccessTokenEnc = ciphertext
      updates.keyVersion = keyVersion
    }
    if (Object.keys(updates).length > 0) {
      await updateIgMessageSource(existing.id, ctx.orgId, updates)
    }

    const refreshed = await getIgMessageSourceByCampaignId(campaignId, ctx.orgId)
    return { success: true, source: refreshed ?? undefined }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("UniqueConstraint")) {
      return { error: "Este Page ID ya está configurado en otra campaña u organización." }
    }
    return { error: "Error al guardar la configuración." }
  }
}

export async function deleteIgSourceAction(
  campaignId: string,
): Promise<{ success?: boolean; error?: string }> {
  let ctx
  try {
    ctx = await requireCampaignAccess(campaignId)
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso." }
  }

  try {
    await deleteIgMessageSourceByCampaign(campaignId, ctx.orgId)
    return { success: true }
  } catch {
    return { error: "Error al eliminar la configuración." }
  }
}
