// ─── Import repository — all DB operations for the import domain ──────────────

import { db } from "@/lib/db"
import { importBatches, importRows } from "@/lib/db/schema"
import { eq, and, inArray, sql } from "drizzle-orm"
import type { ColumnMapping, BatchStatus } from "./types"

// ─── Batch operations ─────────────────────────────────────────────────────────

export async function createImportBatch(data: {
  orgId: string
  clientId?: string
  campaignId?: string
  originalFilename: string
  fileHash: string
  sheetName: string
  totalRows: number
  source?: string
}) {
  const [batch] = await db.insert(importBatches).values({
    orgId: data.orgId,
    clientId: data.clientId,
    campaignId: data.campaignId,
    source: data.source ?? "csv",
    originalFilename: data.originalFilename,
    fileHash: data.fileHash,
    sheetName: data.sheetName,
    totalRows: data.totalRows,
    status: "pending",
  }).returning()
  return batch
}

export async function getBatchById(batchId: string, orgId: string) {
  return db.query.importBatches.findFirst({
    where: and(eq(importBatches.id, batchId), eq(importBatches.orgId, orgId)),
  })
}

export async function getBatchStatus(batchId: string, orgId: string): Promise<BatchStatus | null> {
  const batch = await db.query.importBatches.findFirst({
    where: and(eq(importBatches.id, batchId), eq(importBatches.orgId, orgId)),
    columns: {
      id: true, status: true, totalRows: true, processedRows: true,
      failedRows: true, skippedRows: true, warningRows: true, error: true, completedAt: true,
    },
  })
  if (!batch) return null
  return batch
}

export async function updateBatchMapping(batchId: string, orgId: string, mapping: ColumnMapping) {
  await db.update(importBatches)
    .set({ columnMapping: mapping, updatedAt: new Date() })
    .where(and(eq(importBatches.id, batchId), eq(importBatches.orgId, orgId)))
}

export async function markBatchDryRun(batchId: string, orgId: string) {
  await db.update(importBatches)
    .set({ status: "dry_run", dryRunAt: new Date(), updatedAt: new Date() })
    .where(and(eq(importBatches.id, batchId), eq(importBatches.orgId, orgId)))
}

export async function markBatchProcessing(batchId: string, orgId: string) {
  await db.update(importBatches)
    .set({ status: "processing", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(importBatches.id, batchId), eq(importBatches.orgId, orgId)))
}

export async function markBatchCompleted(
  batchId: string,
  orgId: string,
  counts: { processedRows: number; failedRows: number; skippedRows: number; warningRows: number },
) {
  await db.update(importBatches)
    .set({
      status: "completed",
      processedRows: counts.processedRows,
      failedRows: counts.failedRows,
      skippedRows: counts.skippedRows,
      warningRows: counts.warningRows,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(importBatches.id, batchId), eq(importBatches.orgId, orgId)))
}

export async function markBatchFailed(batchId: string, orgId: string, error: string) {
  await db.update(importBatches)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(and(eq(importBatches.id, batchId), eq(importBatches.orgId, orgId)))
}

// ─── Row operations ───────────────────────────────────────────────────────────

export async function insertImportRows(
  rows: Array<{
    batchId: string
    orgId: string
    rowIndex: number
    rawData: Record<string, unknown>
    dedupeKey: string
    fingerprint?: string
  }>,
) {
  if (rows.length === 0) return 0

  // Insert all rows with ON CONFLICT DO NOTHING on dedupe_key.
  // Rows whose dedupeKey already exists in the DB are silently skipped.
  const result = await db.insert(importRows)
    .values(rows.map((r) => ({
      batchId: r.batchId,
      orgId: r.orgId,
      rowIndex: r.rowIndex,
      rawData: r.rawData,
      dedupeKey: r.dedupeKey,
      fingerprint: r.fingerprint,
      status: "pending" as const,
    })))
    .onConflictDoNothing({ target: importRows.dedupeKey })
    .returning({ id: importRows.id })

  return result.length  // number of actually inserted rows
}

export async function getRowsByBatch(batchId: string, orgId: string) {
  return db.query.importRows.findMany({
    where: and(eq(importRows.batchId, batchId), eq(importRows.orgId, orgId)),
    orderBy: (r, { asc }) => [asc(r.rowIndex)],
  })
}

export async function getPendingRowsByBatch(batchId: string, orgId: string) {
  return db.query.importRows.findMany({
    where: and(
      eq(importRows.batchId, batchId),
      eq(importRows.orgId, orgId),
      inArray(importRows.status, ["pending"]),
    ),
    orderBy: (r, { asc }) => [asc(r.rowIndex)],
  })
}

export async function updateImportRow(
  rowId: string,
  data: {
    status: "imported" | "duplicate" | "skipped" | "warning" | "failed"
    leadId?: string
    conversionId?: string
    warning?: string
    error?: string
  },
) {
  await db.update(importRows)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(importRows.id, rowId))
}

export async function bulkUpdateImportRows(
  updates: Array<{
    id: string
    status: "imported" | "duplicate" | "skipped" | "warning" | "failed"
    leadId?: string
    conversionId?: string
    warning?: string
    error?: string
  }>,
) {
  // Process sequentially since neon-http has no interactive transactions
  for (const u of updates) {
    await db.update(importRows)
      .set({ status: u.status, leadId: u.leadId, conversionId: u.conversionId, warning: u.warning, error: u.error, updatedAt: new Date() })
      .where(eq(importRows.id, u.id))
  }
}

// Check if any existing import row (across all batches in the org) has a matching fingerprint
// and was successfully imported. Used for cross-file duplicate detection.
export async function findImportedRowByFingerprint(orgId: string, fingerprint: string) {
  return db.query.importRows.findFirst({
    where: and(
      eq(importRows.orgId, orgId),
      eq(importRows.fingerprint, fingerprint),
      inArray(importRows.status, ["imported", "warning"]),
    ),
    columns: { id: true, leadId: true, batchId: true },
  })
}

// Count rows in a batch grouped by status, for polling
export async function getRowStatusCounts(batchId: string) {
  const rows = await db
    .select({
      status: importRows.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(importRows)
    .where(eq(importRows.batchId, batchId))
    .groupBy(importRows.status)

  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.status] = r.count
  return counts
}
