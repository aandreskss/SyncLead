import { CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS, type ExtractedChunk } from "./types"

/**
 * Split a block of text into overlapping chunks with a shared location reference.
 * Used by both PDF (per-page) and CSV (per-row-range) extractors.
 */
export function splitIntoChunks(
  text: string,
  locationRef: Record<string, unknown>,
  startIndex = 0,
): ExtractedChunk[] {
  const chunks: ExtractedChunk[] = []
  let offset = 0
  let chunkIndex = startIndex

  while (offset < text.length) {
    const end = Math.min(offset + CHUNK_SIZE_CHARS, text.length)
    const content = text.slice(offset, end).trim()

    if (content.length > 0) {
      chunks.push({ chunkIndex, content, locationRef })
      chunkIndex++
    }

    if (end >= text.length) break
    offset = end - CHUNK_OVERLAP_CHARS
  }

  return chunks
}

/**
 * Merge consecutive small chunks so we don't create too many tiny fragments.
 * Keeps chunks roughly within CHUNK_SIZE_CHARS.
 */
export function mergeSmallChunks(chunks: ExtractedChunk[]): ExtractedChunk[] {
  if (chunks.length === 0) return []

  const merged: ExtractedChunk[] = []
  let buffer = chunks[0]

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i]
    if (buffer.content.length + next.content.length + 1 <= CHUNK_SIZE_CHARS) {
      buffer = {
        ...buffer,
        content: buffer.content + "\n" + next.content,
      }
    } else {
      merged.push(buffer)
      buffer = next
    }
  }
  merged.push(buffer)

  // Re-index from 0
  return merged.map((c, i) => ({ ...c, chunkIndex: i }))
}
