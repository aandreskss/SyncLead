import "server-only"
import { db } from "@/lib/db"
import {
  aiBudgetLimits,
  aiBudgetReservations,
  aiUsageRecords,
  waConversations,
} from "@/lib/db/schema"
import { eq, and, sum, sql, lt, inArray } from "drizzle-orm"
import type { AiBudgetLimit } from "@/lib/db/schema"

// ─── Budget limits ────────────────────────────────────────────────────────────

export async function getBudgetLimits(orgId: string): Promise<AiBudgetLimit | null> {
  const rows = await db
    .select()
    .from(aiBudgetLimits)
    .where(eq(aiBudgetLimits.orgId, orgId))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertBudgetLimits(
  orgId: string,
  input: {
    dailyLimitMillicents?: number | null
    monthlyLimitMillicents?: number | null
    perConversationLimitMillicents?: number | null
    alertThresholdPct?: number
    pauseOnExhaust?: boolean
  }
): Promise<AiBudgetLimit> {
  const rows = await db
    .insert(aiBudgetLimits)
    .values({
      orgId,
      dailyLimitMillicents: input.dailyLimitMillicents ?? null,
      monthlyLimitMillicents: input.monthlyLimitMillicents ?? null,
      perConversationLimitMillicents: input.perConversationLimitMillicents ?? null,
      alertThresholdPct: input.alertThresholdPct ?? 80,
      pauseOnExhaust: input.pauseOnExhaust ?? true,
    })
    .onConflictDoUpdate({
      target: aiBudgetLimits.orgId,
      set: {
        dailyLimitMillicents: input.dailyLimitMillicents ?? null,
        monthlyLimitMillicents: input.monthlyLimitMillicents ?? null,
        perConversationLimitMillicents: input.perConversationLimitMillicents ?? null,
        alertThresholdPct: input.alertThresholdPct ?? 80,
        pauseOnExhaust: input.pauseOnExhaust ?? true,
        updatedAt: new Date(),
      },
    })
    .returning()
  return rows[0]!
}

// ─── Spend queries ────────────────────────────────────────────────────────────

// Confirmed spend: SUM of totalCostMillicents for non-sandbox records in time window.
// Includes active reservations to prevent concurrent over-spending.
export async function getOrgSpendMillicents(
  orgId: string,
  since: Date
): Promise<number> {
  const [confirmedRow] = await db
    .select({ total: sum(aiUsageRecords.totalCostMillicents) })
    .from(aiUsageRecords)
    .where(
      and(
        eq(aiUsageRecords.orgId, orgId),
        eq(aiUsageRecords.isSandbox, false),
        sql`${aiUsageRecords.createdAt} >= ${since}`
      )
    )

  const [reservedRow] = await db
    .select({ total: sum(aiBudgetReservations.reservedMillicents) })
    .from(aiBudgetReservations)
    .where(
      and(
        eq(aiBudgetReservations.orgId, orgId),
        eq(aiBudgetReservations.status, "reserved")
      )
    )

  const confirmed = Number(confirmedRow?.total ?? 0)
  const reserved = Number(reservedRow?.total ?? 0)
  return confirmed + reserved
}

export async function getConversationSpendMillicents(
  orgId: string,
  conversationId: string
): Promise<number> {
  const [row] = await db
    .select({ total: sum(aiUsageRecords.totalCostMillicents) })
    .from(aiUsageRecords)
    .where(
      and(
        eq(aiUsageRecords.orgId, orgId),
        eq(aiUsageRecords.conversationId, conversationId),
        eq(aiUsageRecords.isSandbox, false)
      )
    )
  return Number(row?.total ?? 0)
}

// ─── Budget check + reservation (atomic pattern) ──────────────────────────────

// Returns the start of today in UTC (for daily spend calculations)
function todayUtcStart(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

// Returns the start of this calendar month in UTC
function thisMonthUtcStart(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export type BudgetCheckResult =
  | { allowed: true; reservationId: string | undefined }
  | { allowed: false; reason: "daily_limit" | "monthly_limit" | "conversation_limit"; reservationId: undefined }

// Check budget limits and create a reservation if allowed.
// Conservative reservation protects against concurrent engine runs overrunning budget.
// If no budget limits configured, reservation is skipped (unlimited mode).
export async function checkBudgetAndReserve(params: {
  orgId: string
  queueItemId: string
  episodeId: string | null
  conversationId: string
  estimatedMillicents: number
}): Promise<BudgetCheckResult> {
  const limits = await getBudgetLimits(params.orgId)

  // No limits configured → allow without reservation
  if (!limits) {
    return { allowed: true, reservationId: undefined }
  }

  // Check daily limit
  if (limits.dailyLimitMillicents !== null) {
    const dailySpend = await getOrgSpendMillicents(params.orgId, todayUtcStart())
    if (dailySpend + params.estimatedMillicents > limits.dailyLimitMillicents) {
      return { allowed: false, reason: "daily_limit", reservationId: undefined }
    }
  }

  // Check monthly limit
  if (limits.monthlyLimitMillicents !== null) {
    const monthlySpend = await getOrgSpendMillicents(params.orgId, thisMonthUtcStart())
    if (monthlySpend + params.estimatedMillicents > limits.monthlyLimitMillicents) {
      return { allowed: false, reason: "monthly_limit", reservationId: undefined }
    }
  }

  // Check per-conversation limit
  if (limits.perConversationLimitMillicents !== null) {
    const convSpend = await getConversationSpendMillicents(params.orgId, params.conversationId)
    if (convSpend + params.estimatedMillicents > limits.perConversationLimitMillicents) {
      return { allowed: false, reason: "conversation_limit", reservationId: undefined }
    }
  }

  // Create reservation (UNIQUE on queueItemId prevents double-reservation)
  const rows = await db
    .insert(aiBudgetReservations)
    .values({
      orgId: params.orgId,
      queueItemId: params.queueItemId,
      episodeId: params.episodeId,
      reservedMillicents: params.estimatedMillicents,
    })
    .onConflictDoNothing()
    .returning()

  return { allowed: true, reservationId: rows[0]?.id }
}

// Settle a reservation as consumed (usage recorded) or released (engine failed/skipped)
export async function settleReservation(params: {
  queueItemId: string
  orgId: string
  status: "consumed" | "released"
  releasedReason?: string
  usageRecordId?: string
}): Promise<void> {
  await db
    .update(aiBudgetReservations)
    .set({
      status: params.status,
      releasedReason: params.releasedReason ?? null,
      settledAt: new Date(),
      usageRecordId: params.usageRecordId ?? null,
    })
    .where(
      and(
        eq(aiBudgetReservations.queueItemId, params.queueItemId),
        eq(aiBudgetReservations.orgId, params.orgId),
        eq(aiBudgetReservations.status, "reserved"),
      )
    )
}

// Mark orphaned reservations (stuck in 'reserved' > maxAgeMs, default 30min).
// Called in Step 0 of cron processor alongside orphaned queue item recovery.
export async function releaseOrphanedReservations(
  maxAgeMs = 30 * 60 * 1000
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs)
  const result = await db
    .update(aiBudgetReservations)
    .set({
      status: "orphaned",
      releasedReason: "orphan_cleanup",
      settledAt: new Date(),
    })
    .where(
      and(
        eq(aiBudgetReservations.status, "reserved"),
        lt(aiBudgetReservations.reservedAt, cutoff)
      )
    )
    .returning({ id: aiBudgetReservations.id })
  return result.length
}

// Alert threshold check: returns percentage of daily limit consumed (null if no limit)
export async function getDailyBudgetAlertStatus(orgId: string): Promise<{
  limitMillicents: number | null
  spentMillicents: number
  percentUsed: number | null
  alertThresholdPct: number
  shouldAlert: boolean
} | null> {
  const limits = await getBudgetLimits(orgId)
  if (!limits) return null

  const spentMillicents = await getOrgSpendMillicents(orgId, todayUtcStart())
  const percentUsed = limits.dailyLimitMillicents
    ? Math.round((spentMillicents / limits.dailyLimitMillicents) * 100)
    : null

  return {
    limitMillicents: limits.dailyLimitMillicents,
    spentMillicents,
    percentUsed,
    alertThresholdPct: limits.alertThresholdPct,
    shouldAlert: percentUsed !== null && percentUsed >= limits.alertThresholdPct,
  }
}
