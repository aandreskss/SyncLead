import "server-only"
import { createHash } from "crypto"

const META_GRAPH_BASE = "https://graph.facebook.com"

function getApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? "v19.0"
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex")
}

function hashIfPresent(value: string | null | undefined): string[] {
  if (!value) return []
  return [sha256(value)]
}

// ─── Lead event ───────────────────────────────────────────────────────────────

export interface LeadEventParams {
  pixelId: string
  accessToken: string
  graphApiVersion?: string
  leadId: string
  eventId: string
  email?: string | null
  phone?: string | null
  name?: string | null
  city?: string | null
  fbc?: string | null
  fbp?: string | null
  ip?: string | null
  userAgent?: string | null
  sourceUrl?: string | null
}

export async function sendLeadEvent(params: LeadEventParams): Promise<{ sent: boolean; status: string }> {
  const { pixelId, accessToken, leadId, eventId } = params
  const apiVersion = params.graphApiVersion ?? getApiVersion()

  const firstName = params.name?.split(" ")[0] ?? params.name

  const userData: Record<string, unknown> = {
    em: hashIfPresent(params.email),
    ph: hashIfPresent(params.phone?.replace(/\D/g, "")),
    fn: hashIfPresent(firstName),
    ct: hashIfPresent(params.city),
  }
  if (params.fbc) userData.fbc = params.fbc
  if (params.fbp) userData.fbp = params.fbp
  if (params.ip) userData.client_ip_address = params.ip
  if (params.userAgent) userData.client_user_agent = params.userAgent

  const event: Record<string, unknown> = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    user_data: userData,
  }
  if (params.sourceUrl) event.event_source_url = params.sourceUrl

  try {
    const url = `${META_GRAPH_BASE}/${apiVersion}/${pixelId}/events`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
      body: JSON.stringify({ data: [event] }),
      signal: AbortSignal.timeout(15_000),
    })
    const json = await res.json() as { events_received?: number; error?: { code?: number } }
    if (!res.ok) {
      const code = json.error?.code
      return { sent: false, status: `error:api_${code ?? "unknown"}` }
    }
    return { sent: true, status: `sent:${json.events_received ?? 1}` }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 80) : "network_error"
    return { sent: false, status: `fetch_error:${message}` }
  }
}

// ─── Contact event ────────────────────────────────────────────────────────────

export interface ContactEventParams {
  pixelId: string
  accessToken: string
  graphApiVersion?: string
  leadId: string
  eventId: string
  email?: string | null
  phone?: string | null
  name?: string | null
  city?: string | null
}

export async function sendContactEvent(params: ContactEventParams): Promise<{ sent: boolean; status: string }> {
  const { pixelId, accessToken, eventId } = params
  const apiVersion = params.graphApiVersion ?? getApiVersion()

  const firstName = params.name?.split(" ")[0] ?? params.name

  const userData: Record<string, unknown> = {
    em: hashIfPresent(params.email),
    ph: hashIfPresent(params.phone?.replace(/\D/g, "")),
    fn: hashIfPresent(firstName),
    ct: hashIfPresent(params.city),
  }

  const event = {
    event_name: "Contact",
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    user_data: userData,
  }

  try {
    const url = `${META_GRAPH_BASE}/${apiVersion}/${pixelId}/events`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
      body: JSON.stringify({ data: [event] }),
      signal: AbortSignal.timeout(15_000),
    })
    const json = await res.json() as { events_received?: number; error?: { code?: number } }
    if (!res.ok) {
      const code = json.error?.code
      return { sent: false, status: `error:api_${code ?? "unknown"}` }
    }
    return { sent: true, status: `sent:${json.events_received ?? 1}` }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 80) : "network_error"
    return { sent: false, status: `fetch_error:${message}` }
  }
}

// ─── Purchase event ───────────────────────────────────────────────────────────

export interface PurchaseEventParams {
  pixelId: string
  accessToken: string
  graphApiVersion?: string
  lead: {
    id: string
    name: string
    email: string | null
    phone: string | null
    city: string | null
    fbc: string | null
    fbp: string | null
    ip: string | null
    userAgent: string | null
    eventId: string | null
  }
  amount: number
  currency: string
  conversionDate: Date
}

export async function sendPurchaseEvent(params: PurchaseEventParams): Promise<{
  success: boolean
  status: string
}> {
  const { pixelId, accessToken, lead, amount, currency, conversionDate } = params
  const apiVersion = params.graphApiVersion ?? getApiVersion()

  const firstName = lead.name.split(" ")[0] ?? lead.name

  const userData: Record<string, unknown> = {
    em: hashIfPresent(lead.email),
    ph: hashIfPresent(lead.phone?.replace(/\D/g, "")),
    fn: hashIfPresent(firstName),
    ct: hashIfPresent(lead.city),
  }
  if (lead.fbc) userData.fbc = lead.fbc
  if (lead.fbp) userData.fbp = lead.fbp
  if (lead.ip) userData.client_ip_address = lead.ip
  if (lead.userAgent) userData.client_user_agent = lead.userAgent

  const event = {
    event_name: "Purchase",
    event_time: Math.floor(conversionDate.getTime() / 1000),
    event_id: lead.eventId ?? `purchase_${lead.id}`,
    action_source: "website",
    user_data: userData,
    custom_data: {
      currency: currency.toUpperCase(),
      value: amount,
    },
  }

  try {
    const url = `${META_GRAPH_BASE}/${apiVersion}/${pixelId}/events`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ data: [event] }),
    })
    const json = await res.json() as { events_received?: number; error?: { code?: number } }
    if (!res.ok) {
      // Never forward raw API error messages — they may contain token fragments or PII
      const code = json.error?.code
      if (code === 190 || code === 102) return { success: false, status: "error:invalid_token" }
      if (code === 100 || code === 200) return { success: false, status: "error:no_pixel_access" }
      return { success: false, status: `error:api_${code ?? "unknown"}` }
    }
    return { success: true, status: `sent:${json.events_received ?? 1}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    // Truncate to avoid leaking sensitive context from fetch internals
    return { success: false, status: `fetch_error:${message.slice(0, 80)}` }
  }
}
