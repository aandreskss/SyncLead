import "server-only"

import { createHash } from "crypto"
import { db } from "@/lib/db"
import { ingestionCredentials, campaigns, clients } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export interface CredentialContext {
  credentialId: string
  credentialType: "public_form" | "server_secret"
  allowedOrigins: string[]
  orgId: string
  /** Set for campaign-scoped credentials. Null for client-scoped credentials. */
  campaignId: string | null
  /** Always set. For campaign-scoped: derived from the campaign. For client-scoped: direct FK. */
  clientId: string
  campaignActive: boolean
}

/**
 * Looks up an ingestion credential by its raw value.
 * The raw key is hashed (SHA-256) before the DB lookup — the secret is never stored.
 * Returns null for any invalid, revoked, or expired credential.
 *
 * Supports two scopes:
 * - Campaign-scoped (campaignId != null): classic per-campaign credential.
 * - Client-scoped (campaignId == null): multi-campaign pixel credential; caller must
 *   resolve the campaign (e.g. from request body or first active campaign for clientId).
 */
export async function lookupCredential(rawKey: string): Promise<CredentialContext | null> {
  if (!rawKey || rawKey.length > 512) return null

  const hash = createHash("sha256").update(rawKey).digest("hex")

  const cred = await db.query.ingestionCredentials.findFirst({
    where: and(
      eq(ingestionCredentials.keyHash, hash),
      eq(ingestionCredentials.status, "active")
    ),
    columns: {
      id: true,
      type: true,
      allowedOrigins: true,
      orgId: true,
      campaignId: true,
      clientId: true,
      expiresAt: true,
    },
  })

  if (!cred) return null
  if (cred.expiresAt && cred.expiresAt < new Date()) return null

  // ── Campaign-scoped credential ────────────────────────────────────────────
  if (cred.campaignId) {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, cred.campaignId),
      columns: { id: true, orgId: true, clientId: true, active: true },
    })
    if (!campaign) return null
    if (campaign.orgId !== cred.orgId) return null

    return {
      credentialId: cred.id,
      credentialType: cred.type as "public_form" | "server_secret",
      allowedOrigins: cred.allowedOrigins,
      orgId: cred.orgId,
      campaignId: cred.campaignId,
      campaignActive: campaign.active,
      clientId: campaign.clientId,
    }
  }

  // ── Client-scoped credential ──────────────────────────────────────────────
  if (cred.clientId) {
    return {
      credentialId: cred.id,
      credentialType: cred.type as "public_form" | "server_secret",
      allowedOrigins: cred.allowedOrigins,
      orgId: cred.orgId,
      campaignId: null,
      campaignActive: true, // caller resolves actual campaign
      clientId: cred.clientId,
    }
  }

  return null
}

/**
 * Legacy: looks up a campaign by the deprecated plain-text api_key column.
 * Used only by the /api/leads/ingest deprecated adapter.
 * @deprecated Remove when campaigns.api_key is dropped (Prompt 13+).
 */
export async function lookupLegacyApiKey(apiKey: string) {
  return db.query.campaigns.findFirst({
    where: eq(campaigns.apiKey, apiKey),
  })
}
