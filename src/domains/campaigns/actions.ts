"use server"

import { redirect } from "next/navigation"
import { randomBytes, createHash } from "crypto"
import { createCampaign, updateCampaign, deleteCampaign } from "./repository"
import type { CampaignFormState } from "./types"
import { requireOrganizationMembership, requireCampaignAccess, requireClientAccess } from "@/lib/auth/server"
import { AuthError } from "@/lib/auth/errors"
import { db } from "@/lib/db"
import { campaigns, ingestionCredentials } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export type IngestionCredentialPublic = {
  id: string
  type: "public_form" | "server_secret"
  keyPrefix: string
  status: "active" | "revoked" | "expired"
  createdAt: Date
}

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

export async function listIngestionCredentialsAction(
  campaignId: string
): Promise<{ data?: IngestionCredentialPublic[]; error?: string }> {
  try {
    const ctx = await requireCampaignAccess(campaignId)
    const rows = await db.query.ingestionCredentials.findMany({
      where: and(
        eq(ingestionCredentials.campaignId, campaignId),
        eq(ingestionCredentials.orgId, ctx.orgId)
      ),
      columns: { id: true, type: true, keyPrefix: true, status: true, createdAt: true },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    })
    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type as "public_form" | "server_secret",
        keyPrefix: r.keyPrefix,
        status: r.status as "active" | "revoked" | "expired",
        createdAt: r.createdAt,
      })),
    }
  } catch {
    return { error: "forbidden" }
  }
}

export async function createIngestionCredentialAction(
  campaignId: string,
  type: "public_form" | "server_secret"
): Promise<{ token?: string; error?: string }> {
  try {
    const ctx = await requireCampaignAccess(campaignId)
    const prefix = type === "public_form" ? "pub_" : "slk_"
    const rawToken = prefix + randomBytes(24).toString("hex")
    const keyHash = createHash("sha256").update(rawToken).digest("hex")
    const keyPrefix = rawToken.slice(0, 16)

    await db.insert(ingestionCredentials).values({
      orgId: ctx.orgId,
      campaignId,
      type,
      keyHash,
      keyPrefix,
      status: "active",
      allowedOrigins: [],
    })

    return { token: rawToken }
  } catch {
    return { error: "failed" }
  }
}

export async function revokeIngestionCredentialAction(
  credentialId: string,
  campaignId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const ctx = await requireCampaignAccess(campaignId)
    await db
      .update(ingestionCredentials)
      .set({ status: "revoked" })
      .where(
        and(
          eq(ingestionCredentials.id, credentialId),
          eq(ingestionCredentials.orgId, ctx.orgId),
          eq(ingestionCredentials.campaignId, campaignId)
        )
      )
    return { success: true }
  } catch {
    return { error: "failed" }
  }
}

// ── Client-level credentials (multi-campaign pixel) ──────────────────────────

export async function listClientIngestionCredentialsAction(
  clientId: string
): Promise<{ data?: IngestionCredentialPublic[]; error?: string }> {
  try {
    const ctx = await requireClientAccess(clientId)
    const rows = await db.query.ingestionCredentials.findMany({
      where: and(
        eq(ingestionCredentials.clientId, clientId),
        eq(ingestionCredentials.orgId, ctx.orgId)
      ),
      columns: { id: true, type: true, keyPrefix: true, status: true, createdAt: true },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    })
    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type as "public_form" | "server_secret",
        keyPrefix: r.keyPrefix,
        status: r.status as "active" | "revoked" | "expired",
        createdAt: r.createdAt,
      })),
    }
  } catch {
    return { error: "forbidden" }
  }
}

export async function createClientIngestionCredentialAction(
  clientId: string
): Promise<{ token?: string; error?: string }> {
  try {
    const ctx = await requireClientAccess(clientId)
    const rawToken = "pub_" + randomBytes(24).toString("hex")
    const keyHash = createHash("sha256").update(rawToken).digest("hex")
    const keyPrefix = rawToken.slice(0, 16)

    await db.insert(ingestionCredentials).values({
      orgId: ctx.orgId,
      clientId,
      campaignId: null,
      type: "public_form",
      keyHash,
      keyPrefix,
      status: "active",
      allowedOrigins: [],
    })

    return { token: rawToken }
  } catch {
    return { error: "failed" }
  }
}

export async function revokeClientIngestionCredentialAction(
  credentialId: string,
  clientId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const ctx = await requireClientAccess(clientId)
    await db
      .update(ingestionCredentials)
      .set({ status: "revoked" })
      .where(
        and(
          eq(ingestionCredentials.id, credentialId),
          eq(ingestionCredentials.orgId, ctx.orgId),
          eq(ingestionCredentials.clientId, clientId)
        )
      )
    return { success: true }
  } catch {
    return { error: "failed" }
  }
}

// Finds or auto-creates the "Orgánico / Directo" campaign for a client.
// Called when generating a script snippet so organic traffic is never lost.
export async function ensureOrganicCampaignAction(
  clientId: string
): Promise<{ apiKey?: string; error?: string }> {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    return { error: "Sin acceso." }
  }

  const existing = await db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.orgId, ctx.orgId),
      eq(campaigns.clientId, clientId),
      eq(campaigns.slug, "organico-directo")
    ),
    columns: { id: true, apiKey: true },
  })

  if (existing) return { apiKey: existing.apiKey }

  const created = await createCampaign({
    orgId: ctx.orgId,
    clientId,
    name: "Orgánico / Directo",
    slug: "organico-directo",
    apiKey: generateApiKey(),
  })

  return { apiKey: created.apiKey }
}
