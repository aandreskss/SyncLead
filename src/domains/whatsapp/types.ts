import { z } from "zod"
import type { WaMessageStatus, WaConfirmationMethod } from "@/lib/db/schema"

// ─── Config ───────────────────────────────────────────────────────────────────

export const SaveWaClientConfigSchema = z.object({
  clientId: z.string().uuid(),
  confirmationMode: z.enum(["manual", "provider"]),
  providerName: z.string().max(50).nullable().optional(),
})

// ─── Templates ────────────────────────────────────────────────────────────────

export const CreateMessageTemplateSchema = z.object({
  clientId: z.string().uuid(),
  campaignId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(100),
  content: z.string().min(1).max(4096),
  allowedVariables: z.array(z.string().max(50)).default([]),
  isDefault: z.boolean().default(false),
})

export const UpdateMessageTemplateSchema = CreateMessageTemplateSchema.partial().omit({ clientId: true })

// ─── Messages ─────────────────────────────────────────────────────────────────

export const PrepareWaLinkSchema = z.object({
  leadId: z.string().uuid(),
  templateId: z.string().uuid().nullable().optional(),
  // Variables to interpolate into the template (server-side, never from body for PII)
  variables: z.record(z.string(), z.string()).default({}),
})

export const MarkMessageSharedSchema = z.object({
  messageId: z.string().uuid(),
  note: z.string().max(500).nullable().optional(),
})

export const CorrectConfirmationSchema = z.object({
  messageId: z.string().uuid(),
  reason: z.string().min(1).max(500),
})

export const MarkLeadContactedSchema = z.object({
  leadId: z.string().uuid(),
  note: z.string().max(500).nullable().optional(),
})

// ─── Public types (safe to send to client) ───────────────────────────────────

export interface WaMessagePublic {
  id: string
  leadId: string
  status: WaMessageStatus
  confirmationMode: WaConfirmationMethod
  providerName: string | null
  confirmedAt: Date | null
  correctedAt: Date | null
  note: string | null
  linkOpenedAt: Date | null
  providerSentAt: Date | null
  providerDeliveredAt: Date | null
  providerReadAt: Date | null
  failedAt: Date | null
  failureReason: string | null
  salesRepId: string | null
  createdAt: Date
}

export interface WaClientConfigPublic {
  clientId: string
  confirmationMode: WaConfirmationMethod
  providerName: string | null
  hasProvider: boolean
}

export interface WaMetrics {
  assigned: number
  linksPrepared: number
  markedShared: number
  providerConfirmed: number
  delivered: number
  read: number
  contacted: number
  failed: number
  avgMinutesAssignToSend: number | null
  avgMinutesAssignToContact: number | null
}

// ─── Provider interface ───────────────────────────────────────────────────────
// Implementaciones futuras (Callbell, WhatsApp Cloud API) deben satisfacer este contrato.

export interface IWhatsAppProvider {
  readonly name: string
  /** Capabilities this provider can report (subset of WaMessageStatus) */
  readonly supportedStatuses: WaMessageStatus[]
  /** Send a message. Returns external message ID. */
  sendMessage(params: {
    to: string
    content: string
    externalRef?: string
  }): Promise<{ externalMessageId: string }>
  /** Parse and normalize a raw webhook payload */
  parseWebhook(raw: unknown): ProviderWebhookEvent | null
  /** Verify webhook signature */
  verifySignature(payload: string, signature: string, secret: string): boolean
  /** Map provider-native status to internal WaMessageStatus */
  normalizeStatus(providerStatus: string): WaMessageStatus | null
}

export interface ProviderWebhookEvent {
  externalMessageId: string
  providerStatus: string
  normalizedStatus: WaMessageStatus | null
  occurredAt: Date
  rawPayload: Record<string, unknown>
}

export type CreateMessageTemplateInput = z.infer<typeof CreateMessageTemplateSchema>
export type UpdateMessageTemplateInput = z.infer<typeof UpdateMessageTemplateSchema>
export type PrepareWaLinkInput = z.infer<typeof PrepareWaLinkSchema>
