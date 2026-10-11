"use server"

import { requireRole } from "@/lib/auth/server"
import {
  upsertProviderApiKey,
  deleteProviderApiKey,
  listConfiguredProviders,
  type ProviderName,
} from "./provider-keys-repository"

export async function saveProviderKeyAction(
  provider: ProviderName,
  plainKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requireRole(["owner", "admin"])
    if (!plainKey || plainKey.trim().length < 8) {
      return { success: false, error: "La clave API debe tener al menos 8 caracteres." }
    }
    await upsertProviderApiKey(ctx.orgId, provider, plainKey.trim())
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido"
    return { success: false, error: msg }
  }
}

export async function deleteProviderKeyAction(
  provider: ProviderName
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requireRole(["owner", "admin"])
    await deleteProviderApiKey(ctx.orgId, provider)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido"
    return { success: false, error: msg }
  }
}

export async function listConfiguredProvidersAction(): Promise<{
  configured: ProviderName[]
  error?: string
}> {
  try {
    const ctx = await requireRole(["owner", "admin"])
    const configured = await listConfiguredProviders(ctx.orgId)
    return { configured }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido"
    return { configured: [], error: msg }
  }
}
