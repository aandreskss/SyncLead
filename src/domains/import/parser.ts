// ─── Import parser — pure functions, no I/O ───────────────────────────────────
// Handles CSV and XLSX files. All functions are deterministic.

import * as XLSX from "xlsx"
import { createHash } from "crypto"
import type { ParsedFile, ParsedRow, ColumnMapping, ParsedRowResult } from "./types"

// ─── File size limit ──────────────────────────────────────────────────────────

export const MAX_FILE_BYTES = 5 * 1024 * 1024  // 5 MB

// ─── File hash ────────────────────────────────────────────────────────────────

export function hashBuffer(buf: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buf)).digest("hex")
}

// ─── Dedupe and fingerprint keys ──────────────────────────────────────────────

export function buildDedupeKey(fileHash: string, sheetName: string, rowIndex: number): string {
  return createHash("sha256")
    .update(`${fileHash}:${sheetName}:${rowIndex}`)
    .digest("hex")
}

export function buildFingerprint(
  orgId: string,
  campaignId: string,
  name: string,
  phone: string,
  fecha: string,
): string {
  const normalized = [orgId, campaignId, name.toLowerCase().trim(), phone.replace(/\s/g, ""), fecha].join(":")
  return createHash("sha256").update(normalized).digest("hex")
}

// ─── File parsing ─────────────────────────────────────────────────────────────

export function parseFile(buffer: ArrayBuffer, filename: string): ParsedFile {
  const fileHash = hashBuffer(buffer)
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false })

  // Use first sheet
  const sheetName = workbook.SheetNames[0] ?? "Sheet1"
  const sheet = workbook.Sheets[sheetName]

  if (!sheet) {
    return { columns: [], rows: [], sheetName, fileHash, rowCount: 0 }
  }

  // Parse sheet to array of objects; header row becomes keys
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
    dateNF: "YYYY-MM-DD",
  })

  if (rawRows.length === 0) {
    return { columns: [], rows: [], sheetName, fileHash, rowCount: 0 }
  }

  // Columns from keys of the first row
  const columns = Object.keys(rawRows[0])
    .filter((k) => k !== "__rowNum__")
    .map((k) => String(k).trim())
    .filter(Boolean)

  // Strip __rowNum__ from each row
  const rows = rawRows.map((r) => {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (k !== "__rowNum__") cleaned[String(k).trim()] = v
    }
    return cleaned
  })

  return { columns, rows, sheetName, fileHash, rowCount: rows.length }
}

// ─── Field parsers ────────────────────────────────────────────────────────────

// XLSX serial date offset
const EXCEL_EPOCH_DIFF = 25569  // days between 1900-01-01 and 1970-01-01

export function parseDate(value: unknown): Date | null {
  if (!value) return null

  // Already a Date object (from cellDates:true)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return value
  }

  const str = String(value).trim()
  if (!str) return null

  // Excel serial number
  const num = Number(str)
  if (!isNaN(num) && num > 0 && num < 100000) {
    const ms = (num - EXCEL_EPOCH_DIFF) * 86400000
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d
  }

  // Try ISO 8601 first: YYYY-MM-DD, YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (isoMatch) {
    const d = new Date(Date.UTC(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3])))
    if (!isNaN(d.getTime())) return d
  }

  // Try DD/MM/YYYY or DD-MM-YYYY (Spanish/European format)
  const euMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (euMatch) {
    const day = parseInt(euMatch[1])
    const month = parseInt(euMatch[2])
    const year = parseInt(euMatch[3])
    // If day > 12, it must be day-first
    // If month > 12, it must be month-first (but unlikely in this format)
    if (day <= 31 && month <= 12) {
      const d = new Date(Date.UTC(year, month - 1, day))
      if (!isNaN(d.getTime())) return d
    }
  }

  // Last resort: let JS parse
  const d = new Date(str)
  if (!isNaN(d.getTime())) return d

  return null
}

export function parseBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim().toLowerCase()
  if (!str) return null

  const YES = new Set(["sí", "si", "yes", "y", "true", "1", "x", "✓", "✔", "verdadero"])
  const NO = new Set(["no", "n", "false", "0", "falso"])

  if (YES.has(str)) return true
  if (NO.has(str)) return false
  if (/^si\b/.test(str)) return true
  if (/^no\b/.test(str)) return false
  return null
}

export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number" && !isNaN(value)) return value

  const str = String(value).trim()
  if (!str) return null

  // Remove currency symbols and whitespace
  let cleaned = str.replace(/[$€£¥₡₿\s]/g, "")

  // European format: 1.234,56 → 1234.56
  // US format: 1,234.56 → 1234.56
  const hasCommaDecimal = /,\d{1,2}$/.test(cleaned) && cleaned.indexOf(".") < cleaned.indexOf(",")
  if (hasCommaDecimal) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".")
  } else {
    cleaned = cleaned.replace(/,/g, "")
  }

  const n = parseFloat(cleaned)
  if (isNaN(n)) return null
  if (n < 0) return null  // negative amounts rejected
  return n
}

export function parsePhone(value: unknown): string | null {
  if (!value) return null
  const str = String(value).trim()
  if (!str) return null

  // Keep only digits, +, spaces, dashes, parentheses
  let cleaned = str.replace(/[^\d+\s\-()]/g, "").trim()
  if (!cleaned) return null

  // Remove spaces/dashes for storage
  const digits = cleaned.replace(/[\s\-()]/g, "")

  // Venezuela: 04XX → +5804XX
  if (/^04\d{9}$/.test(digits)) {
    return `+58${digits.slice(1)}`
  }
  // Venezuela: 4XX (9 digits missing leading 0) — heuristic
  if (/^4\d{9}$/.test(digits)) {
    return `+58${digits}`
  }
  // If already has + prefix, keep normalized
  if (str.startsWith("+")) {
    return `+${digits.replace(/^\+/, "")}`
  }

  return cleaned
}

function parseText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str || null
}

// ─── Apply mapping to a raw row ───────────────────────────────────────────────

export function applyMapping(
  rawData: Record<string, unknown>,
  mapping: ColumnMapping,
): Omit<ParsedRow, "rowIndex" | "rawData" | "dedupeKey" | "fingerprint"> {
  const result: Omit<ParsedRow, "rowIndex" | "rawData" | "dedupeKey" | "fingerprint"> = {}

  for (const [sourceCol, targetField] of Object.entries(mapping)) {
    if (targetField === "__skip") continue
    const rawValue = rawData[sourceCol]
    if (rawValue === undefined || rawValue === null || rawValue === "") continue

    switch (targetField) {
      case "createdAt": {
        const d = parseDate(rawValue)
        if (d) result.createdAt = d
        break
      }
      case "name":
        result.name = parseText(rawValue) ?? undefined
        break
      case "email":
        result.email = parseText(rawValue) ?? undefined
        break
      case "city":
        result.city = parseText(rawValue) ?? undefined
        break
      case "phone":
        result.phone = parsePhone(rawValue) ?? undefined
        break
      case "utmSource":
        result.utmSource = parseText(rawValue) ?? undefined
        break
      case "utmMedium":
        result.utmMedium = parseText(rawValue) ?? undefined
        break
      case "utmCampaign":
        result.utmCampaign = parseText(rawValue) ?? undefined
        break
      case "utmContent":
        result.utmContent = parseText(rawValue) ?? undefined
        break
      case "platform":
        result.platform = parseText(rawValue) ?? undefined
        break
      case "device":
        result.device = parseText(rawValue) ?? undefined
        break
      case "fbc":
        result.fbc = parseText(rawValue) ?? undefined
        break
      case "fbp":
        result.fbp = parseText(rawValue) ?? undefined
        break
      case "ip":
        result.ip = parseText(rawValue) ?? undefined
        break
      case "userAgent":
        result.userAgent = parseText(rawValue) ?? undefined
        break
      case "negocio":
        result.negocioRaw = parseText(rawValue) ?? undefined
        break
      case "isSale": {
        const b = parseBoolean(rawValue)
        if (b !== null) result.isSale = b
        break
      }
      case "saleAmount": {
        const a = parseAmount(rawValue)
        if (a !== null) result.saleAmount = a
        break
      }
      case "saleDate": {
        const d = parseDate(rawValue)
        if (d) result.saleDate = d
        break
      }
      case "assignedToName":
        result.assignedToName = parseText(rawValue) ?? undefined
        break
      case "qualManual":
        result.qualManual = parseText(rawValue) ?? undefined
        break
    }
  }

  return result
}

// ─── Row-level validation ─────────────────────────────────────────────────────

export function isEmptyRow(rawData: Record<string, unknown>): boolean {
  return Object.values(rawData).every((v) => v === null || v === undefined || String(v).trim() === "")
}

export function validateParsedRow(
  rowIndex: number,
  rawData: Record<string, unknown>,
  parsed: Omit<ParsedRow, "rowIndex" | "rawData" | "dedupeKey" | "fingerprint">,
): ParsedRowResult {
  const warnings: string[] = []
  const errors: string[] = []

  // Skip empty rows
  if (isEmptyRow(rawData)) {
    return { rowIndex, status: "skipped", warnings: [], errors: [] }
  }

  // Required: name
  if (!parsed.name) {
    errors.push("El campo Nombre es requerido")
  }

  // Validate: if isSale=true, saleAmount should exist
  if (parsed.isSale === true && !parsed.saleAmount) {
    warnings.push("Venta marcada como sí pero sin monto — se importará sin conversión")
  }

  // Validate: if saleAmount exists, isSale should be true
  if (parsed.saleAmount && parsed.saleAmount > 0 && parsed.isSale !== true) {
    warnings.push("Monto de venta detectado pero Venta no marcada como sí")
  }

  // Warn if no date (will use current date as fallback)
  if (!parsed.createdAt) {
    warnings.push("Sin fecha — se usará la fecha actual")
  }

  const status: ParsedRowResult["status"] =
    errors.length > 0 ? "error"
    : warnings.length > 0 ? "warning"
    : "ok"

  const parsedRow: ParsedRow = {
    rowIndex,
    rawData,
    ...parsed,
  }

  return { rowIndex, status, parsedRow, warnings, errors }
}
