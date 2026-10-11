"use server"

import { requireOrganizationMembership } from "@/lib/auth/server"
import { z } from "zod"
import {
  getEpisodeSummary,
  listConversationsWithEpisodes,
  getDailyUsageSeries,
  type AnalyticsFilters,
} from "./analytics-repository"

// ─── Schemas ──────────────────────────────────────────────────────────────────

const FiltersSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  agentId: z.string().uuid().optional(),
  agentVersionId: z.string().uuid().optional(),
  phoneNumberId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
})

const ConversationListSchema = FiltersSchema.extend({
  agentId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(200).optional().default(50),
})

// ─── Episode summary ──────────────────────────────────────────────────────────

export async function getEpisodeSummaryAction(raw: unknown) {
  const ctx = await requireOrganizationMembership()

  const parsed = FiltersSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "Filtros inválidos" }
  }

  const filters: AnalyticsFilters = { orgId: ctx.orgId, ...parsed.data }
  const summary = await getEpisodeSummary(filters)
  return { success: true as const, summary }
}

// ─── Conversation list ────────────────────────────────────────────────────────

export async function listConversationsAction(raw: unknown) {
  const ctx = await requireOrganizationMembership()

  const parsed = ConversationListSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" }
  }

  const result = await listConversationsWithEpisodes({
    orgId: ctx.orgId,
    from: parsed.data.from,
    to: parsed.data.to,
    agentId: parsed.data.agentId,
    campaignId: parsed.data.campaignId,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  })
  return { success: true as const, ...result }
}

// ─── Daily usage series ───────────────────────────────────────────────────────

export async function getDailyUsageSeriesAction(raw: unknown) {
  const ctx = await requireOrganizationMembership()

  const parsed = z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    agentId: z.string().uuid().optional(),
  }).safeParse(raw)

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "Filtros inválidos" }
  }

  const rows = await getDailyUsageSeries({ orgId: ctx.orgId, ...parsed.data })
  return { success: true as const, rows }
}
