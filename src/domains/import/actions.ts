"use server"

import { requireRole } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getCampaignsWithClientAndCounts } from "@/domains/campaigns/repository"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { z } from "zod"
import { ColumnMappingSchema } from "./types"
import type { UploadResult, DryRunResult, BatchStatus, ImportRowResult } from "./types"
import { parseFile, buildDedupeKey, buildFingerprint, MAX_FILE_BYTES } from "./parser"
import { autoDetectMapping } from "./mapper"
import {
  createImportBatch, insertImportRows, updateBatchMapping,
  getBatchStatus, getBatchById,
} from "./repository"
import { runDryRun, runImport, buildImportReport } from "./processor"

// Minimum role required for all import operations
const IMPORT_ROLES = ["owner", "admin", "manager"] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireImportAccess() {
  try {
    return await requireRole([...IMPORT_ROLES])
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) throw e
    throw e
  }
}

// ─── Step 1 — Upload file and create batch ────────────────────────────────────

export async function uploadImportFileAction(formData: FormData): Promise<
  { error: string } | UploadResult
> {
  const ctx = await requireImportAccess()

  const file = formData.get("file") as File | null
  const campaignId = formData.get("campaignId") as string | null
  const clientId = formData.get("clientId") as string | null

  if (!file) return { error: "Archivo requerido" }
  if (!campaignId) return { error: "Campaña requerida" }

  // Validate campaign belongs to org
  const campaigns = await getCampaignsWithClientAndCounts(ctx.orgId)
  const campaign = campaigns.find((c) => c.id === campaignId)
  if (!campaign) return { error: "Campaña no encontrada" }

  // File size check
  if (file.size > MAX_FILE_BYTES) {
    return { error: `El archivo supera el límite de ${MAX_FILE_BYTES / 1024 / 1024} MB` }
  }

  // Validate extension
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
    return { error: "Solo se aceptan archivos CSV, XLSX o XLS" }
  }

  let parsed
  try {
    const buffer = await file.arrayBuffer()
    parsed = parseFile(buffer, file.name)
  } catch {
    return { error: "No se pudo leer el archivo. Verifica que sea un CSV o XLSX válido." }
  }

  if (parsed.rowCount === 0) {
    return { error: "El archivo no contiene filas de datos" }
  }
  if (parsed.columns.length === 0) {
    return { error: "No se detectaron columnas en el archivo" }
  }

  // Create the batch record
  let batch: Awaited<ReturnType<typeof createImportBatch>>
  try {
    batch = await createImportBatch({
      orgId: ctx.orgId,
      clientId: clientId ?? undefined,
      campaignId,
      originalFilename: file.name,
      fileHash: parsed.fileHash,
      sheetName: parsed.sheetName,
      totalRows: parsed.rowCount,
      source: ext,
    })
  } catch (e) {
    console.error("[uploadImportFileAction:createBatch]", e instanceof Error ? e.message : String(e))
    return { error: "Error al crear el lote de importación. Intenta de nuevo." }
  }

  // Insert import_rows — ON CONFLICT DO NOTHING on dedupe_key means re-uploading
  // the same file returns 0 new rows (idempotent upload).
  const rowsToInsert = parsed.rows.map((rawData, idx) => {
    const dedupeKey = buildDedupeKey(parsed.fileHash, parsed.sheetName, idx)
    const fingerprint = buildFingerprintFromRaw(rawData, ctx.orgId, campaignId, parsed.columns)
    return {
      batchId: batch.id,
      orgId: ctx.orgId,
      rowIndex: idx,
      rawData,
      dedupeKey,
      fingerprint,
    }
  })

  let insertedCount: number
  try {
    insertedCount = await insertImportRows(rowsToInsert)
  } catch (e) {
    console.error("[uploadImportFileAction:insertRows]", e instanceof Error ? e.message : String(e))
    return { error: "Error al guardar las filas del archivo. Intenta de nuevo." }
  }

  if (insertedCount === 0 && parsed.rowCount > 0) {
    return { error: "Este archivo ya fue importado anteriormente (todas las filas son duplicadas)." }
  }

  const suggestedMapping = autoDetectMapping(parsed.columns)

  return {
    batchId: batch.id,
    columns: parsed.columns,
    rowCount: parsed.rowCount,
    suggestedMapping,
  }
}

// ─── Step 2 — Save column mapping ────────────────────────────────────────────

export async function saveColumnMappingAction(
  batchId: string,
  mapping: unknown,
): Promise<{ error: string } | { ok: true }> {
  const ctx = await requireImportAccess()

  const result = ColumnMappingSchema.safeParse(mapping)
  if (!result.success) return { error: "Mapeo inválido" }

  const batch = await getBatchById(batchId, ctx.orgId)
  if (!batch) return { error: "Batch no encontrado" }

  await updateBatchMapping(batchId, ctx.orgId, result.data)
  return { ok: true }
}

// ─── Step 3 — Run dry-run ─────────────────────────────────────────────────────

export async function runDryRunAction(
  batchId: string,
): Promise<{ error: string } | DryRunResult> {
  const ctx = await requireImportAccess()

  try {
    return await runDryRun(batchId, ctx.orgId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al ejecutar el dry-run" }
  }
}

// ─── Step 4 — Confirm and run import ─────────────────────────────────────────

export async function confirmImportAction(
  batchId: string,
): Promise<{ error: string } | { results: ImportRowResult[] }> {
  const ctx = await requireImportAccess()

  try {
    const results = await runImport(batchId, ctx.orgId)
    return { results }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al importar" }
  }
}

// ─── Polling — get batch status ───────────────────────────────────────────────

export async function getBatchStatusAction(
  batchId: string,
): Promise<{ error: string } | BatchStatus> {
  const ctx = await requireImportAccess()
  const status = await getBatchStatus(batchId, ctx.orgId)
  if (!status) return { error: "Batch no encontrado" }
  return status
}

// ─── Report download ──────────────────────────────────────────────────────────

export async function downloadReportAction(
  batchId: string,
): Promise<{ error: string } | { csv: string; filename: string }> {
  const ctx = await requireImportAccess()

  const batch = await getBatchById(batchId, ctx.orgId)
  if (!batch) return { error: "Batch no encontrado" }

  const csv = await buildImportReport(batchId, ctx.orgId)
  const filename = `import_report_${batch.originalFilename ?? batchId}.csv`
  return { csv, filename }
}

// ─── Get available campaigns for org ─────────────────────────────────────────

export async function getImportCampaignsAction(): Promise<
  { error: string } | Array<{ id: string; name: string; clientName: string }>
> {
  const ctx = await requireImportAccess()
  const campaigns = await getCampaignsWithClientAndCounts(ctx.orgId)
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    clientName: c.client?.name ?? "(sin cliente)",
  }))
}

export async function getImportClientsAction(): Promise<
  { error: string } | Array<{ id: string; name: string }>
> {
  const ctx = await requireImportAccess()
  const clients = await getClientsByOrgId(ctx.orgId)
  return clients.map((c) => ({ id: c.id, name: c.name }))
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildFingerprintFromRaw(
  rawData: Record<string, unknown>,
  orgId: string,
  campaignId: string,
  columns: string[],
): string | undefined {
  // Try to find name, phone, and date columns heuristically
  const nameVal = findColumnValue(rawData, columns, ["nombre", "name", "lead name"])
  const phoneVal = findColumnValue(rawData, columns, ["whatsapp", "teléfono", "telefono", "celular", "phone"])
  const dateVal = findColumnValue(rawData, columns, ["fecha", "date", "created"])

  if (!nameVal) return undefined

  return buildFingerprint(
    orgId,
    campaignId,
    String(nameVal),
    String(phoneVal ?? ""),
    String(dateVal ?? ""),
  )
}

function findColumnValue(
  rawData: Record<string, unknown>,
  columns: string[],
  keywords: string[],
): unknown {
  for (const col of columns) {
    const lower = col.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    if (keywords.some((kw) => lower.includes(kw))) {
      return rawData[col]
    }
  }
  return undefined
}
