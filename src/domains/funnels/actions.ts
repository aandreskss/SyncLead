"use server"

import type { FunnelStageConfig } from "@/lib/db/schema"
import { createFunnel, updateFunnel, deleteFunnel } from "./repository"
import { requireOrganizationMembership } from "@/lib/auth/server"

export async function createFunnelAction(
  name: string,
  stages: FunnelStageConfig[]
): Promise<{ success: boolean; error?: string; funnelId?: string }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { success: false, error: "No autorizado" } }
  if (!name.trim()) return { success: false, error: "El nombre es requerido" }
  if (stages.length === 0) return { success: false, error: "Agrega al menos una etapa" }

  const funnel = await createFunnel({ orgId: ctx.orgId, name: name.trim(), stages })
  return { success: true, funnelId: funnel.id }
}

export async function updateFunnelAction(
  funnelId: string,
  name: string,
  stages: FunnelStageConfig[]
): Promise<{ success: boolean; error?: string }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { success: false, error: "No autorizado" } }
  if (!name.trim()) return { success: false, error: "El nombre es requerido" }
  if (stages.length === 0) return { success: false, error: "Agrega al menos una etapa" }

  await updateFunnel(funnelId, ctx.orgId, { name: name.trim(), stages })
  return { success: true }
}

export async function deleteFunnelAction(
  funnelId: string
): Promise<{ success: boolean; error?: string }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { success: false, error: "No autorizado" } }

  await deleteFunnel(funnelId, ctx.orgId)
  return { success: true }
}
