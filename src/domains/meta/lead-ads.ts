import "server-only"

const META_GRAPH_BASE = "https://graph.facebook.com"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetaFieldData = { name: string; values: string[] }

export type MetaLeadData = {
  id: string
  createdTime: string
  adId: string | null
  adsetId: string | null
  campaignId: string | null
  adName: string | null
  adsetName: string | null
  campaignName: string | null
  formId: string | null
  fieldData: MetaFieldData[]
}

// ─── API call ─────────────────────────────────────────────────────────────────

/**
 * Fetches a single lead from Meta Lead Gen API.
 * Returns null on any error (network, token, not found).
 */
export async function fetchMetaLead(
  leadgenId: string,
  accessToken: string,
  graphApiVersion?: string
): Promise<MetaLeadData | null> {
  const apiVersion = graphApiVersion ?? process.env.META_GRAPH_API_VERSION ?? "v19.0"
  const fields = "field_data,created_time,ad_id,adset_id,campaign_id,ad_name,adset_name,campaign_name,form_id"

  try {
    const url = `${META_GRAPH_BASE}/${apiVersion}/${leadgenId}?fields=${fields}&access_token=${accessToken}`
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null

    const raw = await res.json() as {
      id?: string
      created_time?: string
      ad_id?: string
      adset_id?: string
      campaign_id?: string
      ad_name?: string
      adset_name?: string
      campaign_name?: string
      form_id?: string
      field_data?: MetaFieldData[]
    }

    if (!raw.id) return null

    return {
      id: raw.id,
      createdTime: raw.created_time ?? "",
      adId: raw.ad_id ?? null,
      adsetId: raw.adset_id ?? null,
      campaignId: raw.campaign_id ?? null,
      adName: raw.ad_name ?? null,
      adsetName: raw.adset_name ?? null,
      campaignName: raw.campaign_name ?? null,
      formId: raw.form_id ?? null,
      fieldData: raw.field_data ?? [],
    }
  } catch {
    return null
  }
}

// ─── Field parser ─────────────────────────────────────────────────────────────

const NAME_FIELDS = [
  "full_name", "nombre_completo", "nombre", "name",
  "first_name", "nombre_propio",
]
const LAST_NAME_FIELDS = ["last_name", "apellido", "apellidos"]
const EMAIL_FIELDS = [
  "email", "correo", "correo_electronico", "email_address", "mail",
]
const PHONE_FIELDS = [
  "phone_number", "phone", "telefono", "celular", "movil", "tel",
]
const CITY_FIELDS = ["city", "ciudad", "ubicacion"]

/**
 * Parses Meta's field_data array into structured lead fields.
 * Common field names vary by language and form template.
 */
export function parseLeadFields(fieldData: MetaFieldData[]): {
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  customFields: Record<string, string>
} {
  function pick(keys: string[]): string | null {
    for (const key of keys) {
      const found = fieldData.find((f) => f.name.toLowerCase() === key)
      if (found?.values?.[0]) return found.values[0]
    }
    return null
  }

  let name = pick(NAME_FIELDS)

  // Build name from first + last if full_name isn't available
  if (!name) {
    const firstName = pick(["first_name", "nombre", "nombre_propio"])
    const lastName = pick(LAST_NAME_FIELDS)
    if (firstName || lastName) {
      name = [firstName, lastName].filter(Boolean).join(" ")
    }
  }

  const knownKeys = new Set([
    ...NAME_FIELDS, ...LAST_NAME_FIELDS, ...EMAIL_FIELDS, ...PHONE_FIELDS, ...CITY_FIELDS,
  ])
  const customFields: Record<string, string> = {}
  for (const f of fieldData) {
    if (!knownKeys.has(f.name.toLowerCase()) && f.values?.[0]) {
      customFields[f.name] = f.values[0]
    }
  }

  return {
    name: name || null,
    email: pick(EMAIL_FIELDS),
    phone: pick(PHONE_FIELDS),
    city: pick(CITY_FIELDS),
    customFields,
  }
}
