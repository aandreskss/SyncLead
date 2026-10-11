import "server-only"
import { searchChunks, type RetrievedChunk } from "./repository"

export interface DocumentKnowledgeChunk {
  sourceId: string
  sourceName: string
  content: string
  locationLabel: string
}

/**
 * Format a location reference as a human-readable label for the prompt.
 * Examples: "[Página 3]", "[Hoja: Precios, Filas 51-100]"
 */
function formatLocationLabel(locationRef: Record<string, unknown>): string {
  if (typeof locationRef.page === "number") {
    return `[Página ${locationRef.page}]`
  }
  if (locationRef.sheet) {
    const sheet = locationRef.sheet
    if (typeof locationRef.row_start === "number" && typeof locationRef.row_end === "number") {
      return `[Hoja: ${sheet}, Filas ${locationRef.row_start}-${locationRef.row_end}]`
    }
    return `[Hoja: ${sheet}]`
  }
  return ""
}

/**
 * Retrieve the most relevant document chunks for a given query.
 * Only returns chunks from active, authorized, available sources.
 * Revoked sources are filtered at the SQL level.
 *
 * @param orgId        Tenant scope — never skipped.
 * @param sourceIds    Source IDs from the episode's knowledge snapshot.
 * @param sourceNames  Map of sourceId → name for prompt formatting.
 * @param query        The search query (derived from conversation context).
 * @param budgetChars  Maximum characters to return in total.
 */
export async function retrieveDocumentChunks(params: {
  orgId: string
  sourceIds: string[]
  sourceNames: Map<string, string>
  query: string
  budgetChars: number
}): Promise<DocumentKnowledgeChunk[]> {
  if (params.sourceIds.length === 0 || !params.query.trim()) return []

  const rawChunks: RetrievedChunk[] = await searchChunks({
    orgId: params.orgId,
    authorizedSourceIds: params.sourceIds,
    query: params.query,
    limit: 10,
  })

  const result: DocumentKnowledgeChunk[] = []
  let totalChars = 0

  for (const chunk of rawChunks) {
    const locationLabel = formatLocationLabel(chunk.locationRef)
    const sourceName = params.sourceNames.get(chunk.sourceId) ?? "Documento"
    const content = locationLabel
      ? `${locationLabel}\n${chunk.content}`
      : chunk.content

    if (totalChars + content.length > params.budgetChars) break

    result.push({ sourceId: chunk.sourceId, sourceName, content, locationLabel })
    totalChars += content.length
  }

  return result
}
