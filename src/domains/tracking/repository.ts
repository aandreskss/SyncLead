import "server-only"

import { db } from "@/lib/db"
import {
  trackingSites,
  conversionDefinitions,
  conversionTestSessions,
  conversionObservations,
  conversionIssues,
  type TrackingSite,
  type NewTrackingSite,
  type ConversionDefinition,
  type NewConversionDefinition,
  type ConversionTestSession,
  type NewConversionTestSession,
  type ConversionObservation,
  type NewConversionObservation,
  type ConversionIssue,
  type NewConversionIssue,
} from "@/lib/db/schema"
import { eq, and, desc, asc, lt, gte, isNull, isNotNull, or, ne, sql, inArray, ilike } from "drizzle-orm"

// ─── Tracking Sites ───────────────────────────────────────────────────────────

export async function getTrackingSitesByClient(
  orgId: string,
  clientId: string
): Promise<TrackingSite[]> {
  return db
    .select()
    .from(trackingSites)
    .where(and(eq(trackingSites.orgId, orgId), eq(trackingSites.clientId, clientId)))
    .orderBy(desc(trackingSites.createdAt))
}

export async function getTrackingSiteById(
  id: string,
  orgId: string
): Promise<TrackingSite | null> {
  const rows = await db
    .select()
    .from(trackingSites)
    .where(and(eq(trackingSites.id, id), eq(trackingSites.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createTrackingSite(
  data: NewTrackingSite
): Promise<TrackingSite> {
  const rows = await db.insert(trackingSites).values(data).returning()
  return rows[0]
}

export async function updateTrackingSite(
  id: string,
  orgId: string,
  data: Partial<NewTrackingSite>
): Promise<TrackingSite | null> {
  const rows = await db
    .update(trackingSites)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(trackingSites.id, id), eq(trackingSites.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

export async function deleteTrackingSite(
  id: string,
  orgId: string
): Promise<void> {
  await db
    .delete(trackingSites)
    .where(and(eq(trackingSites.id, id), eq(trackingSites.orgId, orgId)))
}

// ─── Conversion Definitions ───────────────────────────────────────────────────

export async function getConversionDefinitionsByClient(
  orgId: string,
  clientId: string
): Promise<ConversionDefinition[]> {
  return db
    .select()
    .from(conversionDefinitions)
    .where(
      and(
        eq(conversionDefinitions.orgId, orgId),
        eq(conversionDefinitions.clientId, clientId)
      )
    )
    .orderBy(desc(conversionDefinitions.createdAt))
}

export async function getConversionDefinitionById(
  id: string,
  orgId: string
): Promise<ConversionDefinition | null> {
  const rows = await db
    .select()
    .from(conversionDefinitions)
    .where(and(eq(conversionDefinitions.id, id), eq(conversionDefinitions.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createConversionDefinition(
  data: NewConversionDefinition
): Promise<ConversionDefinition> {
  const rows = await db.insert(conversionDefinitions).values(data).returning()
  return rows[0]
}

export async function updateConversionDefinition(
  id: string,
  orgId: string,
  data: Partial<NewConversionDefinition>
): Promise<ConversionDefinition | null> {
  const rows = await db
    .update(conversionDefinitions)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(conversionDefinitions.id, id), eq(conversionDefinitions.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

export async function deleteConversionDefinition(
  id: string,
  orgId: string
): Promise<void> {
  await db
    .delete(conversionDefinitions)
    .where(and(eq(conversionDefinitions.id, id), eq(conversionDefinitions.orgId, orgId)))
}

export async function bulkCreateConversionDefinitions(
  definitions: NewConversionDefinition[]
): Promise<ConversionDefinition[]> {
  if (definitions.length === 0) return []
  const rows = await db
    .insert(conversionDefinitions)
    .values(definitions)
    .onConflictDoNothing()
    .returning()
  return rows
}

// ─── Test Sessions ────────────────────────────────────────────────────────────

export async function createTestSession(
  data: NewConversionTestSession
): Promise<ConversionTestSession> {
  const rows = await db.insert(conversionTestSessions).values(data).returning()
  return rows[0]
}

export async function getTestSessionByTokenHash(
  tokenHash: string
): Promise<ConversionTestSession | null> {
  const rows = await db
    .select()
    .from(conversionTestSessions)
    .where(eq(conversionTestSessions.publicTokenHash, tokenHash))
    .limit(1)
  return rows[0] ?? null
}

export async function getTestSessionById(
  id: string,
  orgId: string
): Promise<ConversionTestSession | null> {
  const rows = await db
    .select()
    .from(conversionTestSessions)
    .where(
      and(
        eq(conversionTestSessions.id, id),
        eq(conversionTestSessions.orgId, orgId)
      )
    )
    .limit(1)
  return rows[0] ?? null
}

export async function updateTestSessionStatus(
  id: string,
  status: ConversionTestSession["status"],
  completedAt?: Date
): Promise<void> {
  await db
    .update(conversionTestSessions)
    .set({
      status,
      ...(completedAt !== undefined ? { completedAt } : {}),
    })
    .where(eq(conversionTestSessions.id, id))
}

/**
 * Marks all non-terminal sessions whose expiresAt is in the past as "expired".
 * Returns the count of sessions expired.
 */
export async function expireOldSessions(): Promise<number> {
  const now = new Date()
  const rows = await db
    .update(conversionTestSessions)
    .set({ status: "expired" })
    .where(
      and(
        lt(conversionTestSessions.expiresAt, now),
        or(
          eq(conversionTestSessions.status, "pending"),
          eq(conversionTestSessions.status, "active")
        )
      )
    )
    .returning({ id: conversionTestSessions.id })
  return rows.length
}

export async function getActiveSessionsByClient(
  orgId: string,
  clientId: string
): Promise<ConversionTestSession[]> {
  return db
    .select()
    .from(conversionTestSessions)
    .where(
      and(
        eq(conversionTestSessions.orgId, orgId),
        eq(conversionTestSessions.clientId, clientId),
        or(
          eq(conversionTestSessions.status, "pending"),
          eq(conversionTestSessions.status, "active")
        )
      )
    )
    .orderBy(desc(conversionTestSessions.startedAt))
}

// ─── Observations ─────────────────────────────────────────────────────────────

export async function createObservation(
  data: NewConversionObservation
): Promise<ConversionObservation> {
  const rows = await db.insert(conversionObservations).values(data).returning()
  return rows[0]
}

export async function getObservationsByDefinition(
  defId: string,
  orgId: string,
  limit = 50
): Promise<ConversionObservation[]> {
  return db
    .select()
    .from(conversionObservations)
    .where(
      and(
        eq(conversionObservations.conversionDefinitionId, defId),
        eq(conversionObservations.orgId, orgId)
      )
    )
    .orderBy(desc(conversionObservations.observedAt))
    .limit(limit)
}

export async function getObservationsBySession(
  sessionId: string,
  orgId: string
): Promise<ConversionObservation[]> {
  return db
    .select()
    .from(conversionObservations)
    .where(
      and(
        eq(conversionObservations.testSessionId, sessionId),
        eq(conversionObservations.orgId, orgId)
      )
    )
    .orderBy(desc(conversionObservations.observedAt))
}

export async function getRecentObservationsByClient(
  orgId: string,
  clientId: string,
  limit = 20
): Promise<ConversionObservation[]> {
  return db
    .select()
    .from(conversionObservations)
    .where(
      and(
        eq(conversionObservations.orgId, orgId),
        eq(conversionObservations.clientId, clientId)
      )
    )
    .orderBy(desc(conversionObservations.observedAt))
    .limit(limit)
}

export type ObservationWithMeta = ConversionObservation & {
  definitionDisplayName: string | null
}

export async function getRecentObservationsWithMeta(
  orgId: string,
  clientId: string,
  limit = 50
): Promise<ObservationWithMeta[]> {
  const rows = await db
    .select({
      obs: conversionObservations,
      defName: conversionDefinitions.displayName,
    })
    .from(conversionObservations)
    .leftJoin(
      conversionDefinitions,
      eq(conversionObservations.conversionDefinitionId, conversionDefinitions.id)
    )
    .where(
      and(
        eq(conversionObservations.orgId, orgId),
        eq(conversionObservations.clientId, clientId)
      )
    )
    .orderBy(desc(conversionObservations.observedAt))
    .limit(limit)
  return rows.map((r) => ({ ...r.obs, definitionDisplayName: r.defName ?? null }))
}

export async function getLastObservationByDefinition(
  defId: string,
  orgId: string
): Promise<ConversionObservation | null> {
  const rows = await db
    .select()
    .from(conversionObservations)
    .where(
      and(
        eq(conversionObservations.conversionDefinitionId, defId),
        eq(conversionObservations.orgId, orgId)
      )
    )
    .orderBy(desc(conversionObservations.observedAt))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Deletes observations whose retentionExpiresAt is in the past.
 * Returns the count of deleted rows.
 */
export async function deleteExpiredObservations(): Promise<number> {
  const now = new Date()
  const rows = await db
    .delete(conversionObservations)
    .where(lt(conversionObservations.retentionExpiresAt, now))
    .returning({ id: conversionObservations.id })
  return rows.length
}

// ─── Issues ───────────────────────────────────────────────────────────────────

/**
 * Upsert a conversion issue.
 * If an open/acknowledged issue with the same (orgId, clientId, defId, issueCode) exists,
 * updates lastDetectedAt. Otherwise creates a new issue.
 */
export async function upsertIssue(
  orgId: string,
  clientId: string,
  defId: string | null,
  issueCode: string,
  data: Partial<NewConversionIssue>
): Promise<ConversionIssue> {
  // Try to find an existing non-resolved issue
  const existing = await db
    .select()
    .from(conversionIssues)
    .where(
      and(
        eq(conversionIssues.orgId, orgId),
        eq(conversionIssues.clientId, clientId),
        defId != null
          ? eq(conversionIssues.conversionDefinitionId, defId)
          : isNull(conversionIssues.conversionDefinitionId),
        eq(conversionIssues.issueCode, issueCode),
        ne(conversionIssues.status, "resolved")
      )
    )
    .limit(1)

  if (existing[0]) {
    const updated = await db
      .update(conversionIssues)
      .set({ lastDetectedAt: new Date() })
      .where(eq(conversionIssues.id, existing[0].id))
      .returning()
    return updated[0]
  }

  const rows = await db
    .insert(conversionIssues)
    .values({
      orgId,
      clientId,
      conversionDefinitionId: defId,
      issueCode,
      ...data,
    })
    .returning()
  return rows[0]
}

export async function getOpenIssuesByClient(
  orgId: string,
  clientId: string
): Promise<ConversionIssue[]> {
  return db
    .select()
    .from(conversionIssues)
    .where(
      and(
        eq(conversionIssues.orgId, orgId),
        eq(conversionIssues.clientId, clientId),
        or(
          eq(conversionIssues.status, "open"),
          eq(conversionIssues.status, "acknowledged")
        )
      )
    )
    .orderBy(desc(conversionIssues.lastDetectedAt))
}

export async function getIssuesByDefinition(
  defId: string,
  orgId: string
): Promise<ConversionIssue[]> {
  return db
    .select()
    .from(conversionIssues)
    .where(
      and(
        eq(conversionIssues.conversionDefinitionId, defId),
        eq(conversionIssues.orgId, orgId)
      )
    )
    .orderBy(desc(conversionIssues.lastDetectedAt))
}

export async function resolveIssue(id: string, orgId: string): Promise<void> {
  await db
    .update(conversionIssues)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(eq(conversionIssues.id, id), eq(conversionIssues.orgId, orgId)))
}

export async function acknowledgeIssue(id: string, orgId: string): Promise<void> {
  await db
    .update(conversionIssues)
    .set({ status: "acknowledged" })
    .where(and(eq(conversionIssues.id, id), eq(conversionIssues.orgId, orgId)))
}

// ─── Visitor sessions ─────────────────────────────────────────────────────────

export type VisitorSessionRow = {
  visitorId: string
  eventCount: number
  firstSeen: Date
  lastSeen: Date
  sessionDurationMs: number
  firstEventName: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  referrer: string | null
  visitorCity: string | null
  visitorCountry: string | null
  hasCheckout: boolean
  hasAddToCart: boolean
  hasViewProduct: boolean
  uniquePageCount: number
}

export async function getVisitorSessionsByClient(
  orgId: string,
  clientId: string,
  limit = 100,
  days = 30
): Promise<VisitorSessionRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select()
    .from(conversionObservations)
    .where(
      and(
        eq(conversionObservations.orgId, orgId),
        eq(conversionObservations.clientId, clientId),
        isNotNull(conversionObservations.visitorId),
        gte(conversionObservations.observedAt, since),
        or(
          ilike(conversionObservations.utmSource, "%facebook%"),
          ilike(conversionObservations.utmSource, "%instagram%"),
          ilike(conversionObservations.utmSource, "%whatsapp%"),
        )
      )
    )
    .orderBy(asc(conversionObservations.observedAt))
    .limit(10000)

  const map = new Map<string, VisitorSessionRow>()
  const eventsByVisitor = new Map<string, Set<string>>()
  const pagesByVisitor = new Map<string, Set<string>>()

  for (const obs of rows) {
    const vid = obs.visitorId!
    const isPing = obs.eventName === "session_ping"

    if (!eventsByVisitor.has(vid)) eventsByVisitor.set(vid, new Set())
    if (!pagesByVisitor.has(vid)) pagesByVisitor.set(vid, new Set())
    if (!isPing) eventsByVisitor.get(vid)!.add(obs.eventName)
    if (obs.pageUrl) pagesByVisitor.get(vid)!.add(obs.pageUrl)

    const existing = map.get(vid)
    if (!existing) {
      map.set(vid, {
        visitorId: vid,
        eventCount: isPing ? 0 : 1,
        firstSeen: obs.observedAt,
        lastSeen: obs.observedAt,
        sessionDurationMs: 0,
        firstEventName: isPing ? "PageView" : obs.eventName,
        utmSource: obs.utmSource,
        utmMedium: obs.utmMedium,
        utmCampaign: obs.utmCampaign,
        referrer: obs.referrer,
        visitorCity: obs.visitorCity,
        visitorCountry: obs.visitorCountry,
        hasCheckout: false,
        hasAddToCart: false,
        hasViewProduct: false,
        uniquePageCount: 0,
      })
    } else {
      if (!isPing) existing.eventCount++
      if (obs.observedAt > existing.lastSeen) existing.lastSeen = obs.observedAt
    }
  }

  for (const [vid, session] of map) {
    const events = eventsByVisitor.get(vid) ?? new Set()
    const pages = pagesByVisitor.get(vid) ?? new Set()
    session.sessionDurationMs = session.lastSeen.getTime() - session.firstSeen.getTime()
    session.hasCheckout = events.has("begin_checkout") || events.has("InitiateCheckout")
    session.hasAddToCart = events.has("add_to_cart") || events.has("AddToCart")
    session.hasViewProduct = events.has("view_product") || events.has("ViewContent")
    session.uniquePageCount = pages.size
  }

  return Array.from(map.values())
    .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
    .slice(0, limit)
}

export async function getObservationsByVisitor(
  orgId: string,
  clientId: string,
  visitorId: string
): Promise<ConversionObservation[]> {
  return db
    .select()
    .from(conversionObservations)
    .where(
      and(
        eq(conversionObservations.orgId, orgId),
        eq(conversionObservations.clientId, clientId),
        eq(conversionObservations.visitorId, visitorId)
      )
    )
    .orderBy(asc(conversionObservations.observedAt))
    .limit(500)
}

// ─── Permanent site-level collect token ──────────────────────────────────────

/**
 * Looks up a tracking site by its permanent collect token.
 * Used by the collector endpoint as a fallback when no test session matches.
 */
export async function getTrackingSiteByCollectToken(
  token: string
): Promise<TrackingSite | null> {
  const rows = await db
    .select()
    .from(trackingSites)
    .where(eq(trackingSites.collectToken, token))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Persists a newly generated collect token for a tracking site.
 * Filtered by orgId to prevent cross-tenant writes.
 */
export async function setTrackingSiteCollectToken(
  siteId: string,
  orgId: string,
  token: string
): Promise<void> {
  await db
    .update(trackingSites)
    .set({ collectToken: token, updatedAt: new Date() })
    .where(and(eq(trackingSites.id, siteId), eq(trackingSites.orgId, orgId)))
}

/**
 * Finds a conversion definition by its internalKey (event name) for a given site.
 * Returns id + requiredParameters for validation in the collector endpoint.
 */
export async function getDefinitionByEventNameForSite(
  siteId: string,
  orgId: string,
  eventName: string
): Promise<{ id: string; requiredParameters: string[] | null } | null> {
  const rows = await db
    .select({
      id: conversionDefinitions.id,
      requiredParameters: conversionDefinitions.requiredParameters,
    })
    .from(conversionDefinitions)
    .where(
      and(
        eq(conversionDefinitions.trackingSiteId, siteId),
        eq(conversionDefinitions.orgId, orgId),
        eq(conversionDefinitions.internalKey, eventName)
      )
    )
    .limit(1)
  return rows[0] ?? null
}

// ─── Status computation ───────────────────────────────────────────────────────

/**
 * Computes the diagnostic status for a conversion definition based on its
 * most recent observation and open issues. Pure function — no DB queries.
 */
export async function computeDiagStatus(
  def: ConversionDefinition,
  lastObservation: ConversionObservation | null,
  openIssues: ConversionIssue[]
): Promise<string> {
  // Check for critical issues first
  const hasCriticalPixelMissing = openIssues.some(
    (i) => i.issueCode === "pixel_base_missing" && (i.status === "open" || i.status === "acknowledged")
  )
  if (hasCriticalPixelMissing) return "code_not_detected"

  const hasMisconfigured = openIssues.some(
    (i) => i.issueCode === "misconfigured" && (i.status === "open" || i.status === "acknowledged")
  )
  if (hasMisconfigured) return "misconfigured"

  const hasDuplicateRisk = openIssues.some(
    (i) => i.issueCode === "duplicate_risk" && (i.status === "open" || i.status === "acknowledged")
  )
  if (hasDuplicateRisk) return "duplicate_risk"

  // No observation yet
  if (lastObservation === null) {
    if (!def.enabled) return "not_configured"
    return "unknown"
  }

  // Check for source mismatch
  if (
    lastObservation.source === "browser_pixel" &&
    def.expectedSource === "server"
  ) {
    return "misconfigured"
  }

  // Check staleness — extract freshnessPolicyDays from the JSON blob
  const freshnessPolicy = def.freshnessPolicyJson as Record<string, unknown>
  const freshnessDays =
    typeof freshnessPolicy.days === "number" ? freshnessPolicy.days : 30
  const now = new Date()
  const staleThresholdMs = freshnessDays * 24 * 60 * 60 * 1000
  const observationAgeMs = now.getTime() - lastObservation.observedAt.getTime()
  if (observationAgeMs > staleThresholdMs) return "stale"

  // Source-based status
  const source = lastObservation.source
  const expectedSource = def.expectedSource

  // diagnostic_collector intercepts browser fbq calls — treat as browser_pixel
  if (source === "browser_pixel" || source === "diagnostic_collector") {
    if (expectedSource === "browser" || expectedSource === "both") {
      return "observed_browser"
    }
  }

  if (source === "server_capi") {
    if (expectedSource === "server" || expectedSource === "both") {
      return "observed_server"
    }
  }

  return "unknown"
}

// ─── Checkout Funnel ──────────────────────────────────────────────────────────

export type CheckoutFunnelBySource = {
  source: string
  started: number
  completed: number
  abandoned: number
}

export type CheckoutFunnelMetrics = {
  startedCount: number
  completedCount: number
  abandonedCount: number
  abandonmentRate: number
  bySource: CheckoutFunnelBySource[]
}

export async function getCheckoutFunnelMetrics(
  clientId: string,
  orgId: string,
  days: number = 30
): Promise<CheckoutFunnelMetrics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      visitorId: conversionObservations.visitorId,
      eventName: conversionObservations.eventName,
      utmSource: conversionObservations.utmSource,
    })
    .from(conversionObservations)
    .where(
      and(
        eq(conversionObservations.clientId, clientId),
        eq(conversionObservations.orgId, orgId),
        gte(conversionObservations.observedAt, since),
        inArray(conversionObservations.eventName, ["begin_checkout", "checkout_completed"]),
        isNotNull(conversionObservations.visitorId)
      )
    )

  // Group in memory — typically small datasets (checkout events, not page views)
  const starters = new Map<string, string | null>()  // visitorId → utmSource (first-touch)
  const completers = new Set<string>()

  for (const row of rows) {
    if (!row.visitorId) continue
    if (row.eventName === "begin_checkout" && !starters.has(row.visitorId)) {
      starters.set(row.visitorId, row.utmSource ?? null)
    } else if (row.eventName === "checkout_completed") {
      completers.add(row.visitorId)
    }
  }

  const startedCount = starters.size
  const completedCount = Array.from(starters.keys()).filter((v) => completers.has(v)).length
  const abandonedCount = startedCount - completedCount

  // Top 5 sources by abandonment
  const bySourceMap = new Map<string, { started: number; completed: number }>()
  for (const [visitorId, utm] of starters) {
    const key = utm ?? "(directo)"
    const entry = bySourceMap.get(key) ?? { started: 0, completed: 0 }
    entry.started++
    if (completers.has(visitorId)) entry.completed++
    bySourceMap.set(key, entry)
  }

  const bySource: CheckoutFunnelBySource[] = Array.from(bySourceMap.entries())
    .map(([source, c]) => ({ source, started: c.started, completed: c.completed, abandoned: c.started - c.completed }))
    .sort((a, b) => b.abandoned - a.abandoned)
    .slice(0, 5)

  return {
    startedCount,
    completedCount,
    abandonedCount,
    abandonmentRate: startedCount > 0 ? abandonedCount / startedCount : 0,
    bySource,
  }
}
