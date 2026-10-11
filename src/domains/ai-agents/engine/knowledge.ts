import "server-only"

import { db } from "@/lib/db"
import { aiKnowledgeSources } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { retrieveDocumentChunks } from "@/domains/ai-agents/documents/retriever"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KnowledgeChunk {
  sourceId: string
  sourceName: string
  content: string
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

const MAX_KNOWLEDGE_CHARS = 8000
const DOCUMENT_BUDGET_CHARS = 3000 // reserved for FTS document chunks

// ─── Knowledge loader ─────────────────────────────────────────────────────────

/**
 * Load active knowledge sources for an org, filtered by IDs.
 *
 * Text sources: loaded directly from content column.
 * File sources: retrieved via FTS (tsvector search against conversation context).
 *
 * Total character budget: MAX_KNOWLEDGE_CHARS, with DOCUMENT_BUDGET_CHARS
 * reserved for document chunks so text sources don't crowd them out.
 */
export async function loadKnowledgeChunks(
  orgId: string,
  knowledgeSourceIds: string[],
  conversationContext?: string,
): Promise<KnowledgeChunk[]> {
  if (knowledgeSourceIds.length === 0) return []

  const rows = await db
    .select({
      id: aiKnowledgeSources.id,
      name: aiKnowledgeSources.name,
      content: aiKnowledgeSources.content,
      sourceType: aiKnowledgeSources.sourceType,
      status: aiKnowledgeSources.status,
      processingStatus: aiKnowledgeSources.processingStatus,
    })
    .from(aiKnowledgeSources)
    .where(
      and(
        eq(aiKnowledgeSources.orgId, orgId),
        inArray(aiKnowledgeSources.id, knowledgeSourceIds),
        eq(aiKnowledgeSources.status, "active")
      )
    )

  const textSources = rows.filter(
    (r) => r.sourceType === "text" && r.content != null && r.content.length > 0
  )
  const fileSources = rows.filter(
    (r) => r.sourceType === "file" && r.processingStatus === "available"
  )

  const chunks: KnowledgeChunk[] = []
  let totalChars = 0
  const textBudget = MAX_KNOWLEDGE_CHARS - DOCUMENT_BUDGET_CHARS

  // ── Text sources ──────────────────────────────────────────────────────────
  for (const source of textSources) {
    if (totalChars >= textBudget) break
    const content = source.content!
    if (totalChars + content.length <= textBudget) {
      chunks.push({ sourceId: source.id, sourceName: source.name, content })
      totalChars += content.length
    } else {
      const remaining = textBudget - totalChars
      if (remaining > 100) {
        chunks.push({
          sourceId: source.id,
          sourceName: source.name,
          content: content.slice(0, remaining),
        })
        totalChars += remaining
      }
      break
    }
  }

  // ── File sources via FTS ──────────────────────────────────────────────────
  if (fileSources.length > 0 && conversationContext?.trim()) {
    const fileSourceIds = fileSources.map((r) => r.id)
    const sourceNames = new Map(fileSources.map((r) => [r.id, r.name]))

    const docChunks = await retrieveDocumentChunks({
      orgId,
      sourceIds: fileSourceIds,
      sourceNames,
      query: conversationContext,
      budgetChars: DOCUMENT_BUDGET_CHARS,
    }).catch(() => []) // Non-fatal — FTS failure never breaks the text pilot

    for (const dc of docChunks) {
      chunks.push({
        sourceId: dc.sourceId,
        sourceName: dc.sourceName,
        content: dc.content,
      })
    }
  }

  return chunks
}

// ─── Format for prompt ────────────────────────────────────────────────────────

export function formatKnowledgeForPrompt(chunks: KnowledgeChunk[]): string {
  return chunks
    .map((chunk) => `## ${chunk.sourceName}\n${chunk.content}`)
    .join("\n\n---\n\n")
}
