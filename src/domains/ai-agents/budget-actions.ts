"use server"

import { requireOrganizationMembership, requireRole } from "@/lib/auth/server"
import { z } from "zod"
import {
  getBudgetLimits,
  upsertBudgetLimits,
  getDailyBudgetAlertStatus,
  getOrgSpendMillicents,
} from "./budget-repository"
import { formatMillicentsAsUsd } from "./cost-utils"

// ─── Schemas ──────────────────────────────────────────────────────────────────

const UpsertBudgetSchema = z.object({
  dailyLimitMillicents: z.number().int().positive().nullable().optional(),
  monthlyLimitMillicents: z.number().int().positive().nullable().optional(),
  perConversationLimitMillicents: z.number().int().positive().nullable().optional(),
  alertThresholdPct: z.number().int().min(1).max(100).optional(),
  pauseOnExhaust: z.boolean().optional(),
})

// ─── Get budget limits ────────────────────────────────────────────────────────

export async function getBudgetLimitsAction() {
  const ctx = await requireOrganizationMembership()
  const limits = await getBudgetLimits(ctx.orgId)
  return { success: true as const, limits }
}

// ─── Upsert budget limits (admin only) ───────────────────────────────────────

export async function upsertBudgetLimitsAction(raw: unknown) {
  await requireRole(["owner", "admin"])
  const ctx = await requireOrganizationMembership()

  const parsed = UpsertBudgetSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const limits = await upsertBudgetLimits(ctx.orgId, parsed.data)
  return { success: true as const, limits }
}

// ─── Get budget status (current spend + alert) ────────────────────────────────

export async function getBudgetStatusAction() {
  const ctx = await requireOrganizationMembership()

  const todayStart = (() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  })()

  const thisMonthStart = (() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  })()

  const [limits, dailySpend, monthlySpend, alertStatus] = await Promise.all([
    getBudgetLimits(ctx.orgId),
    getOrgSpendMillicents(ctx.orgId, todayStart),
    getOrgSpendMillicents(ctx.orgId, thisMonthStart),
    getDailyBudgetAlertStatus(ctx.orgId),
  ])

  return {
    success: true as const,
    status: {
      limits,
      dailySpendMillicents: dailySpend,
      monthlySpendMillicents: monthlySpend,
      dailySpendUsd: formatMillicentsAsUsd(dailySpend),
      monthlySpendUsd: formatMillicentsAsUsd(monthlySpend),
      dailyLimitUsd: limits?.dailyLimitMillicents ? formatMillicentsAsUsd(limits.dailyLimitMillicents) : null,
      monthlyLimitUsd: limits?.monthlyLimitMillicents ? formatMillicentsAsUsd(limits.monthlyLimitMillicents) : null,
      alert: alertStatus,
    },
  }
}
