import { describe, it, expect } from "vitest"
import { removeAccents, canonicalize, normalizeYesNo, normalizeCityCanonical } from "@/domains/qualification/normalize"
import { evaluateLead } from "@/domains/qualification/engine"
import { isSavayaRulesV1 } from "@/domains/qualification/types"
import type { SavayaRulesV1 } from "@/domains/qualification/types"

// ─── Shared rule set ──────────────────────────────────────────────────────────

const RULES: SavayaRulesV1 = {
  type: "savaya_v1",
  priorityCities: ["caracas", "maracaibo", "valencia"],
}

// ─── removeAccents ────────────────────────────────────────────────────────────

describe("removeAccents", () => {
  it("strips acute accent from é", () => {
    expect(removeAccents("café")).toBe("cafe")
  })
  it("strips tilde from ñ", () => {
    expect(removeAccents("mañana")).toBe("manana")
  })
  it("strips cedilla from ç", () => {
    expect(removeAccents("façade")).toBe("facade")
  })
  it("leaves plain ASCII unchanged", () => {
    expect(removeAccents("hello world")).toBe("hello world")
  })
  it("handles Sí → Si", () => {
    expect(removeAccents("Sí")).toBe("Si")
  })
})

// ─── canonicalize ─────────────────────────────────────────────────────────────

describe("canonicalize", () => {
  it("returns null for null input", () => {
    expect(canonicalize(null)).toBeNull()
  })
  it("returns null for undefined input", () => {
    expect(canonicalize(undefined)).toBeNull()
  })
  it("returns null for empty string", () => {
    expect(canonicalize("")).toBeNull()
  })
  it("returns null for whitespace-only string", () => {
    expect(canonicalize("   ")).toBeNull()
  })
  it("strips accents, lowercases, and trims", () => {
    expect(canonicalize("  Táchira  ")).toBe("tachira")
  })
  it("collapses internal whitespace", () => {
    expect(canonicalize("Gran  Caracas")).toBe("gran caracas")
  })
  it("canonicalizes Sí → si", () => {
    expect(canonicalize("Sí")).toBe("si")
  })
})

// ─── normalizeYesNo ───────────────────────────────────────────────────────────

describe("normalizeYesNo", () => {
  it("returns null for null", () => {
    expect(normalizeYesNo(null)).toBeNull()
  })
  it("returns null for undefined", () => {
    expect(normalizeYesNo(undefined)).toBeNull()
  })
  it("returns null for empty string", () => {
    expect(normalizeYesNo("")).toBeNull()
  })

  // Affirmative variants
  it.each([
    "si", "sí", "Sí", "SI", "SÍ", "S", "s",
    "yes", "YES", "Yes",
    "claro", "Claro", "CLARO",
    "claro que si", "Claro que si",
    "afirmativo",
    "tiene", "TIENE",
    "tengo",
    "si tengo", "si tiene",
    "correcto", "exacto", "verdad",
    "1", "true",
  ])("normalizes '%s' → 'si'", (input) => {
    expect(normalizeYesNo(input)).toBe("si")
  })

  // Negative variants
  it.each([
    "no", "NO", "No",
    "n", "N",
    "negativo",
    "no tiene", "no tengo",
    "ninguno", "ninguna", "nada",
    "tampoco",
    "jamás", "jamas",
    "nunca",
    "0", "false",
  ])("normalizes '%s' → 'no'", (input) => {
    expect(normalizeYesNo(input)).toBe("no")
  })

  it("prefix match: 'sí, tengo negocio' → 'si'", () => {
    expect(normalizeYesNo("sí, tengo negocio")).toBe("si")
  })
  it("prefix match: 'no tengo nada' → 'no'", () => {
    expect(normalizeYesNo("no tengo nada")).toBe("no")
  })
  it("returns null for unrecognized value", () => {
    expect(normalizeYesNo("tal vez")).toBeNull()
  })
  it("returns null for 'quizás'", () => {
    expect(normalizeYesNo("quizás")).toBeNull()
  })
})

// ─── normalizeCityCanonical ───────────────────────────────────────────────────

describe("normalizeCityCanonical", () => {
  it("returns null for null", () => {
    expect(normalizeCityCanonical(null)).toBeNull()
  })
  it("returns null for empty string", () => {
    expect(normalizeCityCanonical("")).toBeNull()
  })

  // Direct canonical name
  it("lowercases 'Caracas' → 'caracas'", () => {
    expect(normalizeCityCanonical("Caracas")).toBe("caracas")
  })
  it("lowercases 'CARACAS' → 'caracas'", () => {
    expect(normalizeCityCanonical("CARACAS")).toBe("caracas")
  })

  // Aliases
  it.each([
    ["DTF", "caracas"],
    ["dtf", "caracas"],
    ["ccs", "caracas"],
    ["capital", "caracas"],
    ["Distrito Capital", "caracas"],
    ["Gran Caracas", "caracas"],
    ["carakas", "caracas"],
  ])("maps '%s' → '%s'", (input, expected) => {
    expect(normalizeCityCanonical(input)).toBe(expected)
  })

  it.each([
    ["mcbo", "maracaibo"],
    ["MCBO", "maracaibo"],
    ["Maracaybo", "maracaibo"],
    ["zulia", "maracaibo"],
    ["Zulia", "maracaibo"],
  ])("maps '%s' → '%s'", (input, expected) => {
    expect(normalizeCityCanonical(input)).toBe(expected)
  })

  it.each([
    ["vlc", "valencia"],
    ["carabobo", "valencia"],
  ])("maps '%s' → '%s'", (input, expected) => {
    expect(normalizeCityCanonical(input)).toBe(expected)
  })

  it.each([
    ["barqui", "barquisimeto"],
    ["barquicimeto", "barquisimeto"],
    ["lara", "barquisimeto"],
  ])("maps '%s' → '%s'", (input, expected) => {
    expect(normalizeCityCanonical(input)).toBe(expected)
  })

  it.each([
    ["Puerto Ordaz", "ciudad guayana"],
    ["pto ordaz", "ciudad guayana"],
    ["guayana", "ciudad guayana"],
    ["bolívar", "ciudad guayana"],   // accent stripped to "bolivar"
  ])("maps '%s' → '%s'", (input, expected) => {
    expect(normalizeCityCanonical(input)).toBe(expected)
  })

  it.each([
    ["Táchira", "san cristobal"],
    ["tachira", "san cristobal"],
  ])("maps '%s' → '%s'", (input, expected) => {
    expect(normalizeCityCanonical(input)).toBe(expected)
  })

  it("falls back to canonicalized form for unknown city 'Bogotá'", () => {
    expect(normalizeCityCanonical("Bogotá")).toBe("bogota")
  })
  it("falls back for 'Lima'", () => {
    expect(normalizeCityCanonical("Lima")).toBe("lima")
  })
})

// ─── isSavayaRulesV1 type guard ───────────────────────────────────────────────

describe("isSavayaRulesV1", () => {
  it("returns true for valid rule set", () => {
    expect(isSavayaRulesV1({ type: "savaya_v1", priorityCities: [] })).toBe(true)
  })
  it("returns false for wrong type string", () => {
    expect(isSavayaRulesV1({ type: "other", priorityCities: [] })).toBe(false)
  })
  it("returns false when priorityCities is not an array", () => {
    expect(isSavayaRulesV1({ type: "savaya_v1", priorityCities: "caracas" })).toBe(false)
  })
  it("returns false for null", () => {
    expect(isSavayaRulesV1(null)).toBe(false)
  })
  it("returns false for non-object", () => {
    expect(isSavayaRulesV1("string")).toBe(false)
  })
})

// ─── evaluateLead (savaya_v1) ─────────────────────────────────────────────────

describe("evaluateLead — savaya_v1", () => {

  // Unqualified (missing / unrecognized business answer)
  it("negocio null → unqualified", () => {
    const r = evaluateLead({ negocioRaw: null, cityRaw: "caracas" }, RULES)
    expect(r.class).toBe("unqualified")
    expect(r.inputs.negocioNormalized).toBeNull()
  })
  it("negocio empty → unqualified", () => {
    const r = evaluateLead({ negocioRaw: "", cityRaw: "caracas" }, RULES)
    expect(r.class).toBe("unqualified")
  })
  it("negocio unrecognized text → unqualified", () => {
    const r = evaluateLead({ negocioRaw: "tal vez", cityRaw: "caracas" }, RULES)
    expect(r.class).toBe("unqualified")
  })

  // Cold (no business)
  it("negocio 'no' → cold", () => {
    const r = evaluateLead({ negocioRaw: "no", cityRaw: "caracas" }, RULES)
    expect(r.class).toBe("cold")
    expect(r.inputs.negocioNormalized).toBe("no")
  })
  it("negocio 'No tengo' → cold", () => {
    const r = evaluateLead({ negocioRaw: "No tengo", cityRaw: "caracas" }, RULES)
    expect(r.class).toBe("cold")
  })
  it("negocio '0' → cold", () => {
    const r = evaluateLead({ negocioRaw: "0", cityRaw: "caracas" }, RULES)
    expect(r.class).toBe("cold")
  })

  // Hot (business + priority city)
  it("business + caracas → hot", () => {
    const r = evaluateLead({ negocioRaw: "si", cityRaw: "caracas" }, RULES)
    expect(r.class).toBe("hot")
    expect(r.reasons).toHaveLength(2)
  })
  it("business + 'Sí' + 'DTF' alias → hot", () => {
    const r = evaluateLead({ negocioRaw: "Sí", cityRaw: "DTF" }, RULES)
    expect(r.class).toBe("hot")
    expect(r.inputs.cityCanonical).toBe("caracas")
  })
  it("business + maracaibo → hot", () => {
    const r = evaluateLead({ negocioRaw: "claro", cityRaw: "mcbo" }, RULES)
    expect(r.class).toBe("hot")
  })
  it("business + valencia → hot", () => {
    const r = evaluateLead({ negocioRaw: "si tengo", cityRaw: "vlc" }, RULES)
    expect(r.class).toBe("hot")
  })
  it("business + 'Maracaybo' typo → hot (alias)", () => {
    const r = evaluateLead({ negocioRaw: "si", cityRaw: "Maracaybo" }, RULES)
    expect(r.class).toBe("hot")
    expect(r.inputs.cityCanonical).toBe("maracaibo")
  })

  // Warm (business + non-priority city)
  it("business + barquisimeto → warm", () => {
    const r = evaluateLead({ negocioRaw: "si", cityRaw: "barquisimeto" }, RULES)
    expect(r.class).toBe("warm")
  })
  it("business + unknown city 'Bogotá' → warm", () => {
    const r = evaluateLead({ negocioRaw: "si", cityRaw: "Bogotá" }, RULES)
    expect(r.class).toBe("warm")
    expect(r.inputs.cityCanonical).toBe("bogota")
  })

  // Warm (business + no city)
  it("business + null city → warm (benefit of the doubt)", () => {
    const r = evaluateLead({ negocioRaw: "si", cityRaw: null }, RULES)
    expect(r.class).toBe("warm")
    expect(r.inputs.cityCanonical).toBeNull()
    expect(r.reasons.some((rz) => rz.includes("Ciudad no especificada"))).toBe(true)
  })
  it("business + empty city → warm", () => {
    const r = evaluateLead({ negocioRaw: "si", cityRaw: "" }, RULES)
    expect(r.class).toBe("warm")
  })

  // Inputs are preserved verbatim
  it("preserves raw negocio value in inputs", () => {
    const r = evaluateLead({ negocioRaw: "Sí claro que tengo", cityRaw: "caracas" }, RULES)
    expect(r.inputs.negocioRaw).toBe("Sí claro que tengo")
  })
  it("preserves raw city value in inputs", () => {
    const r = evaluateLead({ negocioRaw: "si", cityRaw: "DTF" }, RULES)
    expect(r.inputs.cityRaw).toBe("DTF")
  })

  // Rule set without priority cities — all affirmative become warm
  it("empty priorityCities: business + caracas → warm", () => {
    const emptyRules: SavayaRulesV1 = { type: "savaya_v1", priorityCities: [] }
    const r = evaluateLead({ negocioRaw: "si", cityRaw: "caracas" }, emptyRules)
    expect(r.class).toBe("warm")
  })

  // Accent-variant yes answers
  it("'afirmativo' → hot with priority city", () => {
    const r = evaluateLead({ negocioRaw: "afirmativo", cityRaw: "maracaibo" }, RULES)
    expect(r.class).toBe("hot")
  })
  it("'TENGO' → hot with priority city", () => {
    const r = evaluateLead({ negocioRaw: "TENGO", cityRaw: "caracas" }, RULES)
    expect(r.class).toBe("hot")
  })
})
