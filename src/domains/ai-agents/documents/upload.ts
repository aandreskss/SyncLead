"use server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { aiKnowledgeSources } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { put } from "@vercel/blob"
import { createHash } from "crypto"
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  type AllowedMimeType,
} from "./types"
import { enqueueDocument } from "./repository"

export interface UploadDocumentResult {
  ok: boolean
  sourceId?: string
  error?: string
  skippedDuplicate?: boolean
}

/**
 * Server Action: validate, store, and enqueue a file for async processing.
 * Returns immediately — processing happens in the ai-document-processor cron.
 */
export async function uploadDocumentSource(
  orgId: string,
  formData: FormData,
): Promise<UploadDocumentResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" }

  const file = formData.get("file") as File | null
  const name = (formData.get("name") as string | null)?.trim()

  if (!file) return { ok: false, error: "No file provided" }
  if (!name) return { ok: false, error: "Name is required" }

  // ── Size check ─────────────────────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `El archivo supera el límite de ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
    }
  }

  // ── MIME check ─────────────────────────────────────────────────────────────
  const mimeType = file.type as AllowedMimeType
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return {
      ok: false,
      error: `Tipo de archivo no permitido: ${mimeType}. Formatos admitidos: PDF, CSV, XLSX`,
    }
  }

  // ── Content fingerprint (dedup) ─────────────────────────────────────────────
  const buffer = Buffer.from(await file.arrayBuffer())
  const fingerprint = createHash("sha256").update(buffer).digest("hex")

  // Check if this exact file content is already stored for this org
  const existingRows = await db
    .select({ id: aiKnowledgeSources.id })
    .from(aiKnowledgeSources)
    .where(
      and(
        eq(aiKnowledgeSources.orgId, orgId),
        eq(aiKnowledgeSources.contentFingerprint, fingerprint),
        eq(aiKnowledgeSources.status, "active"),
      )
    )
    .limit(1)

  if (existingRows[0]) {
    return { ok: true, sourceId: existingRows[0].id, skippedDuplicate: true }
  }

  // ── Upload to Vercel Blob (private) ────────────────────────────────────────
  const blobPath = `knowledge/${orgId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const blob = await put(blobPath, buffer, { access: "private", contentType: mimeType })

  // ── Create knowledge source record ─────────────────────────────────────────
  const [source] = await db
    .insert(aiKnowledgeSources)
    .values({
      orgId,
      name,
      sourceType: "file",
      fileKey: blob.url,
      contentFingerprint: fingerprint,
      fileSizeBytes: file.size,
      mimeType,
      originalFilename: file.name,
      processingStatus: "pending",
      status: "active",
      createdBy: session.user.id,
    })
    .returning({ id: aiKnowledgeSources.id })

  // ── Enqueue for async processing ────────────────────────────────────────────
  await enqueueDocument(orgId, source.id)

  return { ok: true, sourceId: source.id }
}
