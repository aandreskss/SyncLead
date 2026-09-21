import type { NextRequest } from "next/server"
import type { LeadData } from "./schema"
import { normalizePhone, calculateTemperature, normalizeCity } from "@/domains/leads/normalize"
import { normalizeYesNo, normalizeCityCanonical } from "@/domains/qualification/normalize"

export interface NormalizedLead {
  name: string
  email: string | null
  phone: string | null
  city: string | null
  negocio: boolean
  // Qualification inputs preserved verbatim for the rule engine
  negocioRaw: string | null
  negocioNormalized: "si" | "no" | null
  cityCanonical: string | null
  temperature: "hot" | "warm" | "cold"
  externalEventId: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  fbclid: string | null
  fbc: string | null
  fbp: string | null
  metaCampaignId: string | null
  metaAdsetId: string | null
  metaAdId: string | null
  metaCampaignName: string | null
  metaAdsetName: string | null
  metaAdName: string | null
  landingUrl: string | null
  referrerUrl: string | null
  platform: string | null
  device: string | null
}

/**
 * Normalizes the validated payload into a DB-ready shape.
 * All nullable string fields are coerced from undefined/empty to null.
 */
export function normalizeLeadData(data: LeadData): NormalizedLead {
  const phone = data.phone ? normalizePhone(data.phone) : null
  const city = normalizeCity(data.city ?? "")
  const negocio =
    data.negocio === true ||
    data.negocio === "true" ||
    data.negocio === 1 ||
    data.negocio === "1"
  const temperature = calculateTemperature(negocio, city)

  // Qualification inputs
  const negocioRaw = data.negocio != null ? String(data.negocio) : null
  const negocioNormalized = normalizeYesNo(negocioRaw)
  const cityCanonical = normalizeCityCanonical(data.city ?? null)

  const nullable = (v: string | null | undefined): string | null =>
    v && v.trim().length > 0 ? v : null

  return {
    name: data.name,
    email: nullable(data.email?.toLowerCase()),
    phone,
    city: city || null,
    negocio,
    negocioRaw,
    negocioNormalized,
    cityCanonical,
    temperature,
    externalEventId: nullable(data.event_id),
    utmSource: nullable(data.utm_source),
    utmMedium: nullable(data.utm_medium),
    utmCampaign: nullable(data.utm_campaign),
    utmContent: nullable(data.utm_content),
    utmTerm: nullable(data.utm_term),
    fbclid: nullable(data.fbclid),
    fbc: nullable(data.fbc),
    fbp: nullable(data.fbp),
    metaCampaignId: nullable(data.meta_campaign_id),
    metaAdsetId: nullable(data.meta_adset_id),
    metaAdId: nullable(data.meta_ad_id),
    metaCampaignName: nullable(data.meta_campaign_name),
    metaAdsetName: nullable(data.meta_adset_name),
    metaAdName: nullable(data.meta_ad_name),
    landingUrl: nullable(data.landing_url),
    referrerUrl: nullable(data.referrer_url),
    platform: nullable(data.platform),
    device: nullable(data.device),
  }
}

/**
 * Derives the real client IP from Vercel/Cloudflare trusted headers.
 * Never accepts IP from the request body.
 */
export function extractTrustedIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim() || null
  return req.headers.get("x-real-ip") || null
}

/**
 * Returns the User-Agent from the standard HTTP header.
 * Truncated to 512 chars to match the DB column.
 */
export function extractTrustedUserAgent(req: NextRequest): string | null {
  return req.headers.get("user-agent")?.slice(0, 512) ?? null
}

/**
 * Anonymizes IP for rate limiting and storage:
 * - IPv4: zeroes the last octet    (e.g., 1.2.3.4 → 1.2.3.0)
 * - IPv6: keeps the /48 prefix     (e.g., 2001:db8::1 → 2001:db8:0)
 * - Empty / unresolvable           → null
 */
export function anonymizeIp(ip: string | null): string | null {
  if (!ip) return null
  if (ip.includes(":")) {
    // IPv6 — keep first 3 groups (48-bit prefix)
    const groups = ip.split(":")
    if (groups.length < 3) return null
    return groups.slice(0, 3).join(":")
  }
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`
}

/**
 * Checks whether the request origin is within the credential's allowlist.
 * If the allowlist is empty, any origin is accepted.
 * Requests without an Origin header (server calls) always pass.
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return true                     // Non-browser request
  if (allowedOrigins.length === 0) return true // Open (Turnstile is the guard)
  return allowedOrigins.includes(origin)
}
