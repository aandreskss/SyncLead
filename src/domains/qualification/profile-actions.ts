"use server"

import { requireOrganizationMembership, requireClientAccess } from "@/lib/auth/server"
import { db } from "@/lib/db"
import { leads, campaigns } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { MAX_RULES_PER_PROFILE } from "./profile-types"
import type {
  QualificationProfileInput,
  QualificationRuleInput,
} from "./profile-types"
import {
  createProfile,
  updateProfile,
  publishProfile,
  archiveProfile,
  reactivateProfile,
  deleteProfile,
  duplicateProfile,
  upsertRules,
  listProfilesByOrg,
  getProfileById,
  getRulesByProfileId,
  getFieldDefsForOrg,
  upsertCustomFieldDef,
  recordBehaviorEvent,
  getActiveProfileForCampaign,
  getEventDataForLead,
  persistProfileEvaluation,
  setRuleActive,
  deleteRuleById,
} from "./profile-repository"
import { getEffectiveQualification } from "./repository"
import { buildLeadContext, evaluateProfile } from "./score-engine"

// ─── Profile management ───────────────────────────────────────────────────────

export async function createProfileAction(input: QualificationProfileInput) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try {
    const profileId = await createProfile(ctx.orgId, input)
    return { profileId }
  } catch {
    return { error: "No se pudo crear el perfil" }
  }
}

export async function updateProfileAction(
  profileId: string,
  input: Partial<QualificationProfileInput>,
) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try {
    await updateProfile(ctx.orgId, profileId, input)
    return { success: true }
  } catch {
    return { error: "No se pudo actualizar el perfil" }
  }
}

export async function publishProfileAction(profileId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try {
    await publishProfile(ctx.orgId, profileId, ctx.userId)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo publicar el perfil"
    return { error: msg }
  }
}

export async function archiveProfileAction(profileId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try {
    await archiveProfile(ctx.orgId, profileId)
    return { success: true }
  } catch {
    return { error: "No se pudo archivar el perfil" }
  }
}

export async function deleteProfileAction(profileId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try {
    await deleteProfile(ctx.orgId, profileId)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo eliminar el perfil"
    return { error: msg }
  }
}

export async function reactivateProfileAction(profileId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try {
    await reactivateProfile(ctx.orgId, profileId)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo reactivar el perfil"
    return { error: msg }
  }
}

export async function duplicateProfileAction(profileId: string, newName: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try {
    const newProfileId = await duplicateProfile(ctx.orgId, profileId, newName)
    return { profileId: newProfileId }
  } catch {
    return { error: "No se pudo duplicar el perfil" }
  }
}

// ─── Rule management ──────────────────────────────────────────────────────────

/** Activates or deactivates a single rule immediately. Profile must be draft. */
export async function toggleRuleActiveAction(
  profileId: string,
  ruleId: string,
  active: boolean,
) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try {
    await setRuleActive(ctx.orgId, profileId, ruleId, active)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo actualizar la regla"
    return { error: msg }
  }
}

/** Deletes a single rule immediately. Profile must be draft. */
export async function deleteRuleByIdAction(
  profileId: string,
  ruleId: string,
) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try {
    await deleteRuleById(ctx.orgId, profileId, ruleId)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo eliminar la regla"
    return { error: msg }
  }
}

export async function upsertRulesAction(
  profileId: string,
  rules: QualificationRuleInput[],
) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  if (rules.length > MAX_RULES_PER_PROFILE) {
    return { error: `Máximo ${MAX_RULES_PER_PROFILE} reglas por perfil` }
  }

  try {
    await upsertRules(ctx.orgId, profileId, rules)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudieron guardar las reglas"
    return { error: msg }
  }
}

// ─── Profile queries ──────────────────────────────────────────────────────────

export async function listProfilesAction() {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try {
    const profiles = await listProfilesByOrg(ctx.orgId)
    return { profiles }
  } catch {
    return { error: "No se pudieron cargar los perfiles" }
  }
}

export async function getProfileAction(profileId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try {
    const profile = await getProfileById(ctx.orgId, profileId)
    if (!profile) return { error: "Perfil no encontrado" }

    const rules = await getRulesByProfileId(ctx.orgId, profileId)
    return { profile: { ...profile, rules } }
  } catch {
    return { error: "No se pudo cargar el perfil" }
  }
}

// ─── Field definitions ────────────────────────────────────────────────────────

export async function upsertCustomFieldAction(input: {
  clientId?: string | null
  key: string
  label: string
  dataType: string
  category?: string
  allowedOperators: string[]
  enumOptions?: string[]
  isRequiredForEval?: boolean
}) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  // If clientId is provided, verify access
  if (input.clientId) {
    try {
      await requireClientAccess(input.clientId)
    } catch {
      return { error: "Sin acceso al cliente" }
    }
  }

  try {
    await upsertCustomFieldDef(ctx.orgId, input)
    return { success: true }
  } catch {
    return { error: "No se pudo guardar la definición de campo" }
  }
}

// ─── Behavior events ──────────────────────────────────────────────────────────

export async function recordBehaviorEventAction(
  leadId: string,
  event: {
    eventType: string
    externalId?: string | null
    productId?: string | null
    variantId?: string | null
    category?: string | null
    quantity?: number | null
    value?: string | null
    currency?: string | null
    cartItems?: Record<string, unknown>[]
    metadata?: Record<string, unknown>
    platform?: string | null
    source?: string | null
    occurredAt?: Date
  },
) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  // Verify lead belongs to org
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId)))
    .limit(1)

  if (!lead) return { error: "Lead no encontrado" }

  try {
    const result = await recordBehaviorEvent(ctx.orgId, leadId, event)
    return { created: result.created }
  } catch {
    return { error: "No se pudo registrar el evento" }
  }
}

// ─── Lead evaluation ──────────────────────────────────────────────────────────

export async function evaluateLeadWithProfileAction(leadId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  // Verify lead belongs to org and get campaign
  const [lead] = await db
    .select({
      id: leads.id,
      campaignId: leads.campaignId,
      name: leads.name,
      city: leads.city,
      negocioRaw: leads.negocioRaw,
      negocioNormalized: leads.negocioNormalized,
      cityCanonical: leads.cityCanonical,
      utmSource: leads.utmSource,
      utmMedium: leads.utmMedium,
      utmCampaign: leads.utmCampaign,
      platform: leads.platform,
      device: leads.device,
      fbclid: leads.fbclid,
      customData: leads.customData,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId)))
    .limit(1)

  if (!lead) return { error: "Lead no encontrado" }

  const [campaign] = await db
    .select({ clientId: campaigns.clientId })
    .from(campaigns)
    .where(and(eq(campaigns.id, lead.campaignId), eq(campaigns.orgId, ctx.orgId)))
    .limit(1)

  if (!campaign) return { error: "Campaña no encontrada" }

  const activeProfile = await getActiveProfileForCampaign(ctx.orgId, lead.campaignId)
  if (!activeProfile) return { error: "No hay perfil activo para esta campaña" }

  const fieldDefsMap = await getFieldDefsForOrg(ctx.orgId, campaign.clientId)
  const fieldDefs = Object.values(fieldDefsMap)
  const eventData = await getEventDataForLead(leadId, ctx.orgId)

  const evalContext = buildLeadContext(
    {
      name: lead.name,
      city: lead.city,
      cityCanonical: lead.cityCanonical,
      negocioRaw: lead.negocioRaw,
      negocioNormalized: lead.negocioNormalized,
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      platform: lead.platform,
      device: lead.device,
      fbclid: lead.fbclid,
      customData: (lead.customData ?? {}) as Record<string, unknown>,
    },
    fieldDefs,
    eventData,
  )
  const result = evaluateProfile(activeProfile.profile, activeProfile.rules, evalContext, fieldDefs)

  await persistProfileEvaluation(leadId, ctx.orgId, activeProfile.profile.id, result, "manual_request")

  return {
    class: result.class,
    score: result.score,
    reasons: result.reasons,
    visibleLabel: result.visibleLabel,
  }
}

/**
 * Evaluates a lead against its active profile without requiring UI auth.
 * Used internally by the ingest pipeline.
 */
export async function evaluateLeadWithProfileInternal(
  leadId: string,
  orgId: string,
  campaignId: string,
): Promise<void> {
  const [lead] = await db
    .select({
      id: leads.id,
      campaignId: leads.campaignId,
      name: leads.name,
      city: leads.city,
      negocioRaw: leads.negocioRaw,
      negocioNormalized: leads.negocioNormalized,
      cityCanonical: leads.cityCanonical,
      utmSource: leads.utmSource,
      utmMedium: leads.utmMedium,
      utmCampaign: leads.utmCampaign,
      platform: leads.platform,
      device: leads.device,
      fbclid: leads.fbclid,
      customData: leads.customData,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .limit(1)

  if (!lead) return

  const [campaign] = await db
    .select({ clientId: campaigns.clientId })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1)

  if (!campaign) return

  const activeProfile = await getActiveProfileForCampaign(orgId, campaignId)
  if (!activeProfile) return

  const fieldDefsMap = await getFieldDefsForOrg(orgId, campaign.clientId)
  const fieldDefs = Object.values(fieldDefsMap)
  const eventData = await getEventDataForLead(leadId, orgId)

  const evalContext = buildLeadContext(
    {
      name: lead.name,
      city: lead.city,
      cityCanonical: lead.cityCanonical,
      negocioRaw: lead.negocioRaw,
      negocioNormalized: lead.negocioNormalized,
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      platform: lead.platform,
      device: lead.device,
      fbclid: lead.fbclid,
      customData: (lead.customData ?? {}) as Record<string, unknown>,
    },
    fieldDefs,
    eventData,
  )
  const result = evaluateProfile(activeProfile.profile, activeProfile.rules, evalContext, fieldDefs)

  await persistProfileEvaluation(leadId, orgId, activeProfile.profile.id, result, "ingest")
}

// ─── Profile preview (dry-run) ────────────────────────────────────────────────

export async function previewProfileEvaluationAction(
  profileId: string,
  testValues: Record<string, unknown>,
) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const profile = await getProfileById(ctx.orgId, profileId)
  if (!profile) return { error: "Perfil no encontrado" }

  const rules = await getRulesByProfileId(ctx.orgId, profileId)
  const fieldDefsMap = await getFieldDefsForOrg(
    ctx.orgId,
    profile.clientId ?? undefined,
  )
  const fieldDefs = Object.values(fieldDefsMap)

  // Build synthetic context from testValues — no DB lead lookup
  // testValues may have camelCase or snake_case keys; map common ones to LeadInput shape
  const evalContext = buildLeadContext(
    {
      name: testValues.name as string | null ?? null,
      city: testValues.city as string | null ?? null,
      cityCanonical: (testValues.cityCanonical ?? testValues.city_canonical) as string | null ?? null,
      negocioRaw: (testValues.negocioRaw ?? testValues.negocio_raw) as string | null ?? null,
      negocioNormalized: (testValues.negocioNormalized ?? testValues.negocio_normalized) as string | null ?? null,
      utmSource: (testValues.utmSource ?? testValues.utm_source) as string | null ?? null,
      utmMedium: (testValues.utmMedium ?? testValues.utm_medium) as string | null ?? null,
      utmCampaign: (testValues.utmCampaign ?? testValues.utm_campaign) as string | null ?? null,
      platform: testValues.platform as string | null ?? null,
      device: testValues.device as string | null ?? null,
      fbclid: testValues.fbclid as string | null ?? null,
      customData: (testValues.customData ?? {}) as Record<string, unknown>,
    },
    fieldDefs,
    // Pass the whole testValues as eventData so ecom/event fields work in previews
    testValues,
  )
  const result = evaluateProfile(profile, rules, evalContext, fieldDefs)

  // Return without persisting
  return {
    class: result.class,
    score: result.score,
    reasons: result.reasons,
    visibleLabel: result.visibleLabel,
    matchedRules: result.matchedRules,
    missingFields: result.missingFields,
    evalDurationMs: result.evalDurationMs,
  }
}

// ─── Batch re-evaluation ──────────────────────────────────────────────────────

export async function batchReEvaluateAction(
  clientId: string,
  profileId: string,
): Promise<{ error: string } | { applied: number; skipped: number }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  // Verify client access
  try {
    await requireClientAccess(clientId)
  } catch {
    return { error: "Sin acceso al cliente" }
  }

  const profile = await getProfileById(ctx.orgId, profileId)
  if (!profile) return { error: "Perfil no encontrado" }

  const rules = await getRulesByProfileId(ctx.orgId, profileId)
  const fieldDefsMap = await getFieldDefsForOrg(ctx.orgId, clientId)
  const fieldDefs = Object.values(fieldDefsMap)

  // Fetch all leads for this client's campaigns
  const clientLeads = await db
    .select({
      id: leads.id,
      campaignId: leads.campaignId,
    })
    .from(leads)
    .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.clientId, clientId),
        eq(leads.orgId, ctx.orgId),
      )
    )

  let applied = 0
  let skipped = 0

  for (const lead of clientLeads) {
    // Check for manual override — skip these leads
    const { manual } = await getEffectiveQualification(lead.id, ctx.orgId)

    if (manual) {
      skipped++
      continue
    }

    const [leadRow] = await db
      .select({
        name: leads.name,
        city: leads.city,
        negocioRaw: leads.negocioRaw,
        negocioNormalized: leads.negocioNormalized,
        cityCanonical: leads.cityCanonical,
        utmSource: leads.utmSource,
        utmMedium: leads.utmMedium,
        utmCampaign: leads.utmCampaign,
        platform: leads.platform,
        device: leads.device,
        fbclid: leads.fbclid,
        customData: leads.customData,
      })
      .from(leads)
      .where(and(eq(leads.id, lead.id), eq(leads.orgId, ctx.orgId)))
      .limit(1)

    if (!leadRow) continue

    const eventData = await getEventDataForLead(lead.id, ctx.orgId)

    const evalContext = buildLeadContext(
      {
        name: leadRow.name,
        city: leadRow.city,
        cityCanonical: leadRow.cityCanonical,
        negocioRaw: leadRow.negocioRaw,
        negocioNormalized: leadRow.negocioNormalized,
        utmSource: leadRow.utmSource,
        utmMedium: leadRow.utmMedium,
        utmCampaign: leadRow.utmCampaign,
        platform: leadRow.platform,
        device: leadRow.device,
        fbclid: leadRow.fbclid,
        customData: (leadRow.customData ?? {}) as Record<string, unknown>,
      },
      fieldDefs,
      eventData,
    )
    const result = evaluateProfile(profile, rules, evalContext, fieldDefs)

    await persistProfileEvaluation(
      lead.id,
      ctx.orgId,
      profile.id,
      result,
      "batch",
    ).catch(() => undefined)

    applied++
  }

  return { applied, skipped }
}
