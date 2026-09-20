// ─── Import domain — types and Zod schemas ────────────────────────────────────

import { z } from "zod"

// ─── Column definitions ───────────────────────────────────────────────────────

export const SHEET_COLUMNS = [
  "Fecha", "Nombre", "Email", "Ciudad", "WhatsApp",
  "Origen", "UTM Source", "UTM Medium", "UTM Campaign", "Anuncio",
  "Plataforma", "Dispositivo", "Venta", "Monto USD", "Fecha Venta",
  "Estado META", "fbc", "fbp", "IP", "UA",
  "Asignación de Lead", "Asignado", "Negocio", "Cal. Auto", "Cal. Manual",
] as const

export type SheetColumn = typeof SHEET_COLUMNS[number]

// Internal target fields — what each source column can map to
export const TARGET_FIELD_LABELS: Record<string, string> = {
  createdAt:      "Fecha del lead",
  name:           "Nombre",
  email:          "Email",
  city:           "Ciudad",
  phone:          "Teléfono / WhatsApp",
  utmSource:      "UTM Source",
  utmMedium:      "UTM Medium",
  utmCampaign:    "UTM Campaign",
  utmContent:     "Anuncio (utm_content)",
  platform:       "Plataforma",
  device:         "Dispositivo",
  fbc:            "fbc (Meta)",
  fbp:            "fbp (Meta)",
  ip:             "Dirección IP",
  userAgent:      "User Agent",
  negocio:        "Negocio (sí/no)",
  isSale:         "Venta (sí/no)",
  saleAmount:     "Monto de venta",
  saleDate:       "Fecha de venta",
  assignedToName: "Nombre del vendedor asignado",
  qualManual:     "Calificación manual",
  __skip:         "(Ignorar columna)",
}

export type TargetField = keyof typeof TARGET_FIELD_LABELS

export const ColumnMappingSchema = z.record(z.string(), z.string())
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>

// ─── Parsed row ───────────────────────────────────────────────────────────────

export interface ParsedRow {
  rowIndex: number
  rawData: Record<string, unknown>

  // Lead fields
  createdAt?: Date
  name?: string
  email?: string
  phone?: string
  city?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  platform?: string
  device?: string
  fbc?: string
  fbp?: string
  ip?: string
  userAgent?: string
  negocioRaw?: string

  // Conversion fields (NEVER auto-sent to Meta CAPI)
  isSale?: boolean
  saleAmount?: number
  saleDate?: Date

  // Assignment
  assignedToName?: string

  // Manual qualification override
  qualManual?: string

  // Idempotency keys (computed by processor)
  dedupeKey?: string
  fingerprint?: string
}

// ─── Per-row parse result ─────────────────────────────────────────────────────

export interface ParsedRowResult {
  rowIndex: number
  status: "ok" | "skipped" | "warning" | "error"
  parsedRow?: ParsedRow
  warnings: string[]
  errors: string[]
}

// ─── File parse output ────────────────────────────────────────────────────────

export interface ParsedFile {
  columns: string[]
  rows: Record<string, unknown>[]
  sheetName: string
  fileHash: string
  rowCount: number
}

// ─── Dry-run result ───────────────────────────────────────────────────────────

export interface DryRunSummary {
  totalRows: number
  validRows: number
  skippedRows: number
  warningRows: number
  errorRows: number
  duplicateRows: number
}

export interface DryRunResult extends DryRunSummary {
  previewRows: ParsedRowResult[]  // first 20 rows with detail
  batchWarnings: string[]         // file-level warnings
}

// ─── Import results ───────────────────────────────────────────────────────────

export interface ImportRowResult {
  rowIndex: number
  status: "imported" | "duplicate" | "skipped" | "warning" | "failed"
  leadId?: string
  conversionId?: string
  name?: string
  warning?: string
  error?: string
}

// ─── Batch status (for polling) ───────────────────────────────────────────────

export interface BatchStatus {
  id: string
  status: string
  totalRows: number
  processedRows: number
  failedRows: number
  skippedRows: number
  warningRows: number
  error?: string | null
  completedAt?: Date | null
}

// ─── Upload action result ─────────────────────────────────────────────────────

export interface UploadResult {
  batchId: string
  columns: string[]
  rowCount: number
  suggestedMapping: ColumnMapping
}
