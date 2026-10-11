import "server-only"
import { db } from "@/lib/db"
import {
  aiAgentDeployments,
  aiAgentVersions,
  aiCampaignRules,
  aiAgentVersionKnowledge,
  aiKnowledgeSources,
  aiKnowledgeRevisions,
  leads,
} from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { createEpisode, getActiveEpisode } from "./repository"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResolvedEpisode = {
  episodeId: string
  agentVersionId: string
  campaignId: string | null
  isNew: boolean
}

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Resolves — or creates — the episode for one queue item.
 *
 * Resolution order:
 *  1. Active episode for this conversation → continue it. Config is frozen at
 *     episode start; a new agent publish does not affect the in-flight episode.
 *  2. No active episode → look up the deployment's published agent version.
 *  3. Evaluate active campaign rules (descending priority):
 *     a. Specific match: lead's campaign matches a rule → use that campaignId.
 *     b. Catch-all (campaignId IS NULL): no specific match → use catch-all.
 *     c. No match and no catch-all → no AI for this conversation.
 *     d. No rules configured at all → proceed without campaign filter (open).
 *  4. Create a new episode with a frozen knowledge snapshot.
 *
 * Returns null when no agent can handle the conversation; the caller should
 * set controlMode to 'waiting_human'.
 *
 * Rules are evaluated deterministically by the priority column (higher wins).
 * Rules that reference campaigns from other tenants cannot exist — campaignId
 * has a FK to campaigns which has org_id; the active filter and the orgId scope
 * on aiCampaignRules both guard against cross-tenant leakage.
 * Initial campaign attribution on a conversation is never overwritten here;
 * it comes from the lead's campaignId, which was set at lead-creation time.
 */
export async function resolveEpisodeForConversation(params: {
  orgId: string
  conversationId: string
  deploymentId: string | null
  leadId: string | null
  triggerMessageId: string
}): Promise<ResolvedEpisode | null> {
  // ── 1. Existing active episode ─────────────────────────────────────────────
  const active = await getActiveEpisode(params.conversationId, params.orgId)
  if (active) {
    return {
      episodeId: active.id,
      agentVersionId: active.agentVersionId,
      campaignId: active.campaignId,
      isNew: false,
    }
  }

  // ── 2. No deployment → no AI ───────────────────────────────────────────────
  if (!params.deploymentId) return null

  // ── 3. Find the deployment's active published agent version ────────────────
  const depRows = await db
    .select({ agentId: aiAgentDeployments.agentId })
    .from(aiAgentDeployments)
    .where(
      and(
        eq(aiAgentDeployments.id, params.deploymentId),
        eq(aiAgentDeployments.orgId, params.orgId),
        eq(aiAgentDeployments.active, true),
      )
    )
    .limit(1)

  const deployment = depRows[0]
  if (!deployment) return null

  const versionRows = await db
    .select({ id: aiAgentVersions.id })
    .from(aiAgentVersions)
    .where(
      and(
        eq(aiAgentVersions.agentId, deployment.agentId),
        eq(aiAgentVersions.orgId, params.orgId),
        eq(aiAgentVersions.status, "published"),
      )
    )
    .limit(1)

  const publishedVersion = versionRows[0]
  if (!publishedVersion) return null

  // ── 4. Resolve campaign context from the lead's attribution ────────────────
  let leadCampaignId: string | null = null
  if (params.leadId) {
    const leadRows = await db
      .select({ campaignId: leads.campaignId })
      .from(leads)
      .where(eq(leads.id, params.leadId))
      .limit(1)
    leadCampaignId = leadRows[0]?.campaignId ?? null
  }

  // ── 5. Evaluate campaign rules (org-scoped, priority-desc) ────────────────
  const rules = await db
    .select({
      campaignId: aiCampaignRules.campaignId,
    })
    .from(aiCampaignRules)
    .where(
      and(
        eq(aiCampaignRules.deploymentId, params.deploymentId),
        eq(aiCampaignRules.orgId, params.orgId),
        eq(aiCampaignRules.active, true),
      )
    )
    .orderBy(desc(aiCampaignRules.priority))

  let resolvedCampaignId: string | null = null

  if (rules.length > 0) {
    // Evaluate specific rules first (campaignId IS NOT NULL, higher priority).
    const specificMatch = rules.find(
      (r) => r.campaignId !== null && r.campaignId === leadCampaignId
    )
    if (specificMatch) {
      resolvedCampaignId = specificMatch.campaignId
    } else {
      // Fall through to the catch-all (campaignId IS NULL).
      const catchAll = rules.find((r) => r.campaignId === null)
      if (!catchAll) {
        // No specific match and no catch-all → this conversation is not assigned to AI.
        return null
      }
      // Catch-all matched; episode carries no campaign context.
      resolvedCampaignId = null
    }
  }
  // If rules.length === 0, no filtering applies — proceed without campaign context.

  // ── 6. Freeze knowledge snapshot and create episode ────────────────────────
  const knowledgeAssocs = await db
    .select({
      sourceId: aiAgentVersionKnowledge.knowledgeSourceId,
      revisionId: aiAgentVersionKnowledge.knowledgeRevisionId,
      revisionNumber: aiKnowledgeRevisions.revisionNumber,
      sourceStatus: aiKnowledgeSources.status,
    })
    .from(aiAgentVersionKnowledge)
    .innerJoin(
      aiKnowledgeSources,
      eq(aiAgentVersionKnowledge.knowledgeSourceId, aiKnowledgeSources.id),
    )
    .innerJoin(
      aiKnowledgeRevisions,
      eq(aiAgentVersionKnowledge.knowledgeRevisionId, aiKnowledgeRevisions.id),
    )
    .where(
      and(
        eq(aiAgentVersionKnowledge.agentVersionId, publishedVersion.id),
        eq(aiAgentVersionKnowledge.orgId, params.orgId),
      )
    )

  const knowledgeSnapshot = knowledgeAssocs
    .filter((a) => a.sourceStatus !== "revoked")
    .map((a) => ({
      sourceId: a.sourceId,
      revisionId: a.revisionId,
      revisionNumber: a.revisionNumber,
    }))

  const episode = await createEpisode(params.orgId, {
    conversationId: params.conversationId,
    agentVersionId: publishedVersion.id,
    campaignId: resolvedCampaignId ?? undefined,
    knowledgeSnapshot,
    triggerMessageId: params.triggerMessageId,
  })

  return {
    episodeId: episode.id,
    agentVersionId: publishedVersion.id,
    campaignId: resolvedCampaignId,
    isNew: true,
  }
}
