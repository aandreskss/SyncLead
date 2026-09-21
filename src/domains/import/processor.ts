// ─── Import processor — dry-run and actual import logic ───────────────────────
// SECURITY: Historical imports NEVER create meta_events or trigger Meta CAPI.

import { db } from "@/lib/db"
import { leads, conversions, salesReps, leadAssignments, leadActivities } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { normalizePhone, normalizeCity } from "@/domains/leads/normalize"
import { normalizeYesNo, normalizeCityCanonical } from "@/domains/qualification/normalize"
import { autoQualifyLeadInternal } from "@/domains/qualification/actions"
import type { ImportRow } from "@/lib/db/schema"
import type { DryRunResult, ParsedRowResult, ImportRowResult, ColumnMapping } from "./types"
import {
  applyMapping, validateParsedRow, isEmptyRow, buildFingerprint,
} from "./parser"
import {
  getBatchById, getRowsByBatch, getPendingRowsByBatch,
  markBatchDryRun, markBatchProcessing, markBatchCompleted,
  updateImportRow, findImportedRowByFingerprint,
} from "./repository"

const DRY_RUN_PREVIEW_LIMIT = 20
const IMPORT_BATCH_SIZE = 50

// ─── Dry-run ──────────────────────────────────────────────────────────────────

export async function runDryRun(batchId: string, orgId: string): Promise<DryRunResult> {
  const batch = await getBatchById(batchId, orgId)
  if (!batch) throw new Error("Batch no encontrado")
  if (!batch.columnMapping) throw new Error("Mapeo de columnas no configurado")

  const rows = await getRowsByBatch(batchId, orgId)
  const mapping = batch.columnMapping as ColumnMapping

  let validRows = 0, skippedRows = 0, warningRows = 0, errorRows = 0, duplicateRows = 0
  const previewRows: ParsedRowResult[] = []
  const batchWarnings: string[] = []
  const seenFingerprints = new Set<string>()

  for (const row of rows) {
    const rawData = row.rawData as Record<string, unknown>

    if (isEmptyRow(rawData)) {
      skippedRows++
      if (previewRows.length < DRY_RUN_PREVIEW_LIMIT) {
        previewRows.push({ rowIndex: row.rowIndex, status: "skipped", warnings: [], errors: [] })
      }
      continue
    }

    const parsed = applyMapping(rawData, mapping)
    const result = validateParsedRow(row.rowIndex, rawData, parsed)

    // In-file duplicate detection via fingerprint
    if (result.status !== "error" && result.parsedRow?.name) {
      const fp = buildFingerprint(
        orgId,
        batch.campaignId ?? "",
        result.parsedRow.name ?? "",
        result.parsedRow.phone ?? "",
        result.parsedRow.createdAt?.toISOString().slice(0, 10) ?? "",
      )
      if (seenFingerprints.has(fp)) {
        duplicateRows++
        if (previewRows.length < DRY_RUN_PREVIEW_LIMIT) {
          previewRows.push({
            rowIndex: row.rowIndex, status: "warning",
            parsedRow: result.parsedRow,
            warnings: ["Posible duplicado dentro del mismo archivo"], errors: [],
          })
        }
        continue
      }
      seenFingerprints.add(fp)

      // Cross-batch duplicate detection
      if (row.fingerprint) {
        const existing = await findImportedRowByFingerprint(orgId, row.fingerprint)
        if (existing) {
          duplicateRows++
          if (previewRows.length < DRY_RUN_PREVIEW_LIMIT) {
            previewRows.push({
              rowIndex: row.rowIndex, status: "warning",
              parsedRow: result.parsedRow,
              warnings: ["Ya importado en un batch anterior"], errors: [],
            })
          }
          continue
        }
      }
    }

    if (result.status === "error") errorRows++
    else if (result.status === "warning") warningRows++
    else if (result.status === "skipped") skippedRows++
    else validRows++

    if (previewRows.length < DRY_RUN_PREVIEW_LIMIT) previewRows.push(result)
  }

  if (rows.length > 0 && validRows === 0 && errorRows > 0) {
    batchWarnings.push("Ninguna fila válida detectada. Revisa el mapeo de columnas.")
  }

  await markBatchDryRun(batchId, orgId)

  return {
    totalRows: rows.length,
    validRows,
    skippedRows,
    warningRows,
    errorRows,
    duplicateRows,
    previewRows,
    batchWarnings,
  }
}

// ─── Actual import ────────────────────────────────────────────────────────────

export async function runImport(batchId: string, orgId: string): Promise<ImportRowResult[]> {
  const batch = await getBatchById(batchId, orgId)
  if (!batch) throw new Error("Batch no encontrado")
  if (!batch.columnMapping) throw new Error("Mapeo de columnas no configurado")
  if (!batch.campaignId) throw new Error("Campaña no seleccionada")

  const mapping = batch.columnMapping as ColumnMapping
  const campaignId = batch.campaignId

  await markBatchProcessing(batchId, orgId)

  const pendingRows = await getPendingRowsByBatch(batchId, orgId)
  const results: ImportRowResult[] = []
  let imported = 0, duplicates = 0, skipped = 0, warnings = 0, failed = 0

  for (let i = 0; i < pendingRows.length; i += IMPORT_BATCH_SIZE) {
    const chunk = pendingRows.slice(i, i + IMPORT_BATCH_SIZE)
    for (const row of chunk) {
      const result = await processImportRow(row, orgId, campaignId, mapping)
      results.push(result)

      await updateImportRow(row.id, {
        status: result.status,
        leadId: result.leadId,
        conversionId: result.conversionId,
        warning: result.warning,
        error: result.error,
      })

      if (result.status === "imported") imported++
      else if (result.status === "warning") { warnings++; imported++ }
      else if (result.status === "duplicate") duplicates++
      else if (result.status === "skipped") skipped++
      else failed++
    }
  }

  await markBatchCompleted(batchId, orgId, {
    processedRows: imported,
    failedRows: failed,
    skippedRows: skipped + duplicates,
    warningRows: warnings,
  })

  return results
}

// ─── Per-row import logic ─────────────────────────────────────────────────────

async function processImportRow(
  row: ImportRow,
  orgId: string,
  campaignId: string,
  mapping: ColumnMapping,
): Promise<ImportRowResult> {
  const rawData = row.rawData as Record<string, unknown>

  if (isEmptyRow(rawData)) {
    return { rowIndex: row.rowIndex, status: "skipped" }
  }

  const parsed = applyMapping(rawData, mapping)
  const validation = validateParsedRow(row.rowIndex, rawData, parsed)

  if (validation.status === "error") {
    return { rowIndex: row.rowIndex, status: "failed", error: validation.errors.join("; ") }
  }

  const p = validation.parsedRow!

  // Cross-file duplicate check via fingerprint
  if (row.fingerprint) {
    const existing = await findImportedRowByFingerprint(orgId, row.fingerprint)
    if (existing) {
      return { rowIndex: row.rowIndex, status: "duplicate", leadId: existing.leadId ?? undefined, name: p.name }
    }
  }

  try {
    const createdAt = p.createdAt ?? new Date()

    // ── Normalize fields using the same logic as ingest ────────────────────────
    const phone = p.phone ? normalizePhone(p.phone) : null
    const city = normalizeCity(p.city ?? "")
    const negocioRaw = p.negocioRaw ?? null
    const negocioNormalized = normalizeYesNo(negocioRaw)
    const negocio = negocioNormalized === "si"
    const cityCanonical = normalizeCityCanonical(p.city ?? null)

    // ── Insert lead ────────────────────────────────────────────────────────────
    const [lead] = await db.insert(leads).values({
      orgId,
      campaignId,
      name: p.name ?? "(sin nombre)",
      email: p.email ?? null,
      phone,
      city: city || null,
      negocio,
      negocioRaw,
      negocioNormalized,
      cityCanonical,
      leadSource: "imported",
      temperature: "cold",
      utmSource: p.utmSource ?? null,
      utmMedium: p.utmMedium ?? null,
      utmCampaign: p.utmCampaign ?? null,
      utmContent: p.utmContent ?? null,
      platform: p.platform ?? null,
      device: p.device ?? null,
      fbc: p.fbc ?? null,
      fbp: p.fbp ?? null,
      ip: p.ip ?? null,
      userAgent: p.userAgent ?? null,
      externalEventId: row.dedupeKey,
      createdAt,
      updatedAt: createdAt,
    }).returning()

    // ── Conversion — NEVER creates meta_events or calls Meta CAPI ─────────────
    let conversionId: string | undefined
    const shouldRecordSale = p.isSale === true && p.saleAmount && p.saleAmount > 0

    if (shouldRecordSale) {
      const [conv] = await db.insert(conversions).values({
        orgId,
        campaignId,
        leadId: lead.id,
        amount: String(p.saleAmount),
        currency: "USD",
        status: "confirmed",
        convertedAt: p.saleDate ?? createdAt,
      }).returning({ id: conversions.id })
      conversionId = conv.id

      await db.update(leads).set({
        converted: true,
        conversionAmount: String(p.saleAmount),
        conversionCurrency: "USD",
        conversionDate: p.saleDate ?? createdAt,
        temperature: "hot",
      }).where(and(eq(leads.id, lead.id), eq(leads.orgId, orgId)))
    }

    // ── Assignment (best-effort — no error if rep not found) ───────────────────
    if (p.assignedToName) {
      const rep = await db.query.salesReps.findFirst({
        where: and(
          eq(salesReps.orgId, orgId),
          eq(salesReps.displayName, p.assignedToName),
          eq(salesReps.active, true),
        ),
      })
      if (rep) {
        await db.insert(leadAssignments).values({
          orgId,
          leadId: lead.id,
          salesRepId: rep.id,
          reason: "imported",
          note: "Asignado desde importación de hoja de cálculo",
        }).catch(() => undefined)
      }
    }

    // ── Activity log ───────────────────────────────────────────────────────────
    await db.insert(leadActivities).values({
      orgId,
      leadId: lead.id,
      activityType: "imported",
      metadata: { source: "sheet_import", batchId: row.batchId },
    }).catch(() => undefined)

    // ── Auto-qualify (fire-and-forget) ─────────────────────────────────────────
    autoQualifyLeadInternal(lead.id, orgId, campaignId).catch(() => undefined)

    const rowWarning = validation.warnings.length > 0 ? validation.warnings.join("; ") : undefined

    return {
      rowIndex: row.rowIndex,
      status: rowWarning ? "warning" : "imported",
      leadId: lead.id,
      conversionId,
      name: lead.name,
      warning: rowWarning,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { rowIndex: row.rowIndex, status: "failed", name: p.name, error: msg.slice(0, 300) }
  }
}

// ─── Download report ──────────────────────────────────────────────────────────

export async function buildImportReport(batchId: string, orgId: string): Promise<string> {
  const rows = await getRowsByBatch(batchId, orgId)
  const lines = [["Fila", "Estado", "Lead ID", "Conversión ID", "Advertencia", "Error"].join(",")]

  for (const row of rows) {
    const cells = [
      String(row.rowIndex + 1),
      row.status,
      row.leadId ?? "",
      row.conversionId ?? "",
      sanitizeCsvCell(row.warning ?? ""),
      sanitizeCsvCell(row.error ?? ""),
    ]
    lines.push(cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
  }

  return lines.join("\r\n")
}

function sanitizeCsvCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}
