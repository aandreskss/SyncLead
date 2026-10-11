// Phase 10A — Document knowledge types

export type DocumentProcessingStatus = "pending" | "processing" | "available" | "error"

// Allowed MIME types for file knowledge sources
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number]

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

// How many characters per chunk (target, not hard limit)
export const CHUNK_SIZE_CHARS = 800

// Overlap between consecutive chunks (characters)
export const CHUNK_OVERLAP_CHARS = 80

export interface ExtractedChunk {
  chunkIndex: number
  content: string
  locationRef: Record<string, unknown>
}

export interface ExtractionResult {
  chunks: ExtractedChunk[]
  pageCount?: number
  rowCount?: number
  mimeType: string
  scannedPdfDetected?: boolean
}
