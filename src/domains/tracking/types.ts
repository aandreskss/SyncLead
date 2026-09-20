import { z } from "zod"

export const CreateTrackingSiteSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(100),
  domain: z.string().url().refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    "Solo se permiten URLs http/https"
  ),
  environment: z.enum(["production", "staging", "development"]).default("production"),
  expectedPixelId: z.string().optional(),
  allowedOrigins: z.array(z.string().url()).optional().default([]),
})

export const UpdateTrackingSiteSchema = CreateTrackingSiteSchema.partial().omit({ clientId: true })

export const CreateConversionDefinitionSchema = z.object({
  clientId: z.string().uuid(),
  trackingSiteId: z.string().uuid().optional(),
  internalKey: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guión bajo"),
  displayName: z.string().min(1).max(100),
  provider: z.enum(["meta_pixel", "meta_capi", "both", "custom"]).default("meta_pixel"),
  providerEventName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  businessCategory: z.string().max(100).optional(),
  expectedSource: z.enum(["browser", "server", "both"]).default("both"),
  triggerType: z.enum([
    "page_load", "element_click", "data_attribute", "form_submit",
    "explicit_callback", "datalayer_event", "ecommerce_event", "webhook", "manual_sale",
  ]).default("explicit_callback"),
  triggerConfig: z.record(z.string(), z.unknown()).optional().default({}),
  requiredParameters: z.array(z.string()).optional().default([]),
  criticality: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  freshnessPolicyDays: z.number().int().min(1).max(365).optional().default(30),
  enabled: z.boolean().optional().default(true),
  installationNotes: z.string().max(2000).optional(),
})

export const UpdateConversionDefinitionSchema = CreateConversionDefinitionSchema.partial().omit({ clientId: true })

export const StartTestSessionSchema = z.object({
  clientId: z.string().uuid(),
  conversionDefinitionId: z.string().uuid(),
  trackingSiteId: z.string().uuid().optional(),
})

export const ScanUrlSchema = z.object({
  clientId: z.string().uuid(),
  url: z.string().url().refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    "Solo se permiten URLs http/https"
  ),
})

export const ApplyTemplateSchema = z.object({
  clientId: z.string().uuid(),
  trackingSiteId: z.string().uuid().optional(),
  template: z.enum(["lead_gen", "ecommerce", "bookings"]),
})

export type TrackingSitePublic = {
  id: string
  clientId: string
  name: string
  domain: string
  environment: "production" | "staging" | "development"
  expectedPixelId: string | null
  allowedOrigins: string[]
  verifiedAt: Date | null
  verificationMethod: string | null
  diagnosticsEnabled: boolean
  createdAt: Date
  updatedAt: Date
}

export type ConversionDefinitionPublic = {
  id: string
  clientId: string
  trackingSiteId: string | null
  internalKey: string
  displayName: string
  provider: "meta_pixel" | "meta_capi" | "both" | "custom"
  providerEventName: string
  description: string | null
  businessCategory: string | null
  expectedSource: "browser" | "server" | "both"
  triggerType: string
  triggerConfig: Record<string, unknown>
  requiredParameters: string[]
  criticality: "critical" | "high" | "medium" | "low"
  freshnessPolicyJson: Record<string, unknown>
  enabled: boolean
  version: number
  installationNotes: string | null
  createdAt: Date
  updatedAt: Date
}

export type ConversionObservationPublic = {
  id: string
  source: "browser_pixel" | "server_capi" | "diagnostic_collector" | "scan"
  eventName: string
  eventIdHash: string | null
  pageUrl: string | null
  environment: string
  parametersPresent: Record<string, boolean>
  validationResult: Record<string, unknown>
  observedAt: Date
}

export type ConversionIssuePublic = {
  id: string
  conversionDefinitionId: string | null
  issueCode: string
  severity: "critical" | "high" | "medium" | "low" | "info"
  status: "open" | "acknowledged" | "resolved" | "ignored"
  explanation: string | null
  remediationKey: string | null
  firstDetectedAt: Date
  lastDetectedAt: Date
  resolvedAt: Date | null
}

export type TestSessionPublic = {
  id: string
  conversionDefinitionId: string
  status: "pending" | "active" | "completed" | "expired" | "cancelled"
  expiresAt: Date
  startedAt: Date
  completedAt: Date | null
  publicToken: string
}

export type DiagConversionStatus =
  | "not_configured" | "code_not_detected" | "code_detected"
  | "awaiting_test" | "observed_browser" | "observed_server" | "observed_both"
  | "accepted_by_meta" | "misconfigured" | "duplicate_risk" | "stale"
  | "failed" | "unknown"

export type ConversionWithStatus = ConversionDefinitionPublic & {
  diagStatus: DiagConversionStatus
  lastObservedAt: Date | null
  openIssues: ConversionIssuePublic[]
  recentObservations: ConversionObservationPublic[]
}

export type ScanResult = {
  url: string
  scannedAt: Date
  pixelFound: boolean
  pixelIds: string[]
  expectedPixelIdMatch: boolean | null
  gtmFound: boolean
  gtmIds: string[]
  fbqCalls: string[]
  duplicatePixel: boolean
  scriptCount: number
  issues: string[]
  limitations: string[]
}
