// ─── Column auto-mapping ──────────────────────────────────────────────────────
// Heuristically maps source column names to internal target fields.

import type { ColumnMapping, TargetField } from "./types"

// Canonical aliases: normalize source column name → target field
const COLUMN_ALIASES: Array<{ patterns: RegExp[]; target: TargetField }> = [
  { patterns: [/^fecha\b(?!\s+venta)/i, /^date\b/i, /^created/i], target: "createdAt" },
  { patterns: [/^nombre/i, /^name/i, /^lead\s*name/i], target: "name" },
  { patterns: [/^email/i, /^correo/i, /^e-?mail/i], target: "email" },
  { patterns: [/^ciudad/i, /^city/i, /^localidad/i, /^ubicaci[oó]n/i], target: "city" },
  { patterns: [/^whatsapp/i, /^tel[eé]f?ono/i, /^celular/i, /^m[oó]vil/i, /^phone/i], target: "phone" },
  { patterns: [/^utm[_\s]?source/i, /^fuente/i], target: "utmSource" },
  { patterns: [/^utm[_\s]?medium/i, /^medio/i, /^origen$/i], target: "utmMedium" },
  { patterns: [/^utm[_\s]?campaign/i, /^campa[nñ]a/i], target: "utmCampaign" },
  { patterns: [/^utm[_\s]?content/i, /^anuncio/i, /^ad[_\s]?name/i, /^contenido/i], target: "utmContent" },
  { patterns: [/^plataforma/i, /^platform/i, /^red/i], target: "platform" },
  { patterns: [/^dispositivo/i, /^device/i], target: "device" },
  { patterns: [/^fbc$/i], target: "fbc" },
  { patterns: [/^fbp$/i], target: "fbp" },
  { patterns: [/^ip$/i, /^ip[_\s]?address/i], target: "ip" },
  { patterns: [/^ua$/i, /^user[_\s]?agent/i, /^navegador/i], target: "userAgent" },
  { patterns: [/^negocio/i, /^business/i, /^tiene[_\s]?negocio/i], target: "negocio" },
  { patterns: [/^venta$/i, /^sale$/i, /^convert/i, /^compra/i], target: "isSale" },
  { patterns: [/^monto/i, /^amount/i, /^precio/i, /^valor/i, /^importe/i], target: "saleAmount" },
  { patterns: [/^fecha[_\s]?venta/i, /^sale[_\s]?date/i, /^converted[_\s]?at/i], target: "saleDate" },
  { patterns: [/^asignado$/i, /^assigned[_\s]?to/i, /^vendedor/i, /^asesor/i], target: "assignedToName" },
  { patterns: [/^cal\.\s*manual/i, /^calificaci[oó]n[_\s]?manual/i, /^manual[_\s]?qual/i], target: "qualManual" },
  // Estado META and Cal. Auto are intentionally skipped — not stored directly
  { patterns: [/^estado[_\s]?meta/i, /^meta[_\s]?status/i, /^asignaci[oó]n[_\s]?de[_\s]?lead/i, /^cal\.\s*auto/i, /^calificaci[oó]n[_\s]?auto/i], target: "__skip" },
]

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

export function autoDetectMapping(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}

  for (const col of columns) {
    const normalized = normalizeColumnName(col)
    let matched: TargetField | null = null

    for (const { patterns, target } of COLUMN_ALIASES) {
      if (patterns.some((p) => p.test(col) || p.test(normalized))) {
        matched = target
        break
      }
    }

    mapping[col] = matched ?? "__skip"
  }

  return mapping
}

// Validate that required fields are covered by the mapping
export function getMissingRequiredFields(mapping: ColumnMapping): string[] {
  const mapped = new Set(Object.values(mapping))
  const missing: string[] = []
  if (!mapped.has("name")) missing.push("Nombre")
  return missing
}
