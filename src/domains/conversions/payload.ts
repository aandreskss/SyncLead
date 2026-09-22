import { createHash } from "crypto"

// ─── Normalizers (pure — exported for testing) ────────────────────────────────

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const n = email.trim().toLowerCase()
  return n || null
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const n = phone.replace(/\D/g, "")
  return n || null
}

/** Returns first name lowercased for hashing. */
export function normalizeFirstName(name: string | null | undefined): string | null {
  if (!name) return null
  const first = name.trim().toLowerCase().split(/\s+/)[0]
  return first || null
}

export function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null
  const n = city.trim().toLowerCase()
  return n || null
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/** Returns [sha256(value)] only when value is non-empty; otherwise []. */
export function hashIfPresent(value: string | null): string[] {
  if (!value) return []
  return [sha256(value)]
}

// ─── Payload builder ─────────────────────────────────────────────────────────

export interface BuildPayloadInput {
  conversionId: string
  lead: {
    email: string | null
    phone: string | null
    name: string
    city: string | null
    fbc: string | null
    fbp: string | null
    ip: string | null
    userAgent: string | null
    landingUrl: string | null
  }
  /** Decimal string representation of the amount (e.g. "100.50") */
  amount: string
  currency: string
  orderId: string
  convertedAt: Date
}

export interface PurchaseEvent {
  event_name: "Purchase"
  event_time: number
  event_id: string
  action_source: "crm"
  event_source_url?: string
  user_data: Record<string, unknown>
  custom_data: Record<string, unknown>
}

/**
 * Builds a Meta CAPI Purchase event from a conversion.
 *
 * PII hashing rules:
 *   - email, phone, first name, city: SHA-256 after normalization, omitted when empty
 *   - fbc, fbp, ip, user_agent: sent verbatim, never hashed
 *
 * test_event_code is NOT included here — the worker adds it at send time when
 * META_TEST_EVENT_CODE is configured.
 */
export function buildPurchasePayload(input: BuildPayloadInput): PurchaseEvent {
  const { conversionId, lead, amount, currency, orderId, convertedAt } = input

  const userData: Record<string, unknown> = {}

  const emHashed = hashIfPresent(normalizeEmail(lead.email))
  if (emHashed.length) userData.em = emHashed

  const phHashed = hashIfPresent(normalizePhone(lead.phone))
  if (phHashed.length) userData.ph = phHashed

  const fnHashed = hashIfPresent(normalizeFirstName(lead.name))
  if (fnHashed.length) userData.fn = fnHashed

  const ctHashed = hashIfPresent(normalizeCity(lead.city))
  if (ctHashed.length) userData.ct = ctHashed

  // Sent verbatim (no hash) as per Meta spec
  if (lead.fbc) userData.fbc = lead.fbc
  if (lead.fbp) userData.fbp = lead.fbp
  if (lead.ip) userData.client_ip_address = lead.ip
  if (lead.userAgent) userData.client_user_agent = lead.userAgent

  const event: PurchaseEvent = {
    event_name: "Purchase",
    event_time: Math.floor(convertedAt.getTime() / 1000),
    event_id: `purchase_${conversionId}`,
    action_source: "crm",
    user_data: userData,
    custom_data: {
      currency: currency.toUpperCase(),
      value: parseFloat(amount),
      order_id: orderId,
    },
  }

  if (lead.landingUrl) event.event_source_url = lead.landingUrl

  return event
}
