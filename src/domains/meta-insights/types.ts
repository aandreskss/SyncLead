import { z } from "zod"

// ─── Connection ───────────────────────────────────────────────────────────────

export const SaveInsightsConnectionSchema = z.object({
  clientId: z.string().uuid(),
  adAccountId: z
    .string()
    .min(1)
    .max(30)
    .transform((v) => (v.startsWith("act_") ? v : `act_${v}`)),
  accessToken: z.string().min(10).max(500),
})

// ─── Sync ─────────────────────────────────────────────────────────────────────

export const TriggerSyncSchema = z.object({
  connectionId: z.string().uuid(),
  clientId: z.string().uuid(),
  syncType: z.enum(["initial", "incremental", "manual"]).default("incremental"),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const AddToAllowlistSchema = z.object({
  adAccountId: z
    .string()
    .min(1)
    .max(30)
    .transform((v) => (v.startsWith("act_") ? v : `act_${v}`)),
  notes: z.string().max(500).optional(),
})

// ─── Public types ─────────────────────────────────────────────────────────────

export interface InsightsConnectionPublic {
  id: string
  adAccountId: string | null
  connectionMode: "internal_manual" | "external_oauth"
  status: "active" | "error" | "expired" | "pending"
  lastVerifiedAt: Date | null
  lastError: string | null
  createdAt: Date
}

export interface SyncRunPublic {
  id: string
  status: string
  syncType: string | null
  adAccountId: string | null
  dateFrom: string
  dateTo: string
  recordsSynced: number
  startedAt: Date
  completedAt: Date | null
  error: string | null
}

export interface InsightsSummary {
  dateFrom: string
  dateTo: string
  adAccountId: string
  currency: string | null
  totalImpressions: number
  totalClicks: number
  totalSpend: number
  totalLeads: number
  totalConversions: number
  cpl: number | null  // cost per lead
  cpa: number | null  // cost per acquisition (conversion)
  roas: number | null // return on ad spend
  lastSyncedAt: Date | null
}

export interface AllowlistEntry {
  id: string
  adAccountId: string
  notes: string | null
  active: boolean
  createdAt: Date
}

export type SaveInsightsConnectionInput = z.infer<typeof SaveInsightsConnectionSchema>
export type TriggerSyncInput = z.infer<typeof TriggerSyncSchema>
export type AddToAllowlistInput = z.infer<typeof AddToAllowlistSchema>
