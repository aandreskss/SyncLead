import "server-only"

import { eq, and, desc, isNull, sql, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  qualificationProfiles,
  qualificationRules,
  qualificationFieldDefinitions,
  leadBehaviorEvents,
  leadQualifications,
  leads,
  campaigns,
} from "@/lib/db/schema"
import { SYSTEM_FIELD_DEFINITIONS } from "./field-registry"
import type {
  QualificationProfile,
  QualificationRule,
  QualificationProfileInput,
  QualificationRuleInput,
  FieldDefinition,
  ProfileEvaluationResult,
  EvaluationTrigger,
  ConditionTree,
} from "./profile-types"
import { refreshEffectiveQualClass } from "./repository"

// ─── Internal mappers ─────────────────────────────────────────────────────────

function mapProfileRow(row: typeof qualificationProfiles.$inferSelect): QualificationProfile {
  return {
    id: row.id,
    orgId: row.orgId,
    clientId: row.clientId ?? null,
    name: row.name,
    description: row.description ?? null,
    status: row.status as QualificationProfile["status"],
    version: row.version,
    initialScore: row.initialScore,
    thresholds: row.thresholds as QualificationProfile["thresholds"],
    resultLabels: row.resultLabels as QualificationProfile["resultLabels"],
    publishedAt: row.publishedAt ?? null,
    publishedBy: row.publishedBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapRuleRow(row: typeof qualificationRules.$inferSelect): QualificationRule {
  return {
    id: row.id,
    orgId: row.orgId,
    profileId: row.profileId,
    name: row.name,
    description: row.description ?? null,
    priority: row.priority,
    active: row.active,
    conditions: row.conditions as unknown as ConditionTree,
    action: row.action as QualificationRule["action"],
    scoreDelta: row.scoreDelta,
    forcedResult: row.forcedResult as QualificationRule["forcedResult"] ?? null,
    reason: row.reason,
    stopProcessing: row.stopProcessing,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

/** Returns the published profile for a specific client, falling back to org-wide. */
export async function getPublishedProfileByClientId(
  orgId: string,
  clientId: string,
): Promise<QualificationProfile | null> {
  // Try client-scoped first
  const [clientRow] = await db
    .select()
    .from(qualificationProfiles)
    .where(
      and(
        eq(qualificationProfiles.orgId, orgId),
        eq(qualificationProfiles.clientId, clientId),
        eq(qualificationProfiles.status, "published"),
      )
    )
    .orderBy(desc(qualificationProfiles.version))
    .limit(1)

  if (clientRow) return mapProfileRow(clientRow)

  // Fall back to org-wide (clientId IS NULL)
  return getPublishedProfileByOrgId(orgId)
}

/** Returns the published org-wide profile (clientId IS NULL). */
export async function getPublishedProfileByOrgId(
  orgId: string,
): Promise<QualificationProfile | null> {
  const [row] = await db
    .select()
    .from(qualificationProfiles)
    .where(
      and(
        eq(qualificationProfiles.orgId, orgId),
        isNull(qualificationProfiles.clientId),
        eq(qualificationProfiles.status, "published"),
      )
    )
    .orderBy(desc(qualificationProfiles.version))
    .limit(1)

  return row ? mapProfileRow(row) : null
}

export async function getProfileById(
  orgId: string,
  profileId: string,
): Promise<QualificationProfile | null> {
  const [row] = await db
    .select()
    .from(qualificationProfiles)
    .where(
      and(
        eq(qualificationProfiles.id, profileId),
        eq(qualificationProfiles.orgId, orgId),
      )
    )
    .limit(1)

  return row ? mapProfileRow(row) : null
}

export async function listProfilesByOrg(
  orgId: string,
): Promise<QualificationProfile[]> {
  const rows = await db
    .select()
    .from(qualificationProfiles)
    .where(eq(qualificationProfiles.orgId, orgId))
    .orderBy(desc(qualificationProfiles.updatedAt))

  return rows.map(mapProfileRow)
}

export async function createProfile(
  orgId: string,
  input: QualificationProfileInput,
): Promise<string> {
  const [row] = await db
    .insert(qualificationProfiles)
    .values({
      orgId,
      clientId: input.clientId ?? null,
      name: input.name,
      description: input.description ?? null,
      status: "draft",
      version: 1,
      initialScore: input.initialScore,
      thresholds: input.thresholds,
      resultLabels: input.resultLabels,
    })
    .returning({ id: qualificationProfiles.id })

  return row.id
}

export async function updateProfile(
  orgId: string,
  profileId: string,
  input: Partial<QualificationProfileInput>,
): Promise<void> {
  const [existing] = await db
    .select({ id: qualificationProfiles.id })
    .from(qualificationProfiles)
    .where(
      and(
        eq(qualificationProfiles.id, profileId),
        eq(qualificationProfiles.orgId, orgId),
      )
    )
    .limit(1)

  if (!existing) throw new Error("Profile not found or access denied")

  await db
    .update(qualificationProfiles)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.initialScore !== undefined && { initialScore: input.initialScore }),
      ...(input.thresholds !== undefined && { thresholds: input.thresholds }),
      ...(input.resultLabels !== undefined && { resultLabels: input.resultLabels }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(qualificationProfiles.id, profileId),
        eq(qualificationProfiles.orgId, orgId),
      )
    )
}

/**
 * Publishes a draft profile.
 * 1. Verifies the profile belongs to the org and is in 'draft'.
 * 2. Archives any currently published profile for the same scope (clientId).
 * 3. Sets this profile to 'published', updates publishedAt, publishedBy, increments version.
 * Note: neon-http has no transactions — archive first, then publish.
 */
export async function publishProfile(
  orgId: string,
  profileId: string,
  publishedBy: string,
): Promise<void> {
  const [profile] = await db
    .select({
      id: qualificationProfiles.id,
      status: qualificationProfiles.status,
      clientId: qualificationProfiles.clientId,
      version: qualificationProfiles.version,
    })
    .from(qualificationProfiles)
    .where(
      and(
        eq(qualificationProfiles.id, profileId),
        eq(qualificationProfiles.orgId, orgId),
      )
    )
    .limit(1)

  if (!profile) throw new Error("Profile not found or access denied")
  if (profile.status !== "draft") throw new Error("Only draft profiles can be published")

  // Step 1: Archive any currently published profile for the same scope
  if (profile.clientId) {
    await db
      .update(qualificationProfiles)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(qualificationProfiles.orgId, orgId),
          eq(qualificationProfiles.clientId, profile.clientId),
          eq(qualificationProfiles.status, "published"),
        )
      )
  } else {
    // Org-wide scope (clientId IS NULL)
    await db
      .update(qualificationProfiles)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(qualificationProfiles.orgId, orgId),
          isNull(qualificationProfiles.clientId),
          eq(qualificationProfiles.status, "published"),
        )
      )
  }

  // Step 2: Publish this profile
  await db
    .update(qualificationProfiles)
    .set({
      status: "published",
      publishedAt: new Date(),
      publishedBy,
      version: profile.version + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(qualificationProfiles.id, profileId),
        eq(qualificationProfiles.orgId, orgId),
      )
    )
}

export async function archiveProfile(
  orgId: string,
  profileId: string,
): Promise<void> {
  await db
    .update(qualificationProfiles)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(qualificationProfiles.id, profileId),
        eq(qualificationProfiles.orgId, orgId),
      )
    )
}

/**
 * Clones a profile and all its rules into a new draft.
 * Returns the new profile id.
 */
export async function duplicateProfile(
  orgId: string,
  profileId: string,
  newName: string,
): Promise<string> {
  const [source] = await db
    .select()
    .from(qualificationProfiles)
    .where(
      and(
        eq(qualificationProfiles.id, profileId),
        eq(qualificationProfiles.orgId, orgId),
      )
    )
    .limit(1)

  if (!source) throw new Error("Profile not found or access denied")

  const [newProfile] = await db
    .insert(qualificationProfiles)
    .values({
      orgId,
      clientId: source.clientId ?? null,
      name: newName,
      description: source.description ?? null,
      status: "draft",
      version: 1,
      initialScore: source.initialScore,
      thresholds: source.thresholds,
      resultLabels: source.resultLabels,
    })
    .returning({ id: qualificationProfiles.id })

  // Clone rules
  const sourceRules = await db
    .select()
    .from(qualificationRules)
    .where(
      and(
        eq(qualificationRules.profileId, profileId),
        eq(qualificationRules.orgId, orgId),
      )
    )
    .orderBy(qualificationRules.priority)

  if (sourceRules.length > 0) {
    await db.insert(qualificationRules).values(
      sourceRules.map((r) => ({
        orgId,
        profileId: newProfile.id,
        name: r.name,
        description: r.description ?? null,
        priority: r.priority,
        active: r.active,
        conditions: r.conditions,
        action: r.action,
        scoreDelta: r.scoreDelta,
        forcedResult: r.forcedResult ?? null,
        reason: r.reason,
        stopProcessing: r.stopProcessing,
      }))
    )
  }

  return newProfile.id
}

// ─── Rule CRUD ────────────────────────────────────────────────────────────────

export async function getRulesByProfileId(
  orgId: string,
  profileId: string,
): Promise<QualificationRule[]> {
  const rows = await db
    .select()
    .from(qualificationRules)
    .where(
      and(
        eq(qualificationRules.profileId, profileId),
        eq(qualificationRules.orgId, orgId),
      )
    )
    .orderBy(qualificationRules.priority)

  return rows.map(mapRuleRow)
}

/**
 * Replaces all rules for a profile in a single batch.
 * Verifies: profile belongs to org, profile is in 'draft' status.
 */
export async function upsertRules(
  orgId: string,
  profileId: string,
  rules: QualificationRuleInput[],
): Promise<void> {
  const [profile] = await db
    .select({ id: qualificationProfiles.id, status: qualificationProfiles.status })
    .from(qualificationProfiles)
    .where(
      and(
        eq(qualificationProfiles.id, profileId),
        eq(qualificationProfiles.orgId, orgId),
      )
    )
    .limit(1)

  if (!profile) throw new Error("Profile not found or access denied")
  if (profile.status !== "draft") throw new Error("Cannot edit rules on a published profile. Duplicate it first.")

  // Delete existing rules
  await db
    .delete(qualificationRules)
    .where(
      and(
        eq(qualificationRules.profileId, profileId),
        eq(qualificationRules.orgId, orgId),
      )
    )

  // Insert new rules in batch
  if (rules.length > 0) {
    await db.insert(qualificationRules).values(
      rules.map((r) => ({
        orgId,
        profileId,
        name: r.name,
        description: r.description ?? null,
        priority: r.priority,
        active: r.active,
        conditions: r.conditions as unknown as Record<string, unknown>,
        action: r.action,
        scoreDelta: r.scoreDelta,
        forcedResult: r.forcedResult ?? null,
        reason: r.reason,
        stopProcessing: r.stopProcessing,
      }))
    )
  }
}

export async function deleteRule(
  orgId: string,
  ruleId: string,
): Promise<void> {
  await db
    .delete(qualificationRules)
    .where(
      and(
        eq(qualificationRules.id, ruleId),
        eq(qualificationRules.orgId, orgId),
      )
    )
}

// ─── Field definitions ────────────────────────────────────────────────────────

/**
 * Returns a merged map of field definitions keyed by field.key.
 * Priority: client fields > org fields > system fields.
 */
export async function getFieldDefsForOrg(
  orgId: string,
  clientId?: string,
): Promise<Record<string, FieldDefinition>> {
  const result: Record<string, FieldDefinition> = {}

  // 1. Seed with system fields
  for (const f of SYSTEM_FIELD_DEFINITIONS) {
    result[f.key] = f
  }

  // 2. Layer in org-wide custom fields (orgId = this org, clientId IS NULL)
  const orgRows = await db
    .select()
    .from(qualificationFieldDefinitions)
    .where(
      and(
        eq(qualificationFieldDefinitions.orgId, orgId),
        isNull(qualificationFieldDefinitions.clientId),
      )
    )

  for (const row of orgRows) {
    result[row.key] = {
      id: row.id,
      orgId: row.orgId ?? null,
      clientId: row.clientId ?? null,
      key: row.key,
      label: row.label,
      dataType: row.dataType as FieldDefinition["dataType"],
      source: row.source as FieldDefinition["source"],
      category: row.category as FieldDefinition["category"],
      isSensitive: row.isSensitive,
      allowedOperators: (row.allowedOperators as string[]) as FieldDefinition["allowedOperators"],
      normalization: row.normalization as unknown as FieldDefinition["normalization"],
      enumOptions: (row.enumOptions as string[]) ?? [],
      isRequiredForEval: row.isRequiredForEval,
      eventConfig: row.eventConfig as unknown as FieldDefinition["eventConfig"],
      leadsColumn: row.leadsColumn ?? undefined,
    }
  }

  // 3. Layer in client-specific fields if clientId provided
  if (clientId) {
    const clientRows = await db
      .select()
      .from(qualificationFieldDefinitions)
      .where(
        and(
          eq(qualificationFieldDefinitions.orgId, orgId),
          eq(qualificationFieldDefinitions.clientId, clientId),
        )
      )

    for (const row of clientRows) {
      result[row.key] = {
        id: row.id,
        orgId: row.orgId ?? null,
        clientId: row.clientId ?? null,
        key: row.key,
        label: row.label,
        dataType: row.dataType as FieldDefinition["dataType"],
        source: row.source as FieldDefinition["source"],
        category: row.category as FieldDefinition["category"],
        isSensitive: row.isSensitive,
        allowedOperators: (row.allowedOperators as string[]) as FieldDefinition["allowedOperators"],
        normalization: row.normalization as unknown as FieldDefinition["normalization"],
        enumOptions: (row.enumOptions as string[]) ?? [],
        isRequiredForEval: row.isRequiredForEval,
        eventConfig: row.eventConfig as unknown as FieldDefinition["eventConfig"],
        leadsColumn: row.leadsColumn ?? undefined,
      }
    }
  }

  return result
}

export async function upsertCustomFieldDef(
  orgId: string,
  input: {
    clientId?: string | null
    key: string
    label: string
    dataType: string
    category?: string
    allowedOperators: string[]
    enumOptions?: string[]
    isRequiredForEval?: boolean
  },
): Promise<void> {
  await db
    .insert(qualificationFieldDefinitions)
    .values({
      orgId,
      clientId: input.clientId ?? null,
      key: input.key,
      label: input.label,
      dataType: input.dataType,
      category: input.category ?? "custom",
      source: "custom",
      allowedOperators: input.allowedOperators,
      enumOptions: input.enumOptions ?? [],
      isRequiredForEval: input.isRequiredForEval ?? false,
    })
    .onConflictDoUpdate({
      target: [qualificationFieldDefinitions.key, qualificationFieldDefinitions.orgId],
      set: {
        label: input.label,
        dataType: input.dataType,
        category: input.category ?? "custom",
        allowedOperators: input.allowedOperators,
        enumOptions: input.enumOptions ?? [],
        isRequiredForEval: input.isRequiredForEval ?? false,
        updatedAt: new Date(),
      },
    })
}

// ─── Behavior events ──────────────────────────────────────────────────────────

/**
 * Aggregates behavior event data for a lead into a flat keyed object
 * suitable for use as fields in buildLeadContext().
 */
export async function getEventDataForLead(
  leadId: string,
  orgId: string,
): Promise<Record<string, unknown>> {
  // Fetch all behavior events for this lead
  const events = await db
    .select({
      eventType: leadBehaviorEvents.eventType,
      value: leadBehaviorEvents.value,
      productId: leadBehaviorEvents.productId,
      category: leadBehaviorEvents.category,
      occurredAt: leadBehaviorEvents.occurredAt,
    })
    .from(leadBehaviorEvents)
    .where(
      and(
        eq(leadBehaviorEvents.leadId, leadId),
        eq(leadBehaviorEvents.orgId, orgId),
      )
    )
    .orderBy(desc(leadBehaviorEvents.occurredAt))

  const result: Record<string, unknown> = {}

  // ecom_cart_value: SUM(value) WHERE event_type='add_to_cart'
  const cartEvents = events.filter((e) => e.eventType === "add_to_cart")
  result.ecom_cart_value = cartEvents.reduce(
    (sum, e) => sum + (parseFloat(e.value ?? "0") || 0),
    0,
  )

  // ecom_checkout_started: any event_type='begin_checkout'
  result.ecom_checkout_started = events.some((e) => e.eventType === "begin_checkout")

  // ecom_cart_abandoned: any event_type='checkout_abandoned'
  result.ecom_cart_abandoned = events.some((e) => e.eventType === "checkout_abandoned")

  // ecom_payment_failed: any event_type='payment_failed'
  result.ecom_payment_failed = events.some((e) => e.eventType === "payment_failed")

  // ecom_view_count: COUNT(*) WHERE event_type='view_product'
  result.ecom_view_count = events.filter((e) => e.eventType === "view_product").length

  // ecom_product_id: last product_id WHERE event_type IN ('view_product','add_to_cart')
  const productEvents = events.filter(
    (e) => e.eventType === "view_product" || e.eventType === "add_to_cart"
  )
  result.ecom_product_id = productEvents.length > 0 ? (productEvents[0].productId ?? null) : null

  // ecom_category: last category from product events
  result.ecom_category = productEvents.length > 0 ? (productEvents[0].category ?? null) : null

  return result
}

export async function recordBehaviorEvent(
  orgId: string,
  leadId: string | null,
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
): Promise<{ created: boolean }> {
  const result = await db
    .insert(leadBehaviorEvents)
    .values({
      orgId,
      leadId: leadId ?? null,
      eventType: event.eventType,
      externalId: event.externalId ?? null,
      productId: event.productId ?? null,
      variantId: event.variantId ?? null,
      category: event.category ?? null,
      quantity: event.quantity ?? null,
      value: event.value ?? null,
      currency: event.currency ?? null,
      cartItems: event.cartItems ?? [],
      metadata: event.metadata ?? {},
      platform: event.platform ?? null,
      source: event.source ?? null,
      occurredAt: event.occurredAt ?? new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: leadBehaviorEvents.id })

  return { created: result.length > 0 }
}

// ─── Evaluation persistence ───────────────────────────────────────────────────

export async function persistProfileEvaluation(
  leadId: string,
  orgId: string,
  profileId: string,
  result: ProfileEvaluationResult,
  trigger: EvaluationTrigger,
): Promise<string> {
  const [row] = await db
    .insert(leadQualifications)
    .values({
      leadId,
      orgId,
      profileId,
      profileVersion: result.profileVersion,
      scoreInt: result.score,
      evaluationTrigger: trigger,
      matchedRules: result.matchedRules as unknown as Record<string, unknown>[],
      missingFields: result.missingFields,
      evalDurationMs: result.evalDurationMs,
      snapshot: result.inputs as unknown as Record<string, unknown>,
      visibleLabel: result.visibleLabel,
      qualClass: result.class,
      qualType: "automatic",
      reasons: result.reasons,
      inputs: result.inputs as unknown as {
        negocioRaw: string | null
        negocioNormalized: string | null
        cityRaw: string | null
        cityCanonical: string | null
      },
      ruleSetVersion: 0,
    })
    .returning({ id: leadQualifications.id })

  // Refresh effective_qual_class cache on lead — non-fatal
  await refreshEffectiveQualClass(leadId, orgId).catch(() => undefined)

  return row.id
}

/**
 * Resolves the active profile for a campaign following the precedence chain:
 * campaign.profileId → client's published profile → null
 */
export async function getActiveProfileForCampaign(
  orgId: string,
  campaignId: string,
): Promise<{ profile: QualificationProfile; rules: QualificationRule[] } | null> {
  // 1. Load campaign to get profileId and clientId
  const [campaign] = await db
    .select({
      profileId: campaigns.profileId,
      clientId: campaigns.clientId,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.orgId, orgId),
      )
    )
    .limit(1)

  if (!campaign) return null

  let profile: QualificationProfile | null = null

  // 2. Campaign-level profile override
  if (campaign.profileId) {
    profile = await getProfileById(orgId, campaign.profileId)
  }

  // 3. Client-scoped published profile (with org-wide fallback)
  if (!profile) {
    profile = await getPublishedProfileByClientId(orgId, campaign.clientId)
  }

  if (!profile) return null

  // Load rules for the resolved profile
  const rules = await getRulesByProfileId(orgId, profile.id)

  return { profile, rules }
}
