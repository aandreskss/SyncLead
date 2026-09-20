import { z } from "zod"

// URL fields: only http/https are accepted. javascript:, data:, etc. are rejected.
const optUrl = z
  .string()
  .url()
  .max(2048)
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
    message: "URL must use http or https",
  })
  .optional()
  .nullable()
const optStr = (max: number) => z.string().max(max).optional().nullable()

/**
 * Shared lead data accepted by both ingest modes.
 * IP and User-Agent are intentionally absent — always derived from server headers.
 */
export const LeadDataSchema = z.object({
  name: z.string().min(1, "name is required").max(255).trim(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  city: z.string().max(100).optional().default(""),
  negocio: z.union([z.boolean(), z.string(), z.number()]).optional(),

  // Idempotency key. If omitted, every submission creates a new lead.
  event_id: z.string().max(255).optional(),

  // UTM parameters
  utm_source: optStr(255),
  utm_medium: optStr(255),
  utm_campaign: optStr(255),
  utm_content: optStr(255),
  utm_term: optStr(255),

  // Meta Ads click attribution
  fbclid: optStr(500),
  fbc: optStr(500),
  fbp: optStr(500),

  // Meta Ads campaign/adset/ad identifiers and names (client-side snapshot)
  meta_campaign_id: optStr(255),
  meta_adset_id: optStr(255),
  meta_ad_id: optStr(255),
  meta_campaign_name: optStr(255),
  meta_adset_name: optStr(255),
  meta_ad_name: optStr(255),

  // Landing context — treated as soft signals; never used for auth
  landing_url: optUrl,
  referrer_url: optUrl,
  platform: optStr(50),
  device: optStr(50),
})

export type LeadData = z.infer<typeof LeadDataSchema>

/**
 * Mode A — browser form payload.
 * Adds bot-protection fields on top of the shared data.
 */
export const FormPayloadSchema = LeadDataSchema.extend({
  // Cloudflare Turnstile challenge response token
  "cf-turnstile-response": z.string().max(2048).optional(),
  // Honeypot: must be absent or empty — bots fill hidden fields
  _hp: z.string().max(200).optional().default(""),
  // Submit timestamp (ms since epoch) for min-time check
  _t: z.coerce.number().int().optional(),
})

export type FormPayload = z.infer<typeof FormPayloadSchema>

/**
 * Mode B — server-to-server payload.
 * Identical to shared schema — no bot protection fields needed.
 */
export const ServerPayloadSchema = LeadDataSchema
export type ServerPayload = LeadData

// Maximum accepted body size in bytes (64 KB)
export const MAX_BODY_BYTES = 64_000
