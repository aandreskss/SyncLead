import { z } from "zod"

// ─── Meta Cloud API webhook payload schemas ───────────────────────────────────

const MetaTextContentSchema = z.object({
  body: z.string(),
})

const MetaMediaContentSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  sha256: z.string().optional(),
  caption: z.string().optional(),
})

const MetaReactionSchema = z.object({
  message_id: z.string(),
  emoji: z.string(),
})

const MetaCtwaReferralSchema = z.object({
  source_url: z.string().optional(),
  source_id: z.string(),          // Meta ad_id
  source_type: z.string(),        // "ad" for Click-to-WhatsApp ads
  headline: z.string().optional(),
  body: z.string().optional(),
  ctwa_clid: z.string().optional(), // Click-to-WhatsApp click ID (use as fbc in CAPI)
  media_type: z.string().optional(),
  image_url: z.string().optional(),
})

export const MetaIncomingMessageSchema = z.object({
  id: z.string(),         // wamid — globally unique message ID from Meta
  from: z.string(),       // sender phone number (E.164 format)
  timestamp: z.string(),  // Unix timestamp as string
  type: z.enum([
    "text", "image", "audio", "document", "video",
    "sticker", "reaction", "interactive", "button",
    "order", "unsupported", "unknown",
  ]),
  text: MetaTextContentSchema.optional(),
  image: MetaMediaContentSchema.optional(),
  audio: MetaMediaContentSchema.optional(),
  document: MetaMediaContentSchema.optional(),
  video: MetaMediaContentSchema.optional(),
  sticker: MetaMediaContentSchema.optional(),
  reaction: MetaReactionSchema.optional(),
  // Present only on the first message when the user clicked a Click-to-WhatsApp ad
  referral: MetaCtwaReferralSchema.optional(),
})
export type MetaIncomingMessage = z.infer<typeof MetaIncomingMessageSchema>

export const MetaMessageStatusSchema = z.object({
  id: z.string(),          // wamid of the outbound message
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string(),
  recipient_id: z.string(),
  errors: z.array(z.object({
    code: z.number(),
    title: z.string(),
  })).optional(),
})
export type MetaMessageStatus = z.infer<typeof MetaMessageStatusSchema>

const MetaWebhookValueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  metadata: z.object({
    display_phone_number: z.string(),
    phone_number_id: z.string(), // Meta's internal identifier for the sending number
  }),
  contacts: z.array(z.object({
    profile: z.object({ name: z.string() }),
    wa_id: z.string(),
  })).optional(),
  messages: z.array(MetaIncomingMessageSchema).optional(),
  statuses: z.array(MetaMessageStatusSchema).optional(),
})

export const MetaWebhookPayloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    id: z.string(), // WABA ID
    changes: z.array(z.object({
      value: MetaWebhookValueSchema,
      field: z.string(),
    })),
  })),
})
export type MetaWebhookPayload = z.infer<typeof MetaWebhookPayloadSchema>

// Hub verification (GET request)
export const MetaHubVerifySchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.verify_token": z.string(),
  "hub.challenge": z.string(),
})

// ─── Normalized types (parsed from webhook) ───────────────────────────────────

export interface CtwaReferral {
  adId: string              // Meta ad_id from referral.source_id
  sourceType: string        // "ad"
  ctwaClid?: string         // Click-to-WhatsApp click ID (send as fbc in CAPI)
  headline?: string         // ad headline (for lead notes)
}

export interface ParsedIncomingMessage {
  wamid: string              // external_message_id
  fromPhone: string          // customer's phone number
  toPhoneNumberId: string    // Meta's phone_number_id (our registered number)
  displayPhoneNumber?: string // human-readable phone number (from metadata)
  wabaId: string             // WABA the message arrived on
  customerName?: string      // from contacts[] if provided
  type: string               // message content type
  textContent?: string       // text body (when type=text)
  mediaId?: string           // Meta media ID (when type=image/audio/document/video/sticker)
  mimeType?: string
  caption?: string
  timestamp: Date
  // Set only on the first message from a Click-to-WhatsApp ad
  referral?: CtwaReferral
}

export interface ParsedStatusUpdate {
  wamid: string              // outbound message ID
  recipientPhone: string
  // Send delivery states aligned with wa_conversation_messages.status
  // pending | sending | accepted | delivered | read | failed | unknown
  status: "sent" | "delivered" | "read" | "failed"
  timestamp: Date
  errorCode?: number
  errorTitle?: string        // sanitized — no sensitive Meta internal details
}

// ─── CloudApiClient types ─────────────────────────────────────────────────────

export interface SendTextParams {
  phoneNumberId: string  // our registered Meta phone number ID
  to: string             // recipient phone (E.164)
  text: string
  previewUrl?: boolean
}

export interface SendTemplateParams {
  phoneNumberId: string
  to: string
  templateName: string
  languageCode: string   // e.g., "es", "en_US"
  components?: unknown[]
}

export interface SendResult {
  messageId: string  // wamid returned by Meta on acceptance
  status: "accepted"
}

// ─── WA message delivery status values ────────────────────────────────────────
// These map to wa_conversation_messages.status (text column, no DB enum constraint).
export const WA_MESSAGE_DELIVERY_STATUSES = [
  "pending",    // created locally, not yet sent to Meta
  "sending",    // in flight to Meta API
  "accepted",   // Meta accepted (200 OK from Cloud API)
  "delivered",  // Meta webhook: delivered to recipient device
  "read",       // Meta webhook: recipient read the message
  "failed",     // Meta reported failure
  "unknown",    // status update received but state not recognized
] as const
export type WaMessageDeliveryStatus = typeof WA_MESSAGE_DELIVERY_STATUSES[number]

// Inbound messages always have this status.
export const INBOUND_STATUS = "received" as const
