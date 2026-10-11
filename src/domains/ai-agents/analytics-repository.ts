import "server-only"
import { db } from "@/lib/db"
import {
  aiEpisodes,
  aiUsageRecords,
  waConversations,
  waConversationMessages,
  leads,
  leadQualifications,
  conversions,
  aiAgentVersions,
  aiAgents,
  campaigns,
} from "@/lib/db/schema"
import { eq, and, desc, asc, sum, count, sql, between, isNotNull, inArray, gte, lte, isNull, ne } from "drizzle-orm"

// ─── Filter types ──────────────────────────────────────────────────────────────

export interface AnalyticsFilters {
  orgId: string
  from: Date
  to: Date
  agentId?: string
  agentVersionId?: string
  phoneNumberId?: string
  campaignId?: string
}

// ─── Summary analytics ─────────────────────────────────────────────────────────

export interface EpisodeSummary {
  episodesStarted: number
  episodesActive: number
  episodesEnded: number
  exitReasonBreakdown: Record<string, number>
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalCostMillicents: number | null         // null if no cost data available
  avgCostPerEpisodeMillicents: number | null // null if zero denominator
  avgLatencyMs: number | null
  messagesDelivered: number
  messagesFailed: number
  uniqueLeads: number
  transfers: number
  objectiveMet: number
  // Extended metrics (Phase 09 complete spec)
  leadsQualified: number                     // leads with qualification ≠ unqualified created in period
  dataCompleted: number                      // leads with name+phone+email all set
  firstHumanResponseMs: number | null        // avg ms from episode start to first human operator reply
  salesAttributed: number                    // conversions within 7-day window (correlation, not causation)
  costPerQualifiedLeadMillicents: number | null // null if 0 qualified leads
}

export async function getEpisodeSummary(filters: AnalyticsFilters): Promise<EpisodeSummary> {
  // Step 1: Get episodes in date range, filtered by agent if specified
  const episodeConditions = [
    eq(aiEpisodes.orgId, filters.orgId),
    gte(aiEpisodes.startedAt, filters.from),
    lte(aiEpisodes.startedAt, filters.to),
  ]
  if (filters.campaignId) episodeConditions.push(eq(aiEpisodes.campaignId, filters.campaignId))
  if (filters.agentVersionId) episodeConditions.push(eq(aiEpisodes.agentVersionId, filters.agentVersionId))

  // If filtering by agentId, we need to join through agentVersions
  if (filters.agentId && !filters.agentVersionId) {
    const versionRows = await db
      .select({ id: aiAgentVersions.id })
      .from(aiAgentVersions)
      .where(and(eq(aiAgentVersions.agentId, filters.agentId), eq(aiAgentVersions.orgId, filters.orgId)))
    const vids = versionRows.map(r => r.id)
    if (vids.length > 0) {
      episodeConditions.push(inArray(aiEpisodes.agentVersionId, vids))
    } else {
      // No versions for this agent → no episodes
      return buildEmptySummary()
    }
  }

  // If filtering by phoneNumberId, filter by conversations on that phone
  if (filters.phoneNumberId) {
    const convRows = await db
      .select({ id: waConversations.id })
      .from(waConversations)
      .where(and(eq(waConversations.orgId, filters.orgId), eq(waConversations.phoneNumberId, filters.phoneNumberId)))
    const cids = convRows.map(r => r.id)
    if (cids.length > 0) {
      episodeConditions.push(inArray(aiEpisodes.conversationId, cids))
    } else {
      return buildEmptySummary()
    }
  }

  const episodes = await db.select().from(aiEpisodes).where(and(...episodeConditions))

  if (episodes.length === 0) return buildEmptySummary()

  const allEpisodeIds = episodes.map(e => e.id)
  const endedEpisodes = episodes.filter(e => e.status === "ended")
  const activeEpisodes = episodes.filter(e => e.status === "active")

  // Episode counts and exit reasons
  const exitReasonBreakdown: Record<string, number> = {}
  for (const ep of endedEpisodes) {
    const reason = ep.exitReason ?? "unknown"
    exitReasonBreakdown[reason] = (exitReasonBreakdown[reason] ?? 0) + 1
  }

  // Step 2: Usage records for these episodes (non-sandbox only)
  const usageRows = await db
    .select({
      inputTokens: sum(aiUsageRecords.inputTokens),
      outputTokens: sum(aiUsageRecords.outputTokens),
      cacheReadTokens: sum(aiUsageRecords.cacheReadTokens),
      cacheWriteTokens: sum(aiUsageRecords.cacheWriteTokens),
      totalCostMillicents: sum(aiUsageRecords.totalCostMillicents),
      avgLatencyMs: sql<number | null>`avg(${aiUsageRecords.latencyMs})`,
    })
    .from(aiUsageRecords)
    .where(
      and(
        inArray(aiUsageRecords.episodeId, allEpisodeIds),
        eq(aiUsageRecords.orgId, filters.orgId),
        eq(aiUsageRecords.isSandbox, false)
      )
    )

  const u = usageRows[0]

  // Step 3: Message delivery stats for conversation-messages of these conversations
  const conversationIds = [...new Set(episodes.map(e => e.conversationId))]
  const msgRows = await db
    .select({
      status: waConversationMessages.status,
      cnt: count(),
    })
    .from(waConversationMessages)
    .where(
      and(
        inArray(waConversationMessages.conversationId, conversationIds),
        eq(waConversationMessages.orgId, filters.orgId),
        eq(waConversationMessages.isAi, true)
      )
    )
    .groupBy(waConversationMessages.status)

  let messagesDelivered = 0
  let messagesFailed = 0
  for (const m of msgRows) {
    if (m.status === "delivered" || m.status === "read" || m.status === "sent" || m.status === "accepted") {
      messagesDelivered += Number(m.cnt)
    } else if (m.status === "failed") {
      messagesFailed += Number(m.cnt)
    }
  }

  // Step 4: Unique leads — fetch id+leadId for cross-step reuse
  const convRowsFull = await db
    .select({ id: waConversations.id, leadId: waConversations.leadId })
    .from(waConversations)
    .where(and(
      inArray(waConversations.id, conversationIds),
      isNotNull(waConversations.leadId)
    ))
  const uniqueLeads = new Set(convRowsFull.map(r => r.leadId).filter(Boolean)).size
  const leadIdList = [...new Set(
    convRowsFull.map(r => r.leadId).filter((id): id is string => id !== null)
  )]
  // conversationId → leadId (for attribution window mapping)
  const convLeadMap = new Map<string, string>(
    convRowsFull
      .filter((r): r is { id: string; leadId: string } => r.leadId !== null)
      .map(r => [r.id, r.leadId])
  )

  // Step 5: Compute averages (protect against zero denominators)
  const endedCount = endedEpisodes.length
  const totalCost = u?.totalCostMillicents !== null ? Number(u?.totalCostMillicents ?? 0) : null
  const avgCostPerEpisode = (totalCost !== null && endedCount > 0)
    ? Math.round(totalCost / endedCount)
    : null

  // Per-conversation earliest episode start — needed for Step 6 and Step 7
  const episodeConvStartMap = new Map<string, Date>()
  for (const ep of episodes) {
    const existing = episodeConvStartMap.get(ep.conversationId)
    if (!existing || ep.startedAt < existing) {
      episodeConvStartMap.set(ep.conversationId, ep.startedAt)
    }
  }

  // Step 6: First human response time — avg ms from episode start to first human operator reply.
  // "Human operator" = outbound message where isAi = false (sent via inbox, not by the AI engine).
  let firstHumanResponseMs: number | null = null
  {
    const humanReplies = await db
      .select({
        conversationId: waConversationMessages.conversationId,
        firstAt: sql<string>`MIN(${waConversationMessages.createdAt})`,
      })
      .from(waConversationMessages)
      .where(and(
        inArray(waConversationMessages.conversationId, conversationIds),
        eq(waConversationMessages.orgId, filters.orgId),
        eq(waConversationMessages.isAi, false),
        eq(waConversationMessages.direction, "outbound"),
      ))
      .groupBy(waConversationMessages.conversationId)

    let totalMs = 0
    let count = 0
    for (const r of humanReplies) {
      const epStart = episodeConvStartMap.get(r.conversationId)
      if (!epStart) continue
      const diff = new Date(r.firstAt).getTime() - epStart.getTime()
      if (diff > 0) { totalMs += diff; count++ }
    }
    if (count > 0) firstHumanResponseMs = Math.round(totalMs / count)
  }

  // Step 7: Leads qualified, data completed, and attributed sales.
  let leadsQualified = 0
  let dataCompleted = 0
  let salesAttributed = 0

  if (leadIdList.length > 0) {
    // Leads that received a non-unqualified evaluation during the filter date range.
    const qualRows = await db
      .select({ leadId: leadQualifications.leadId })
      .from(leadQualifications)
      .where(and(
        inArray(leadQualifications.leadId, leadIdList),
        eq(leadQualifications.orgId, filters.orgId),
        gte(leadQualifications.evaluatedAt, filters.from),
        lte(leadQualifications.evaluatedAt, filters.to),
        ne(leadQualifications.qualClass, "unqualified"),
      ))
    leadsQualified = new Set(qualRows.map(r => r.leadId)).size

    // Leads with name + phone + email all populated (data collection complete).
    const completeRows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(
        inArray(leads.id, leadIdList),
        isNotNull(leads.name),
        isNotNull(leads.phone),
        isNotNull(leads.email),
      ))
    dataCompleted = completeRows.length

    // Attributed sales: confirmed conversions within 7 days of the lead's earliest episode start.
    // ⚠️ CORRELATION ONLY — this window does not imply the AI agent caused the sale.
    // The 7-day window is documented in METRICS_DICTIONARY.md. Double-counting is prevented by
    // counting distinct leadIds (a lead with two agent episodes counts once).
    const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

    // Build per-lead earliest episode start via convLeadMap + episodeConvStartMap
    const leadEarliestEpStart = new Map<string, Date>()
    for (const [convId, leadId] of convLeadMap) {
      const epStart = episodeConvStartMap.get(convId)
      if (!epStart) continue
      const existing = leadEarliestEpStart.get(leadId)
      if (!existing || epStart < existing) leadEarliestEpStart.set(leadId, epStart)
    }

    const saleRows = await db
      .select({ leadId: conversions.leadId, convertedAt: conversions.convertedAt })
      .from(conversions)
      .where(and(
        inArray(conversions.leadId, leadIdList),
        eq(conversions.status, "confirmed"),
      ))

    const attributedLeadIds = new Set<string>()
    for (const s of saleRows) {
      if (!s.leadId || !s.convertedAt) continue
      const epStart = leadEarliestEpStart.get(s.leadId)
      if (!epStart) continue
      const diffMs = new Date(s.convertedAt).getTime() - epStart.getTime()
      if (diffMs >= 0 && diffMs <= ATTRIBUTION_WINDOW_MS) attributedLeadIds.add(s.leadId)
    }
    salesAttributed = attributedLeadIds.size
  }

  const costPerQualifiedLeadMillicents = (totalCost !== null && leadsQualified > 0)
    ? Math.round(totalCost / leadsQualified)
    : null

  return {
    episodesStarted: episodes.length,
    episodesActive: activeEpisodes.length,
    episodesEnded: endedCount,
    exitReasonBreakdown,
    totalInputTokens: Number(u?.inputTokens ?? 0),
    totalOutputTokens: Number(u?.outputTokens ?? 0),
    totalCacheReadTokens: Number(u?.cacheReadTokens ?? 0),
    totalCacheWriteTokens: Number(u?.cacheWriteTokens ?? 0),
    totalCostMillicents: totalCost,
    avgCostPerEpisodeMillicents: avgCostPerEpisode,
    avgLatencyMs: u?.avgLatencyMs ? Math.round(Number(u.avgLatencyMs)) : null,
    messagesDelivered,
    messagesFailed,
    uniqueLeads,
    transfers: exitReasonBreakdown["transfer_rule"] ?? 0,
    objectiveMet: exitReasonBreakdown["objective_met"] ?? 0,
    leadsQualified,
    dataCompleted,
    firstHumanResponseMs,
    salesAttributed,
    costPerQualifiedLeadMillicents,
  }
}

function buildEmptySummary(): EpisodeSummary {
  return {
    episodesStarted: 0, episodesActive: 0, episodesEnded: 0,
    exitReasonBreakdown: {},
    totalInputTokens: 0, totalOutputTokens: 0,
    totalCacheReadTokens: 0, totalCacheWriteTokens: 0,
    totalCostMillicents: null, avgCostPerEpisodeMillicents: null,
    avgLatencyMs: null, messagesDelivered: 0, messagesFailed: 0,
    uniqueLeads: 0, transfers: 0, objectiveMet: 0,
    leadsQualified: 0, dataCompleted: 0,
    firstHumanResponseMs: null, salesAttributed: 0,
    costPerQualifiedLeadMillicents: null,
  }
}

// ─── Conversation list with episodes ──────────────────────────────────────────

export interface ConversationRow {
  conversationId: string
  customerPhone: string
  customerName: string | null
  episodeId: string | null
  agentName: string | null
  agentVersionId: string | null
  startedAt: Date | null
  endedAt: Date | null
  exitReason: string | null
  messageCount: number
  totalCostMillicents: number | null
  leadId: string | null
  leadTemperature: string | null
}

export async function listConversationsWithEpisodes(params: {
  orgId: string
  from: Date
  to: Date
  agentId?: string
  campaignId?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: ConversationRow[]; total: number }> {
  const { orgId, from, to, page = 1, pageSize = 50 } = params
  const offset = (page - 1) * pageSize

  // Get episodes in range (most recent per conversation)
  const episodeConditions = [
    eq(aiEpisodes.orgId, orgId),
    gte(aiEpisodes.startedAt, from),
    lte(aiEpisodes.startedAt, to),
  ]
  if (params.campaignId) episodeConditions.push(eq(aiEpisodes.campaignId, params.campaignId))

  if (params.agentId) {
    const vrows = await db
      .select({ id: aiAgentVersions.id })
      .from(aiAgentVersions)
      .where(and(eq(aiAgentVersions.agentId, params.agentId), eq(aiAgentVersions.orgId, orgId)))
    const vids = vrows.map(r => r.id)
    if (vids.length === 0) return { rows: [], total: 0 }
    episodeConditions.push(inArray(aiEpisodes.agentVersionId, vids))
  }

  // Get episodes with conversation + agent name
  const episodeRows = await db
    .select({
      episodeId: aiEpisodes.id,
      conversationId: aiEpisodes.conversationId,
      agentVersionId: aiEpisodes.agentVersionId,
      startedAt: aiEpisodes.startedAt,
      endedAt: aiEpisodes.endedAt,
      exitReason: aiEpisodes.exitReason,
    })
    .from(aiEpisodes)
    .where(and(...episodeConditions))
    .orderBy(desc(aiEpisodes.startedAt))

  const total = episodeRows.length
  const paged = episodeRows.slice(offset, offset + pageSize)

  if (paged.length === 0) return { rows: [], total }

  const convIds = [...new Set(paged.map(r => r.conversationId))]
  const episodeIdList = paged.map(r => r.episodeId)
  const versionIdList = [...new Set(paged.map(r => r.agentVersionId))]

  // Load conversation metadata in batch
  const convRows = await db
    .select({
      id: waConversations.id,
      customerPhone: waConversations.customerPhone,
      customerName: waConversations.customerName,
      messageCount: waConversations.messageCount,
      leadId: waConversations.leadId,
    })
    .from(waConversations)
    .where(and(inArray(waConversations.id, convIds), eq(waConversations.orgId, orgId)))

  const convMap = new Map(convRows.map(r => [r.id, r]))

  // Load agent names
  const versionRows = await db
    .select({ id: aiAgentVersions.id, agentId: aiAgentVersions.agentId })
    .from(aiAgentVersions)
    .where(inArray(aiAgentVersions.id, versionIdList))

  const agentIdSet = [...new Set(versionRows.map(r => r.agentId))]
  const agentRows = await db
    .select({ id: aiAgents.id, name: aiAgents.name })
    .from(aiAgents)
    .where(inArray(aiAgents.id, agentIdSet))

  const agentNameMap = new Map(agentRows.map(r => [r.id, r.name]))
  const versionAgentMap = new Map(versionRows.map(r => [r.id, agentNameMap.get(r.agentId) ?? null]))

  // Load episode cost totals
  const costRows = await db
    .select({
      episodeId: aiUsageRecords.episodeId,
      total: sum(aiUsageRecords.totalCostMillicents),
    })
    .from(aiUsageRecords)
    .where(
      and(
        inArray(aiUsageRecords.episodeId, episodeIdList),
        eq(aiUsageRecords.isSandbox, false)
      )
    )
    .groupBy(aiUsageRecords.episodeId)

  const costMap = new Map(costRows.map(r => [r.episodeId, r.total !== null ? Number(r.total) : null]))

  // Load lead temperatures for unique leads
  const leadIds = [...new Set(convRows.map(r => r.leadId).filter((id): id is string => id !== null))]
  const leadTempMap = new Map<string, string | null>()
  if (leadIds.length > 0) {
    const leadRows = await db
      .select({ id: leads.id, temperature: leads.temperature })
      .from(leads)
      .where(inArray(leads.id, leadIds))
    for (const l of leadRows) leadTempMap.set(l.id, l.temperature)
  }

  const rows: ConversationRow[] = paged.map(ep => {
    const conv = convMap.get(ep.conversationId)
    return {
      conversationId: ep.conversationId,
      customerPhone: conv?.customerPhone ?? "",
      customerName: conv?.customerName ?? null,
      episodeId: ep.episodeId,
      agentName: versionAgentMap.get(ep.agentVersionId) ?? null,
      agentVersionId: ep.agentVersionId,
      startedAt: ep.startedAt,
      endedAt: ep.endedAt,
      exitReason: ep.exitReason,
      messageCount: conv?.messageCount ?? 0,
      totalCostMillicents: costMap.get(ep.episodeId) ?? null,
      leadId: conv?.leadId ?? null,
      leadTemperature: conv?.leadId ? (leadTempMap.get(conv.leadId) ?? null) : null,
    }
  })

  return { rows, total }
}

// ─── Usage time series ─────────────────────────────────────────────────────────

export interface DailyUsageRow {
  date: string // YYYY-MM-DD
  episodes: number
  inputTokens: number
  outputTokens: number
  costMillicents: number | null
}

export async function getDailyUsageSeries(params: {
  orgId: string
  from: Date
  to: Date
  agentId?: string
}): Promise<DailyUsageRow[]> {
  const conditions = [
    eq(aiUsageRecords.orgId, params.orgId),
    eq(aiUsageRecords.isSandbox, false),
    gte(aiUsageRecords.createdAt, params.from),
    lte(aiUsageRecords.createdAt, params.to),
  ]

  const rows = await db
    .select({
      date: sql<string>`DATE(${aiUsageRecords.createdAt})`,
      episodes: sql<number>`COUNT(DISTINCT ${aiUsageRecords.episodeId})`,
      inputTokens: sum(aiUsageRecords.inputTokens),
      outputTokens: sum(aiUsageRecords.outputTokens),
      costMillicents: sum(aiUsageRecords.totalCostMillicents),
    })
    .from(aiUsageRecords)
    .where(and(...conditions))
    .groupBy(sql`DATE(${aiUsageRecords.createdAt})`)
    .orderBy(sql`DATE(${aiUsageRecords.createdAt})`)

  return rows.map(r => ({
    date: String(r.date),
    episodes: Number(r.episodes),
    inputTokens: Number(r.inputTokens ?? 0),
    outputTokens: Number(r.outputTokens ?? 0),
    costMillicents: r.costMillicents !== null ? Number(r.costMillicents) : null,
  }))
}
