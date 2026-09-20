// ─── Qualification text normalization ─────────────────────────────────────────
// All functions are pure and side-effect-free — safe to import from any layer.

/**
 * Strips Unicode diacritical marks (accents, tildes, cedillas) from a string
 * that has been decomposed into NFD form. Deterministic across platforms.
 */
export function removeAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/**
 * Returns the canonical form of a text value:
 * strip accents → lowercase → collapse whitespace → trim.
 * Returns null for empty, null, or whitespace-only input.
 */
export function canonicalize(text: string | null | undefined): string | null {
  if (!text) return null
  const n = removeAccents(text).toLowerCase().replace(/\s+/g, " ").trim()
  return n || null
}

// ─── Yes / No normalization ───────────────────────────────────────────────────

const YES_FORMS = new Set([
  "si", "sí",        // canonical after accent strip
  "yes", "s",
  "claro", "claro que si",
  "afirmativo",
  "tiene", "tengo", "si tengo", "si tiene",
  "correcto", "exacto", "verdad",
  "1", "true",
])

const NO_FORMS = new Set([
  "no",
  "n", "negativo",
  "no tiene", "no tengo",
  "ninguno", "ninguna", "nada",
  "tampoco", "jamas", "nunca",    // "jamás" → "jamas" after canonicalize
  "0", "false",
])

/**
 * Normalizes a free-text yes/no answer to "si" | "no" | null.
 * Handles accents, case, common Spanish equivalents, and boolean-as-string.
 * Returns null when the input is absent, empty, or unrecognized.
 *
 * @example
 *   normalizeYesNo("Sí")         → "si"
 *   normalizeYesNo("SI")         → "si"
 *   normalizeYesNo("Claro")      → "si"
 *   normalizeYesNo("No tengo")   → "no"
 *   normalizeYesNo("tal vez")    → null
 *   normalizeYesNo(null)         → null
 */
export function normalizeYesNo(raw: string | null | undefined): "si" | "no" | null {
  if (raw == null) return null
  // Convert booleans/numbers that arrive as JSON primitives
  const c = canonicalize(String(raw))
  if (!c) return null
  if (YES_FORMS.has(c)) return "si"
  if (NO_FORMS.has(c)) return "no"
  // Partial-match fallback: "sí, tengo negocio" → canonical "si, tengo…" → starts with "si" word
  if (/^si\b/.test(c)) return "si"
  if (/^no\b/.test(c)) return "no"
  return null
}

// ─── City normalization ───────────────────────────────────────────────────────

/**
 * Maps canonical (accent-stripped, lowercase) city aliases to their
 * canonical city name. Covers Venezuelan cities common in Meta Ads leads.
 * Keys must be in canonical form (output of canonicalize()).
 */
const CITY_ALIAS_MAP: Record<string, string> = {
  // Caracas
  "dtf": "caracas",
  "ccs": "caracas",
  "capital": "caracas",
  "distrito capital": "caracas",
  "gran caracas": "caracas",
  "carakas": "caracas",          // common typo
  // Maracaibo
  "mcbo": "maracaibo",
  "maracaybo": "maracaibo",      // common typo
  "zulia": "maracaibo",
  // Valencia
  "vlc": "valencia",
  "carabobo": "valencia",
  // Barquisimeto
  "barqui": "barquisimeto",
  "barquicimeto": "barquisimeto", // common typo
  "lara": "barquisimeto",
  // Maracay
  "mcay": "maracay",
  "aragua": "maracay",
  // Ciudad Guayana / Puerto Ordaz (same metro area)
  "puerto ordaz": "ciudad guayana",
  "pto ordaz": "ciudad guayana",
  "guayana": "ciudad guayana",
  "bolivar": "ciudad guayana",   // estado Bolívar → "bolivar" after canonicalize
  // San Cristóbal (canonical: "san cristobal" after accent strip)
  "tachira": "san cristobal",    // "táchira" → "tachira" after canonicalize
}

/**
 * Returns the canonical city name for a raw city string.
 * Steps: canonicalize (accent strip + lowercase + trim) → alias lookup.
 * If no alias matches, returns the canonicalized form (not null).
 * Returns null only for empty/null/whitespace input.
 *
 * @example
 *   normalizeCityCanonical("Caracas")       → "caracas"
 *   normalizeCityCanonical("CARACAS")       → "caracas"
 *   normalizeCityCanonical("DTF")           → "caracas"
 *   normalizeCityCanonical("Maracaybo")     → "maracaibo"
 *   normalizeCityCanonical("Táchira")       → "san cristobal"
 *   normalizeCityCanonical("Bogotá")        → "bogota"  (unknown, fallback)
 *   normalizeCityCanonical(null)            → null
 */
export function normalizeCityCanonical(city: string | null | undefined): string | null {
  const c = canonicalize(city)
  if (!c) return null
  return CITY_ALIAS_MAP[c] ?? c
}
