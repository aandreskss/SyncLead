import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { withJobRun } from "@/lib/jobs/runner"
import { head } from "@vercel/blob"
import { extractDocument } from "@/domains/ai-agents/documents/processor"
import {
  claimNextDocumentJob,
  markDocumentJobDone,
  markDocumentJobFailed,
  getSourceForProcessing,
  markSourceProcessing,
  markSourceAvailable,
  markSourceError,
  createRevision,
  upsertChunks,
  deleteChunksForSource,
} from "@/domains/ai-agents/documents/repository"
import { createHash } from "crypto"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const run = await withJobRun("ai-document-processor", async (ctx) => {
    const job = await claimNextDocumentJob(ctx.correlationId)
    if (!job) return { itemsProcessed: 0 }

    const source = await getSourceForProcessing(job.sourceId, job.orgId)
    if (!source || source.sourceType !== "file" || !source.fileKey) {
      await markDocumentJobFailed(job.id, "source_not_found_or_invalid", 1)
      return { itemsProcessed: 0, itemsFailed: 1 }
    }

    await markSourceProcessing(job.sourceId, job.orgId)

    try {
      // ── Fetch file from Vercel Blob ─────────────────────────────────────────
      // We download via the Blob URL which is private — requires the token.
      // Using head() first to validate it exists without downloading.
      const blobMeta = await head(source.fileKey).catch(() => null)
      if (!blobMeta) {
        throw new Error("BLOB_NOT_FOUND: file no longer exists in storage")
      }

      const blobResp = await fetch(source.fileKey, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      })
      if (!blobResp.ok) {
        throw new Error(`BLOB_FETCH_FAILED: ${blobResp.status}`)
      }

      const buffer = Buffer.from(await blobResp.arrayBuffer())
      const mimeType = source.mimeType ?? blobMeta.contentType ?? "application/octet-stream"

      // ── Fingerprint check (dedup) ──────────────────────────────────────────
      const fingerprint = createHash("sha256").update(buffer).digest("hex")
      if (source.contentFingerprint && source.contentFingerprint === fingerprint) {
        // Content unchanged — skip reprocessing
        await markSourceAvailable(job.sourceId, job.orgId, {
          fingerprint,
          pageCount: source.pageCount ?? undefined,
          rowCount: source.rowCount ?? undefined,
        })
        await markDocumentJobDone(job.id)
        return { itemsProcessed: 1, skippedDuplicate: true }
      }

      // ── Extract + chunk ────────────────────────────────────────────────────
      const result = await extractDocument(buffer, mimeType)

      if (result.scannedPdfDetected) {
        await markSourceError(
          job.sourceId,
          job.orgId,
          "PDF escaneado detectado: el archivo contiene solo imágenes sin texto extraíble. " +
          "Por favor sube una versión con texto seleccionable.",
        )
        await markDocumentJobDone(job.id)
        return { itemsProcessed: 1, scannedPdf: true }
      }

      if (result.chunks.length === 0) {
        await markSourceError(job.sourceId, job.orgId, "El documento no contiene texto extraíble")
        await markDocumentJobDone(job.id)
        return { itemsProcessed: 1, emptyDocument: true }
      }

      // ── Store revision + chunks ────────────────────────────────────────────
      // Delete previous chunks (old revision's chunks) before inserting new ones.
      await deleteChunksForSource(job.sourceId)

      const extractedText = result.chunks.map((c) => c.content).join("\n")
      const revision = await createRevision({
        orgId: job.orgId,
        sourceId: job.sourceId,
        content: extractedText,
      })

      await upsertChunks({
        orgId: job.orgId,
        sourceId: job.sourceId,
        revisionId: revision.id,
        chunks: result.chunks,
      })

      await markSourceAvailable(job.sourceId, job.orgId, {
        fingerprint,
        pageCount: result.pageCount,
        rowCount: result.rowCount,
      })

      await markDocumentJobDone(job.id)
      return { itemsProcessed: 1, chunksStored: result.chunks.length }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      await markSourceError(job.sourceId, job.orgId, msg)
      await markDocumentJobFailed(job.id, msg)
      return { itemsProcessed: 0, itemsFailed: 1 }
    }
  })

  return NextResponse.json(run)
}

export { GET as POST }
