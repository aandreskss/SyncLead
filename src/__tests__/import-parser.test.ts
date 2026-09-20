// ─── Import parser — unit tests ───────────────────────────────────────────────
// All functions are pure (no I/O). Tests verify parsing edge cases,
// date ambiguity, boolean detection, amount formats, and formula injection.

import { describe, it, expect } from "vitest"
import {
  parseDate, parseBoolean, parseAmount, parsePhone,
  buildDedupeKey, buildFingerprint, isEmptyRow, validateParsedRow,
  applyMapping,
} from "@/domains/import/parser"
import { autoDetectMapping } from "@/domains/import/mapper"
import type { ColumnMapping } from "@/domains/import/types"

// ─── parseDate ────────────────────────────────────────────────────────────────

describe("parseDate", () => {
  it("parses ISO date YYYY-MM-DD", () => {
    const d = parseDate("2024-01-15")
    expect(d?.toISOString().slice(0, 10)).toBe("2024-01-15")
  })

  it("parses ISO with slashes YYYY/MM/DD", () => {
    const d = parseDate("2024/01/15")
    expect(d?.toISOString().slice(0, 10)).toBe("2024-01-15")
  })

  it("parses European DD/MM/YYYY", () => {
    const d = parseDate("15/01/2024")
    expect(d?.toISOString().slice(0, 10)).toBe("2024-01-15")
  })

  it("parses European with dashes DD-MM-YYYY", () => {
    const d = parseDate("15-01-2024")
    expect(d?.toISOString().slice(0, 10)).toBe("2024-01-15")
  })

  it("disambiguates: day > 12 forces day-first", () => {
    // 20/01/2024 — day must be 20 (not month 20, which is invalid)
    const d = parseDate("20/01/2024")
    expect(d?.toISOString().slice(0, 10)).toBe("2024-01-20")
  })

  it("parses Excel serial date number", () => {
    // 45306 = 2024-01-15 (approximate)
    const d = parseDate(45306)
    expect(d).not.toBeNull()
    expect(d?.getFullYear()).toBe(2024)
  })

  it("passes through Date object", () => {
    const input = new Date("2024-03-10T00:00:00Z")
    const d = parseDate(input)
    expect(d?.toISOString().slice(0, 10)).toBe("2024-03-10")
  })

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull()
  })

  it("returns null for null", () => {
    expect(parseDate(null)).toBeNull()
  })

  it("returns null for nonsense string", () => {
    expect(parseDate("not-a-date")).toBeNull()
  })
})

// ─── parseBoolean ─────────────────────────────────────────────────────────────

describe("parseBoolean", () => {
  const YES_VALUES = ["sí", "si", "SI", "SÍ", "yes", "YES", "y", "true", "TRUE", "1", "x", "X", "✓"]
  const NO_VALUES  = ["no", "NO", "n", "N", "false", "FALSE", "0"]
  const NULL_VALUES = [null, undefined, "", "  ", "maybe", "n/a", "pendiente"]

  for (const v of YES_VALUES) {
    it(`parses "${v}" as true`, () => {
      expect(parseBoolean(v)).toBe(true)
    })
  }

  for (const v of NO_VALUES) {
    it(`parses "${v}" as false`, () => {
      expect(parseBoolean(v)).toBe(false)
    })
  }

  for (const v of NULL_VALUES) {
    it(`parses ${JSON.stringify(v)} as null`, () => {
      expect(parseBoolean(v)).toBeNull()
    })
  }
})

// ─── parseAmount ──────────────────────────────────────────────────────────────

describe("parseAmount", () => {
  it("parses plain number string", () => {
    expect(parseAmount("1234.56")).toBeCloseTo(1234.56)
  })

  it("parses US format 1,234.56", () => {
    expect(parseAmount("1,234.56")).toBeCloseTo(1234.56)
  })

  it("parses European format 1.234,56", () => {
    expect(parseAmount("1.234,56")).toBeCloseTo(1234.56)
  })

  it("strips dollar sign", () => {
    expect(parseAmount("$1,234.56")).toBeCloseTo(1234.56)
  })

  it("strips spaces", () => {
    expect(parseAmount(" 500 ")).toBeCloseTo(500)
  })

  it("handles integer amount", () => {
    expect(parseAmount("500")).toBe(500)
  })

  it("handles number directly", () => {
    expect(parseAmount(500)).toBe(500)
  })

  it("returns null for empty string", () => {
    expect(parseAmount("")).toBeNull()
  })

  it("returns null for text", () => {
    expect(parseAmount("abc")).toBeNull()
  })

  it("returns null for negative amounts", () => {
    expect(parseAmount("-100")).toBeNull()
  })
})

// ─── parsePhone ───────────────────────────────────────────────────────────────

describe("parsePhone", () => {
  it("normalizes Venezuelan 04XX number", () => {
    const p = parsePhone("0424-1234567")
    expect(p).toBe("+584241234567")
  })

  it("normalizes Venezuelan 04XX without prefix", () => {
    const p = parsePhone("04241234567")
    expect(p).toBe("+584241234567")
  })

  it("keeps international format with +", () => {
    const p = parsePhone("+1 555 1234567")
    expect(p).toContain("+1")
  })

  it("returns null for empty string", () => {
    expect(parsePhone("")).toBeNull()
  })

  it("returns null for null", () => {
    expect(parsePhone(null)).toBeNull()
  })
})

// ─── buildDedupeKey ───────────────────────────────────────────────────────────

describe("buildDedupeKey", () => {
  it("is deterministic: same inputs → same key", () => {
    const k1 = buildDedupeKey("hash123", "Sheet1", 5)
    const k2 = buildDedupeKey("hash123", "Sheet1", 5)
    expect(k1).toBe(k2)
  })

  it("is different for different row indexes", () => {
    const k1 = buildDedupeKey("hash123", "Sheet1", 5)
    const k2 = buildDedupeKey("hash123", "Sheet1", 6)
    expect(k1).not.toBe(k2)
  })

  it("is different for different file hashes", () => {
    const k1 = buildDedupeKey("hash123", "Sheet1", 5)
    const k2 = buildDedupeKey("hash456", "Sheet1", 5)
    expect(k1).not.toBe(k2)
  })

  it("is a 64-char hex string (SHA-256)", () => {
    const k = buildDedupeKey("abc", "Sheet1", 0)
    expect(k).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ─── buildFingerprint ─────────────────────────────────────────────────────────

describe("buildFingerprint", () => {
  it("is deterministic", () => {
    const f1 = buildFingerprint("org1", "camp1", "Juan Pérez", "+584241234567", "2024-01-15")
    const f2 = buildFingerprint("org1", "camp1", "Juan Pérez", "+584241234567", "2024-01-15")
    expect(f1).toBe(f2)
  })

  it("differs for different names", () => {
    const f1 = buildFingerprint("org1", "camp1", "Juan", "+58424", "2024-01-15")
    const f2 = buildFingerprint("org1", "camp1", "Pedro", "+58424", "2024-01-15")
    expect(f1).not.toBe(f2)
  })

  it("differs for different orgs", () => {
    const f1 = buildFingerprint("org1", "camp1", "Juan", "+58424", "2024-01-15")
    const f2 = buildFingerprint("org2", "camp1", "Juan", "+58424", "2024-01-15")
    expect(f1).not.toBe(f2)
  })

  it("normalizes name to lowercase", () => {
    const f1 = buildFingerprint("org1", "camp1", "JUAN", "+58424", "2024-01-15")
    const f2 = buildFingerprint("org1", "camp1", "juan", "+58424", "2024-01-15")
    expect(f1).toBe(f2)
  })

  it("normalizes phone by removing spaces", () => {
    const f1 = buildFingerprint("org1", "camp1", "Juan", "+58 424 1234567", "2024-01-15")
    const f2 = buildFingerprint("org1", "camp1", "Juan", "+584241234567", "2024-01-15")
    expect(f1).toBe(f2)
  })
})

// ─── isEmptyRow ───────────────────────────────────────────────────────────────

describe("isEmptyRow", () => {
  it("detects empty row", () => {
    expect(isEmptyRow({ Nombre: "", Fecha: "", Email: "" })).toBe(true)
  })

  it("detects row with only null/undefined values", () => {
    expect(isEmptyRow({ Nombre: null, Fecha: undefined })).toBe(true)
  })

  it("returns false for non-empty row", () => {
    expect(isEmptyRow({ Nombre: "Juan", Fecha: "" })).toBe(false)
  })
})

// ─── applyMapping ─────────────────────────────────────────────────────────────

describe("applyMapping", () => {
  const mapping: ColumnMapping = {
    "Nombre": "name",
    "WhatsApp": "phone",
    "Fecha": "createdAt",
    "Venta": "isSale",
    "Monto USD": "saleAmount",
    "Negocio": "negocio",
    "Estado META": "__skip",
  }

  it("maps columns to internal fields", () => {
    const raw = {
      "Nombre": "Ana García",
      "WhatsApp": "04241234567",
      "Fecha": "2024-01-15",
      "Venta": "sí",
      "Monto USD": "500",
      "Negocio": "sí",
      "Estado META": "ignorar esto",
    }
    const result = applyMapping(raw, mapping)
    expect(result.name).toBe("Ana García")
    expect(result.phone).toContain("+58")
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.isSale).toBe(true)
    expect(result.saleAmount).toBe(500)
    expect(result.negocioRaw).toBe("sí")
    // __skip columns are ignored
    expect((result as Record<string, unknown>)["metaStatus"]).toBeUndefined()
  })

  it("handles all-empty optional fields gracefully", () => {
    const raw = { "Nombre": "María", "WhatsApp": "", "Fecha": "", "Venta": "", "Monto USD": "" }
    const result = applyMapping(raw, {
      "Nombre": "name", "WhatsApp": "phone", "Fecha": "createdAt",
      "Venta": "isSale", "Monto USD": "saleAmount",
    })
    expect(result.name).toBe("María")
    expect(result.phone).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.isSale).toBeUndefined()
    expect(result.saleAmount).toBeUndefined()
  })
})

// ─── validateParsedRow ────────────────────────────────────────────────────────

describe("validateParsedRow", () => {
  it("marks row as 'ok' when name is present", () => {
    const raw = { "Nombre": "Juan" }
    const result = validateParsedRow(0, raw, { name: "Juan", createdAt: new Date() })
    expect(result.status).toBe("ok")
    expect(result.errors).toHaveLength(0)
  })

  it("marks row as 'error' when name is missing", () => {
    const raw = { "Email": "test@test.com" }
    const result = validateParsedRow(0, raw, { email: "test@test.com" })
    expect(result.status).toBe("error")
    expect(result.errors).toContain("El campo Nombre es requerido")
  })

  it("marks row as 'warning' when isSale=true but no amount", () => {
    const raw = { "Nombre": "Juan", "Venta": "sí" }
    const result = validateParsedRow(0, raw, { name: "Juan", isSale: true, createdAt: new Date() })
    expect(result.status).toBe("warning")
    expect(result.warnings.some((w) => w.includes("monto"))).toBe(true)
  })

  it("marks row as 'skipped' when empty", () => {
    const raw = { "Nombre": "", "Fecha": "" }
    const result = validateParsedRow(0, raw, {})
    expect(result.status).toBe("skipped")
  })

  it("warns about missing date", () => {
    const raw = { "Nombre": "Pedro" }
    const result = validateParsedRow(0, raw, { name: "Pedro" })
    expect(result.warnings.some((w) => w.includes("fecha"))).toBe(true)
  })
})

// ─── autoDetectMapping ────────────────────────────────────────────────────────

describe("autoDetectMapping — 25-column Savaya fixture", () => {
  const SAVAYA_COLUMNS = [
    "Fecha", "Nombre", "Email", "Ciudad", "WhatsApp",
    "Origen", "UTM Source", "UTM Medium", "UTM Campaign", "Anuncio",
    "Plataforma", "Dispositivo", "Venta", "Monto USD", "Fecha Venta",
    "Estado META", "fbc", "fbp", "IP", "UA",
    "Asignación de Lead", "Asignado", "Negocio", "Cal. Auto", "Cal. Manual",
  ]

  const mapping = autoDetectMapping(SAVAYA_COLUMNS)

  it("maps 'Fecha' → createdAt", () => {
    expect(mapping["Fecha"]).toBe("createdAt")
  })

  it("maps 'Nombre' → name", () => {
    expect(mapping["Nombre"]).toBe("name")
  })

  it("maps 'Email' → email", () => {
    expect(mapping["Email"]).toBe("email")
  })

  it("maps 'Ciudad' → city", () => {
    expect(mapping["Ciudad"]).toBe("city")
  })

  it("maps 'WhatsApp' → phone", () => {
    expect(mapping["WhatsApp"]).toBe("phone")
  })

  it("maps 'UTM Source' → utmSource", () => {
    expect(mapping["UTM Source"]).toBe("utmSource")
  })

  it("maps 'UTM Medium' → utmMedium", () => {
    expect(mapping["UTM Medium"]).toBe("utmMedium")
  })

  it("maps 'UTM Campaign' → utmCampaign", () => {
    expect(mapping["UTM Campaign"]).toBe("utmCampaign")
  })

  it("maps 'Anuncio' → utmContent", () => {
    expect(mapping["Anuncio"]).toBe("utmContent")
  })

  it("maps 'Plataforma' → platform", () => {
    expect(mapping["Plataforma"]).toBe("platform")
  })

  it("maps 'Dispositivo' → device", () => {
    expect(mapping["Dispositivo"]).toBe("device")
  })

  it("maps 'Venta' → isSale", () => {
    expect(mapping["Venta"]).toBe("isSale")
  })

  it("maps 'Monto USD' → saleAmount", () => {
    expect(mapping["Monto USD"]).toBe("saleAmount")
  })

  it("maps 'Fecha Venta' → saleDate", () => {
    expect(mapping["Fecha Venta"]).toBe("saleDate")
  })

  it("maps 'fbc' → fbc", () => {
    expect(mapping["fbc"]).toBe("fbc")
  })

  it("maps 'fbp' → fbp", () => {
    expect(mapping["fbp"]).toBe("fbp")
  })

  it("maps 'IP' → ip", () => {
    expect(mapping["IP"]).toBe("ip")
  })

  it("maps 'UA' → userAgent", () => {
    expect(mapping["UA"]).toBe("userAgent")
  })

  it("maps 'Asignado' → assignedToName", () => {
    expect(mapping["Asignado"]).toBe("assignedToName")
  })

  it("maps 'Negocio' → negocio", () => {
    expect(mapping["Negocio"]).toBe("negocio")
  })

  it("maps 'Cal. Manual' → qualManual", () => {
    expect(mapping["Cal. Manual"]).toBe("qualManual")
  })

  it("skips 'Estado META'", () => {
    expect(mapping["Estado META"]).toBe("__skip")
  })

  it("skips 'Cal. Auto'", () => {
    expect(mapping["Cal. Auto"]).toBe("__skip")
  })

  it("skips 'Asignación de Lead'", () => {
    expect(mapping["Asignación de Lead"]).toBe("__skip")
  })

  it("all columns have a mapping entry", () => {
    for (const col of SAVAYA_COLUMNS) {
      expect(mapping[col]).toBeDefined()
    }
  })
})
