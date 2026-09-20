"use server"

import { createHash, randomBytes } from "crypto"
import { requireClientAccess } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/audit"
import {
  getTrackingSitesByClient,
  getTrackingSiteById,
  createTrackingSite,
  updateTrackingSite,
  deleteTrackingSite,
  getConversionDefinitionsByClient,
  getConversionDefinitionById,
  createConversionDefinition,
  updateConversionDefinition,
  deleteConversionDefinition,
  bulkCreateConversionDefinitions,
  createTestSession,
  getTestSessionById,
  updateTestSessionStatus,
  getObservationsBySession,
  getOpenIssuesByClient,
  resolveIssue,
  acknowledgeIssue,
  getLastObservationByDefinition,
  getObservationsByDefinition,
  getIssuesByDefinition,
  computeDiagStatus,
  createObservation,
  getRecentObservationsWithMeta,
  type ObservationWithMeta,
} from "./repository"
import {
  CreateTrackingSiteSchema,
  UpdateTrackingSiteSchema,
  CreateConversionDefinitionSchema,
  UpdateConversionDefinitionSchema,
  StartTestSessionSchema,
  ScanUrlSchema,
  ApplyTemplateSchema,
  type TrackingSitePublic,
  type ConversionDefinitionPublic,
  type ConversionObservationPublic,
  type ConversionIssuePublic,
  type TestSessionPublic,
  type ConversionWithStatus,
  type ScanResult,
} from "./types"
import { scanUrlForPixel } from "./scan"
import { getTemplate } from "./templates"
import type {
  TrackingSite,
  ConversionDefinition,
  ConversionTestSession,
  ConversionObservation,
  ConversionIssue,
  NewConversionDefinition,
} from "@/lib/db/schema"

// ─── Shape mappers ────────────────────────────────────────────────────────────

function toTrackingSitePublic(site: TrackingSite): TrackingSitePublic {
  return {
    id: site.id,
    clientId: site.clientId,
    name: site.name,
    domain: site.domain,
    environment: site.environment,
    expectedPixelId: site.expectedPixelId,
    allowedOrigins: site.allowedOrigins,
    verifiedAt: site.verifiedAt,
    verificationMethod: site.verificationMethod,
    diagnosticsEnabled: site.diagnosticsEnabled,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  }
}

function toConversionDefinitionPublic(def: ConversionDefinition): ConversionDefinitionPublic {
  return {
    id: def.id,
    clientId: def.clientId,
    trackingSiteId: def.trackingSiteId,
    internalKey: def.internalKey,
    displayName: def.displayName,
    provider: def.provider,
    providerEventName: def.providerEventName,
    description: def.description,
    businessCategory: def.businessCategory,
    expectedSource: def.expectedSource,
    triggerType: def.triggerType,
    triggerConfig: def.triggerConfig,
    requiredParameters: def.requiredParameters,
    criticality: def.criticality,
    freshnessPolicyJson: def.freshnessPolicyJson,
    enabled: def.enabled,
    version: def.version,
    installationNotes: def.installationNotes,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  }
}

function toObservationPublic(obs: ConversionObservation): ConversionObservationPublic {
  return {
    id: obs.id,
    source: obs.source,
    eventName: obs.eventName,
    eventIdHash: obs.eventIdHash,
    pageUrl: obs.pageUrl,
    environment: obs.environment,
    parametersPresent: obs.parametersPresent,
    validationResult: obs.validationResult,
    observedAt: obs.observedAt,
  }
}

function toIssuePublic(issue: ConversionIssue): ConversionIssuePublic {
  return {
    id: issue.id,
    conversionDefinitionId: issue.conversionDefinitionId,
    issueCode: issue.issueCode,
    severity: issue.severity,
    status: issue.status,
    explanation: issue.explanation,
    remediationKey: issue.remediationKey,
    firstDetectedAt: issue.firstDetectedAt,
    lastDetectedAt: issue.lastDetectedAt,
    resolvedAt: issue.resolvedAt,
  }
}

// ─── Tracking Sites ───────────────────────────────────────────────────────────

export async function getTrackingSitesAction(
  clientId: string
): Promise<{ error?: string; data?: TrackingSitePublic[] }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const sites = await getTrackingSitesByClient(ctx.orgId, clientId)
  return { data: sites.map(toTrackingSitePublic) }
}

export async function createTrackingSiteAction(
  input: unknown
): Promise<{ error?: string; data?: TrackingSitePublic }> {
  const result = CreateTrackingSiteSchema.safeParse(input)
  if (!result.success) return { error: "Datos inválidos" }

  const { clientId, ...siteData } = result.data

  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const site = await createTrackingSite({
    orgId: ctx.orgId,
    clientId,
    ...siteData,
    allowedOrigins: siteData.allowedOrigins ?? [],
  })

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.site.created",
    resourceType: "tracking_site",
    resourceId: site.id,
    metadata: { domain: site.domain, environment: site.environment },
  }).catch(() => undefined)

  return { data: toTrackingSitePublic(site) }
}

export async function updateTrackingSiteAction(
  siteId: string,
  input: unknown
): Promise<{ error?: string; data?: TrackingSitePublic }> {
  const result = UpdateTrackingSiteSchema.safeParse(input)
  if (!result.success) return { error: "Datos inválidos" }

  // Derive clientId from the site — we need auth first
  // We'll fetch the site and verify access via its clientId
  const parsedData = result.data

  // We need a clientId to call requireClientAccess; use the parsed data if present,
  // otherwise fetch the site as system and verify orgId inline.
  // Pattern: require org membership and verify site ownership.
  const { requireOrganizationMembership } = await import("@/lib/auth/server")
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const updated = await updateTrackingSite(siteId, ctx.orgId, parsedData)
  if (!updated) return { error: "Sitio no encontrado" }

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.site.updated",
    resourceType: "tracking_site",
    resourceId: siteId,
    metadata: {},
  }).catch(() => undefined)

  return { data: toTrackingSitePublic(updated) }
}

export async function deleteTrackingSiteAction(
  siteId: string,
  clientId: string
): Promise<{ error?: string; success?: boolean }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  await deleteTrackingSite(siteId, ctx.orgId)

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.site.deleted",
    resourceType: "tracking_site",
    resourceId: siteId,
    metadata: {},
  }).catch(() => undefined)

  return { success: true }
}

// ─── Conversion Definitions ───────────────────────────────────────────────────

export async function getConversionDefinitionsAction(
  clientId: string
): Promise<{ error?: string; data?: ConversionDefinitionPublic[] }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const defs = await getConversionDefinitionsByClient(ctx.orgId, clientId)
  return { data: defs.map(toConversionDefinitionPublic) }
}

export async function createConversionDefinitionAction(
  input: unknown
): Promise<{ error?: string; data?: ConversionDefinitionPublic }> {
  const result = CreateConversionDefinitionSchema.safeParse(input)
  if (!result.success) return { error: "Datos inválidos" }

  const { clientId, freshnessPolicyDays, ...defData } = result.data

  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const def = await createConversionDefinition({
    orgId: ctx.orgId,
    clientId,
    ...defData,
    freshnessPolicyJson: { days: freshnessPolicyDays ?? 30 },
    createdBy: ctx.userId,
  })

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.definition.created",
    resourceType: "conversion_definition",
    resourceId: def.id,
    metadata: { internalKey: def.internalKey },
  }).catch(() => undefined)

  return { data: toConversionDefinitionPublic(def) }
}

export async function updateConversionDefinitionAction(
  defId: string,
  input: unknown
): Promise<{ error?: string; data?: ConversionDefinitionPublic }> {
  const result = UpdateConversionDefinitionSchema.safeParse(input)
  if (!result.success) return { error: "Datos inválidos" }

  const { requireOrganizationMembership } = await import("@/lib/auth/server")
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const { freshnessPolicyDays, ...rest } = result.data
  const updatePayload: Partial<NewConversionDefinition> = { ...rest }
  if (freshnessPolicyDays !== undefined) {
    updatePayload.freshnessPolicyJson = { days: freshnessPolicyDays }
  }

  const updated = await updateConversionDefinition(defId, ctx.orgId, updatePayload)
  if (!updated) return { error: "Definición no encontrada" }

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.definition.updated",
    resourceType: "conversion_definition",
    resourceId: defId,
    metadata: {},
  }).catch(() => undefined)

  return { data: toConversionDefinitionPublic(updated) }
}

export async function deleteConversionDefinitionAction(
  defId: string,
  clientId: string
): Promise<{ error?: string; success?: boolean }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  await deleteConversionDefinition(defId, ctx.orgId)

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.definition.deleted",
    resourceType: "conversion_definition",
    resourceId: defId,
    metadata: {},
  }).catch(() => undefined)

  return { success: true }
}

// ─── Tracking Overview ────────────────────────────────────────────────────────

/**
 * Returns all conversion definitions with their computed diagStatus, lastObservedAt,
 * open issues, and recent observations.
 */
export async function getTrackingOverviewAction(
  clientId: string
): Promise<{ error?: string; data?: ConversionWithStatus[] }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const [defs, allOpenIssues] = await Promise.all([
    getConversionDefinitionsByClient(ctx.orgId, clientId),
    getOpenIssuesByClient(ctx.orgId, clientId),
  ])

  const results: ConversionWithStatus[] = await Promise.all(
    defs.map(async (def) => {
      const [lastObs, defObservations, defIssues] = await Promise.all([
        getLastObservationByDefinition(def.id, ctx.orgId),
        getObservationsByDefinition(def.id, ctx.orgId, 10),
        getIssuesByDefinition(def.id, ctx.orgId),
      ])

      const openDefIssues = defIssues.filter(
        (i) => i.status === "open" || i.status === "acknowledged"
      )

      const diagStatus = await computeDiagStatus(def, lastObs, openDefIssues)

      return {
        ...toConversionDefinitionPublic(def),
        diagStatus: diagStatus as ConversionWithStatus["diagStatus"],
        lastObservedAt: lastObs?.observedAt ?? null,
        openIssues: openDefIssues.map(toIssuePublic),
        recentObservations: defObservations.map(toObservationPublic),
      }
    })
  )

  return { data: results }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function applyBusinessTemplateAction(
  input: unknown
): Promise<{ error?: string; created?: number; skipped?: number }> {
  const result = ApplyTemplateSchema.safeParse(input)
  if (!result.success) return { error: "Datos inválidos" }

  const { clientId, trackingSiteId, template } = result.data

  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const templateDefs = getTemplate(template)

  const definitions: NewConversionDefinition[] = templateDefs.map((tDef) => ({
    orgId: ctx.orgId,
    clientId,
    trackingSiteId: trackingSiteId ?? null,
    internalKey: tDef.internalKey,
    displayName: tDef.displayName,
    provider: tDef.provider,
    providerEventName: tDef.providerEventName,
    description: tDef.description ?? null,
    businessCategory: tDef.businessCategory ?? null,
    expectedSource: tDef.expectedSource,
    triggerType: tDef.triggerType,
    triggerConfig: tDef.triggerConfig ?? {},
    requiredParameters: tDef.requiredParameters ?? [],
    criticality: tDef.criticality,
    freshnessPolicyJson: { days: tDef.freshnessPolicyDays ?? 30 },
    enabled: tDef.enabled ?? true,
    installationNotes: tDef.installationNotes ?? null,
    createdBy: ctx.userId,
  }))

  // bulkCreate uses ON CONFLICT DO NOTHING — duplicates are silently skipped
  const created = await bulkCreateConversionDefinitions(definitions)
  const skipped = definitions.length - created.length

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.template.applied",
    resourceType: "conversion_definition",
    metadata: { template, created: created.length, skipped },
  }).catch(() => undefined)

  return { created: created.length, skipped }
}

// ─── Test Sessions ────────────────────────────────────────────────────────────

export async function startTestSessionAction(
  input: unknown
): Promise<{ error?: string; data?: TestSessionPublic }> {
  const result = StartTestSessionSchema.safeParse(input)
  if (!result.success) return { error: "Datos inválidos" }

  const { clientId, conversionDefinitionId, trackingSiteId } = result.data

  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  // Verify the definition belongs to this org/client
  const def = await getConversionDefinitionById(conversionDefinitionId, ctx.orgId)
  if (!def || def.clientId !== clientId) return { error: "Definición no encontrada" }

  // Generate a secure random token (32 bytes hex = 64 hex chars)
  const plainToken = randomBytes(32).toString("hex")
  const tokenHash = createHash("sha256").update(plainToken).digest("hex")

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

  const session = await createTestSession({
    orgId: ctx.orgId,
    clientId,
    trackingSiteId: trackingSiteId ?? null,
    conversionDefinitionId,
    publicTokenHash: tokenHash,
    status: "pending",
    expiresAt,
    startedBy: ctx.userId,
  })

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.test_session.started",
    resourceType: "conversion_test_session",
    resourceId: session.id,
    metadata: { conversionDefinitionId },
  }).catch(() => undefined)

  return {
    data: {
      id: session.id,
      conversionDefinitionId: session.conversionDefinitionId,
      status: session.status,
      expiresAt: session.expiresAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      publicToken: plainToken, // returned only this one time
    },
  }
}

export async function pollTestSessionAction(
  sessionId: string,
  clientId: string
): Promise<{
  error?: string
  data?: {
    session: TestSessionPublic
    observations: ConversionObservationPublic[]
  }
}> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const session = await getTestSessionById(sessionId, ctx.orgId)
  if (!session || session.clientId !== clientId) return { error: "Sesión no encontrada" }

  // Auto-expire if past expiresAt and still active
  let currentSession = session
  if (
    (session.status === "pending" || session.status === "active") &&
    session.expiresAt < new Date()
  ) {
    await updateTestSessionStatus(session.id, "expired", undefined)
    currentSession = { ...session, status: "expired" }
  }

  const observations = await getObservationsBySession(sessionId, ctx.orgId)

  return {
    data: {
      session: {
        id: currentSession.id,
        conversionDefinitionId: currentSession.conversionDefinitionId,
        status: currentSession.status,
        expiresAt: currentSession.expiresAt,
        startedAt: currentSession.startedAt,
        completedAt: currentSession.completedAt,
        publicToken: "", // token is never returned after creation
      },
      observations: observations.map(toObservationPublic),
    },
  }
}

export async function cancelTestSessionAction(
  sessionId: string,
  clientId: string
): Promise<{ error?: string; success?: boolean }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const session = await getTestSessionById(sessionId, ctx.orgId)
  if (!session || session.clientId !== clientId) return { error: "Sesión no encontrada" }

  if (session.status !== "pending" && session.status !== "active") {
    return { error: "La sesión no puede cancelarse en su estado actual" }
  }

  await updateTestSessionStatus(sessionId, "cancelled", new Date())

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.test_session.cancelled",
    resourceType: "conversion_test_session",
    resourceId: sessionId,
    metadata: {},
  }).catch(() => undefined)

  return { success: true }
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

export async function scanTrackingSiteAction(
  input: unknown
): Promise<{ error?: string; data?: ScanResult }> {
  const result = ScanUrlSchema.safeParse(input)
  if (!result.success) return { error: "Datos inválidos" }

  const { clientId, url } = result.data

  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  // Look up the tracking site for this client to get expectedPixelId
  const sites = await getTrackingSitesByClient(ctx.orgId, clientId)
  // Find a site whose domain matches the URL (loose match)
  let expectedPixelId: string | null = null
  try {
    const urlObj = new URL(url)
    const matchedSite = sites.find((s) => {
      try {
        const siteDomain = new URL(s.domain).hostname
        return siteDomain === urlObj.hostname
      } catch {
        return false
      }
    })
    if (matchedSite) expectedPixelId = matchedSite.expectedPixelId
  } catch {
    // ignore URL parse errors — expectedPixelId stays null
  }

  const scanResult = await scanUrlForPixel(url, expectedPixelId)

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.site.scanned",
    resourceType: "tracking_site",
    metadata: { url, pixelFound: scanResult.pixelFound },
  }).catch(() => undefined)

  return { data: scanResult }
}

// ─── Live Feed ───────────────────────────────────────────────────────────────

export type LiveEvent = {
  id: string
  source: ObservationWithMeta["source"]
  eventName: string
  definitionDisplayName: string | null
  pageUrl: string | null
  environment: string
  allParamsOk: boolean
  missingParams: string[]
  observedAt: Date
}

export async function getLiveEventsAction(
  clientId: string,
  limit = 50
): Promise<{ error?: string; data?: LiveEvent[] }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const rows = await getRecentObservationsWithMeta(ctx.orgId, clientId, limit)

  const events: LiveEvent[] = rows.map((obs) => {
    const validation = (obs.validationResult ?? {}) as Record<string, string>
    const missing = Object.entries(validation)
      .filter(([, v]) => v !== "present")
      .map(([k]) => k)
    return {
      id: obs.id,
      source: obs.source,
      eventName: obs.eventName,
      definitionDisplayName: obs.definitionDisplayName,
      pageUrl: obs.pageUrl,
      environment: obs.environment ?? "production",
      allParamsOk: missing.length === 0,
      missingParams: missing,
      observedAt: obs.observedAt,
    }
  })

  return { data: events }
}

// ─── Simulate ────────────────────────────────────────────────────────────────

export async function simulateObservationAction(input: {
  clientId: string
  conversionDefinitionId: string
}): Promise<{ error?: string; data?: ConversionObservationPublic }> {
  let ctx
  try { ctx = await requireClientAccess(input.clientId) } catch { return { error: "No autorizado" } }

  const def = await getConversionDefinitionById(input.conversionDefinitionId, ctx.orgId)
  if (!def || def.clientId !== input.clientId) return { error: "Conversión no encontrada" }

  const requiredParams: string[] = def.requiredParameters ?? []
  const parametersPresent: Record<string, boolean> = Object.fromEntries(
    requiredParams.map((p) => [p, true])
  )
  const validationResult: Record<string, unknown> = Object.fromEntries(
    requiredParams.map((p) => [p, "present"])
  )

  const obs = await createObservation({
    orgId: ctx.orgId,
    clientId: input.clientId,
    trackingSiteId: null,
    conversionDefinitionId: def.id,
    testSessionId: null,
    source: "diagnostic_collector",
    eventName: def.providerEventName,
    eventIdHash: null,
    pageUrl: "https://simulator.synclead/simulated",
    environment: "production",
    parametersPresent,
    validationResult,
  })

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.observation.simulated",
    resourceType: "conversion_definition",
    resourceId: def.id,
    metadata: { eventName: def.providerEventName },
  }).catch(() => undefined)

  return { data: toObservationPublic(obs) }
}

// ─── Issues ───────────────────────────────────────────────────────────────────

export async function getOpenIssuesAction(
  clientId: string
): Promise<{ error?: string; data?: ConversionIssuePublic[] }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  const issues = await getOpenIssuesByClient(ctx.orgId, clientId)
  return { data: issues.map(toIssuePublic) }
}

export async function resolveIssueAction(
  issueId: string,
  clientId: string
): Promise<{ error?: string; success?: boolean }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  await resolveIssue(issueId, ctx.orgId)

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.issue.resolved",
    resourceType: "conversion_issue",
    resourceId: issueId,
    metadata: {},
  }).catch(() => undefined)

  return { success: true }
}

export async function acknowledgeIssueAction(
  issueId: string,
  clientId: string
): Promise<{ error?: string; success?: boolean }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }

  await acknowledgeIssue(issueId, ctx.orgId)

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "tracking.issue.acknowledged",
    resourceType: "conversion_issue",
    resourceId: issueId,
    metadata: {},
  }).catch(() => undefined)

  return { success: true }
}
