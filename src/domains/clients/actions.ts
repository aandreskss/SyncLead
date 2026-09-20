"use server"

import { redirect } from "next/navigation"
import { createClient, updateClient, deleteClient } from "./repository"
import { encryptToken } from "@/lib/crypto"
import type { ClientFormState } from "./types"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError } from "@/lib/auth/errors"

function parseWhatsappNumbers(raw: string): string[] {
  return raw
    .split("\n")
    .map((n) => n.replace(/[\s\-\(\)\+]/g, "").trim())
    .filter((n) => n.length >= 8)
}

export async function createClientAction(
  _prevState: ClientFormState | undefined,
  formData: FormData
): Promise<ClientFormState> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso a la organización." }
  }

  const name = (formData.get("name") as string)?.trim()
  const pixelId = (formData.get("pixelId") as string)?.trim()
  const datasetId = (formData.get("datasetId") as string)?.trim()
  const accessToken = (formData.get("accessToken") as string)?.trim()
  const numbersRaw = (formData.get("whatsappNumbers") as string) ?? ""

  if (!name) return { error: "El nombre del cliente es requerido." }
  if (name.length > 100) return { error: "El nombre es demasiado largo." }

  const whatsappNumbers = parseWhatsappNumbers(numbersRaw)
  const metaAccessTokenEnc = accessToken ? encryptToken(accessToken) : null

  await createClient({
    orgId: ctx.orgId,
    name,
    metaPixelId: pixelId || null,
    metaDatasetId: datasetId || null,
    metaAccessTokenEnc,
    whatsappNumbers,
  })

  return { success: true }
}

export async function updateClientAction(
  _prevState: ClientFormState | undefined,
  formData: FormData
): Promise<ClientFormState> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso a la organización." }
  }

  const clientId = formData.get("clientId") as string
  if (!clientId) return { error: "Cliente no especificado." }

  const name = (formData.get("name") as string)?.trim()
  const pixelId = (formData.get("pixelId") as string)?.trim()
  const datasetId = (formData.get("datasetId") as string)?.trim()
  const accessToken = (formData.get("accessToken") as string)?.trim()
  const numbersRaw = (formData.get("whatsappNumbers") as string) ?? ""

  if (!name) return { error: "El nombre del cliente es requerido." }
  if (name.length > 100) return { error: "El nombre es demasiado largo." }

  const whatsappNumbers = parseWhatsappNumbers(numbersRaw)

  const updates: Parameters<typeof updateClient>[2] = {
    name,
    metaPixelId: pixelId || null,
    metaDatasetId: datasetId || null,
    whatsappNumbers,
  }

  // Only re-encrypt if a new token was provided (non-empty field)
  if (accessToken) {
    updates.metaAccessTokenEnc = encryptToken(accessToken)
  }

  const updated = await updateClient(clientId, ctx.orgId, updates)
  if (!updated) return { error: "Cliente no encontrado o sin acceso." }

  return { success: true }
}

export async function deleteClientAction(
  clientId: string
): Promise<{ error?: string; success?: boolean }> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso." }
  }

  await deleteClient(clientId, ctx.orgId)
  return { success: true }
}

export async function toggleClientActiveAction(
  clientId: string,
  active: boolean
): Promise<{ error?: string; success?: boolean }> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso." }
  }

  const updated = await updateClient(clientId, ctx.orgId, { active })
  if (!updated) return { error: "Cliente no encontrado." }

  return { success: true }
}
