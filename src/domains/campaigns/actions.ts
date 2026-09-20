"use server"

import { redirect } from "next/navigation"
import { randomBytes } from "crypto"
import { createCampaign, updateCampaign, deleteCampaign } from "./repository"
import type { CampaignFormState } from "./types"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError } from "@/lib/auth/errors"

function generateApiKey(): string {
  return "slk_" + randomBytes(24).toString("hex")
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

export async function createCampaignAction(
  _prevState: CampaignFormState | undefined,
  formData: FormData
): Promise<CampaignFormState> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso a la organización." }
  }

  const name = (formData.get("name") as string)?.trim()
  const clientId = formData.get("clientId") as string

  if (!name) return { error: "El nombre de la campaña es requerido." }
  if (name.length > 120) return { error: "El nombre es demasiado largo." }
  if (!clientId) return { error: "Selecciona un cliente." }

  await createCampaign({
    orgId: ctx.orgId,
    clientId,
    name,
    slug: generateSlug(name),
    apiKey: generateApiKey(),
  })

  return { success: true }
}

export async function updateCampaignAction(
  _prevState: CampaignFormState | undefined,
  formData: FormData
): Promise<CampaignFormState> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso a la organización." }
  }

  const campaignId = formData.get("campaignId") as string
  const name = (formData.get("name") as string)?.trim()

  if (!campaignId) return { error: "Campaña no especificada." }
  if (!name) return { error: "El nombre es requerido." }
  if (name.length > 120) return { error: "El nombre es demasiado largo." }

  const updated = await updateCampaign(campaignId, ctx.orgId, {
    name,
    slug: generateSlug(name),
  })
  if (!updated) return { error: "Campaña no encontrada o sin acceso." }

  return { success: true }
}

export async function deleteCampaignAction(
  campaignId: string
): Promise<{ error?: string; success?: boolean }> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso." }
  }

  await deleteCampaign(campaignId, ctx.orgId)
  return { success: true }
}

export async function rotateApiKeyAction(
  campaignId: string
): Promise<{ error?: string; success?: boolean; apiKey?: string }> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso." }
  }

  const newApiKey = generateApiKey()
  const updated = await updateCampaign(campaignId, ctx.orgId, { apiKey: newApiKey })
  if (!updated) return { error: "Campaña no encontrada." }

  return { success: true, apiKey: newApiKey }
}

export async function toggleCampaignActiveAction(
  campaignId: string,
  active: boolean
): Promise<{ error?: string; success?: boolean }> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso." }
  }

  const updated = await updateCampaign(campaignId, ctx.orgId, { active })
  if (!updated) return { error: "Campaña no encontrada." }

  return { success: true }
}
