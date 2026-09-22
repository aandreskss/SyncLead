"use server"

import { z } from "zod"
import { requireCampaignAccess } from "@/lib/auth/server"
import { encryptTokenVersioned } from "@/lib/crypto"
import {
  getLeadAdSourceByCampaign,
  upsertLeadAdSource,
  deleteLeadAdSource,
} from "./repository"

type Result<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string }

const SaveSchema = z.object({
  pageId: z.string().min(1, "Page ID requerido").max(200),
  formId: z.string().max(200).optional().nullable(),
  pageAccessToken: z.string().min(1, "Page Access Token requerido").max(1000),
})

export async function saveLeadAdSourceAction(
  campaignId: string,
  input: unknown,
): Promise<Result> {
  let ctx
  try { ctx = await requireCampaignAccess(campaignId) } catch { return { success: false, error: "No autorizado" } }

  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  const { pageId, formId, pageAccessToken } = parsed.data

  try {
    const { ciphertext, keyVersion } = encryptTokenVersioned(pageAccessToken)
    await upsertLeadAdSource({
      orgId: ctx.orgId,
      campaignId,
      pageId: pageId.trim(),
      formId: formId?.trim() || null,
      pageAccessTokenEnc: ciphertext,
      keyVersion,
      active: true,
    })
    return { success: true }
  } catch {
    return { success: false, error: "Error al guardar la configuración" }
  }
}

export async function deleteLeadAdSourceAction(
  campaignId: string,
): Promise<Result> {
  let ctx
  try { ctx = await requireCampaignAccess(campaignId) } catch { return { success: false, error: "No autorizado" } }

  try {
    const source = await getLeadAdSourceByCampaign(campaignId, ctx.orgId)
    if (!source) return { success: true }
    await deleteLeadAdSource(source.id, ctx.orgId)
    return { success: true }
  } catch {
    return { success: false, error: "Error al eliminar la configuración" }
  }
}

export async function getLeadAdSourceAction(
  campaignId: string,
): Promise<{ pageId?: string; formId?: string | null; active?: boolean } | null> {
  let ctx
  try { ctx = await requireCampaignAccess(campaignId) } catch { return null }

  const source = await getLeadAdSourceByCampaign(campaignId, ctx.orgId)
  if (!source) return null
  return { pageId: source.pageId, formId: source.formId, active: source.active }
}
