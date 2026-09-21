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

export interface ParsedUA {
  platform: string | null
  device: string | null
  browser: string | null
}

/**
 * Lightweight User-Agent parser — no external dependency.
 * Returns null for each field if the UA string is absent or unrecognized.
 * Device/platform/browser labels are kept in Spanish where they're visible in the UI.
 */
export function parseUserAgent(ua: string | null): ParsedUA {
  if (!ua) return { platform: null, device: null, browser: null }

  // ── Platform (OS) ─────────────────────────────────────────────────────────
  let platform: string | null = null
  if (/iPhone|iPad|iPod/i.test(ua)) {
    platform = "iOS"
  } else if (/Android/i.test(ua)) {
    platform = "Android"
  } else if (/Windows/i.test(ua)) {
    platform = "Windows"
  } else if (/CrOS/i.test(ua)) {
    platform = "ChromeOS"
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    platform = "macOS"
  } else if (/Linux/i.test(ua)) {
    platform = "Linux"
  }

  // ── Device type ───────────────────────────────────────────────────────────
  let device: string | null = null
  if (/iPad|Tablet|tablet|PlayBook|Kindle|Silk/i.test(ua)) {
    device = "Tablet"
  } else if (/Mobi|Android(?!.*Tablet)|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    device = "Móvil"
  } else if (platform !== null) {
    device = "Escritorio"
  }

  // ── Browser ───────────────────────────────────────────────────────────────
  let browser: string | null = null
  if (/SamsungBrowser/i.test(ua)) {
    browser = "Samsung"
  } else if (/OPR|OPiOS/i.test(ua)) {
    browser = "Opera"
  } else if (/Edg\//i.test(ua)) {
    browser = "Edge"
  } else if (/YaBrowser/i.test(ua)) {
    browser = "Yandex"
  } else if (/UCBrowser/i.test(ua)) {
    browser = "UCBrowser"
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = "Firefox"
  } else if (/Chrome|CriOS/i.test(ua)) {
    browser = "Chrome"
  } else if (/Safari/i.test(ua)) {
    browser = "Safari"
  }

  return { platform, device, browser }
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
