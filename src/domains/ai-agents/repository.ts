import { db } from "@/lib/db"
import {
  waBusinessAccounts,
  waPhoneNumbers,
  aiAgents,
  aiAgentDeployments,
  waConversations,
  waConversationMessages,
  waAgentEvents,
  aiAgentVersions,
  aiKnowledgeSources,
  aiKnowledgeRevisions,
  aiAgentVersionKnowledge,
  aiCampaignRules,
  aiEpisodes,
  aiMessageQueue,
  aiToolExecutions,
  aiUsageRecords,
} from "@/lib/db/schema"
import { eq, and, desc, inArray, max, sql, lte, lt } from "drizzle-orm"
import type {
  CreateWaBusinessAccountInput,
  CreateWaPhoneNumberInput,
  CreateAiAgentInput,
  UpdateAiAgentInput,
  CreateDeploymentInput,
  ConversationFilters,
  CreateKnowledgeSourceInput,
  UpdateKnowledgeSourceInput,
  AssociateKnowledgeInput,
  CreateCampaignRuleInput,
  CreateEpisodeInput,
  EndEpisodeInput,
  RecordToolExecutionInput,
  RecordUsageInput,
  UpdateControlModeInput,
} from "./types"
import { encryptTokenVersioned } from "@/lib/crypto"
import crypto from "node:crypto"

// ─── WhatsApp Business Accounts ───────────────────────────────────────────────

export async function listWaBusinessAccounts(orgId: string) {
  return db
    .select()
    .from(waBusinessAccounts)
    .where(eq(waBusinessAccounts.orgId, orgId))
    .orderBy(desc(waBusinessAccounts.createdAt))
}

export async function getWaBusinessAccountById(id: string, orgId: string) {
  const rows = await db
    .select()
    .from(waBusinessAccounts)
    .where(and(eq(waBusinessAccounts.id, id), eq(waBusinessAccounts.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createWaBusinessAccount(
  orgId: string,
  input: CreateWaBusinessAccountInput
) {
  const { ciphertext: accessTokenEnc, keyVersion } = encryptTokenVersioned(input.accessToken)
  const rows = await db
    .insert(waBusinessAccounts)
    .values({
      orgId,
      wabaId: input.wabaId,
      displayName: input.displayName,
      accessTokenEnc,
      keyVersion,
      webhookVerifyToken: input.webhookVerifyToken ?? null,
    })
    .returning()
  return rows[0]!
}

export async function updateWaBusinessAccountStatus(
  id: string,
  orgId: string,
  status: string
) {
  const rows = await db
    .update(waBusinessAccounts)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(waBusinessAccounts.id, id), eq(waBusinessAccounts.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

export async function deleteWaBusinessAccount(id: string, orgId: string) {
  await db
    .delete(waBusinessAccounts)
    .where(and(eq(waBusinessAccounts.id, id), eq(waBusinessAccounts.orgId, orgId)))
}

// ─── WhatsApp Phone Numbers ────────────────────────────────────────────────────

export async function listWaPhoneNumbers(orgId: string, wabaAccountId?: string) {
  const conditions = wabaAccountId
    ? and(eq(waPhoneNumbers.orgId, orgId), eq(waPhoneNumbers.wabaAccountId, wabaAccountId))
    : eq(waPhoneNumbers.orgId, orgId)
  return db
    .select()
    .from(waPhoneNumbers)
    .where(conditions)
    .orderBy(desc(waPhoneNumbers.createdAt))
}

export async function getWaPhoneNumberById(id: string, orgId: string) {
  const rows = await db
    .select()
    .from(waPhoneNumbers)
    .where(and(eq(waPhoneNumbers.id, id), eq(waPhoneNumbers.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createWaPhoneNumber(
  orgId: string,
  input: CreateWaPhoneNumberInput
) {
  const rows = await db
    .insert(waPhoneNumbers)
    .values({
      orgId,
      wabaAccountId: input.wabaAccountId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber,
      verifiedName: input.verifiedName ?? null,
      qualityRating: input.qualityRating ?? null,
    })
    .returning()
  return rows[0]!
}

// ─── AI Agents ────────────────────────────────────────────────────────────────

export async function listAiAgents(orgId: string) {
  return db
    .select()
    .from(aiAgents)
    .where(eq(aiAgents.orgId, orgId))
    .orderBy(desc(aiAgents.createdAt))
}

export async function getAiAgentById(id: string, orgId: string) {
  const rows = await db
    .select()
    .from(aiAgents)
    .where(and(eq(aiAgents.id, id), eq(aiAgents.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createAiAgent(
  orgId: string,
  input: CreateAiAgentInput,
  createdById: string
) {
  const rows = await db
    .insert(aiAgents)
    .values({
      orgId,
      name: input.name,
      description: input.description ?? null,
      systemPrompt: input.systemPrompt,
      model: input.model,
      aiTemperature: String(input.aiTemperature),
      maxTokens: input.maxTokens,
      toolsEnabled: input.toolsEnabled,
      handoffTriggers: input.handoffTriggers,
      greetingMessage: input.greetingMessage ?? null,
      createdById,
    })
    .returning()
  return rows[0]!
}

export async function updateAiAgent(id: string, orgId: string, input: UpdateAiAgentInput) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) updateData.name = input.name
  if (input.description !== undefined) updateData.description = input.description
  if (input.systemPrompt !== undefined) updateData.systemPrompt = input.systemPrompt
  if (input.model !== undefined) updateData.model = input.model
  if (input.aiTemperature !== undefined) updateData.aiTemperature = String(input.aiTemperature)
  if (input.maxTokens !== undefined) updateData.maxTokens = input.maxTokens
  if (input.toolsEnabled !== undefined) updateData.toolsEnabled = input.toolsEnabled
  if (input.handoffTriggers !== undefined) updateData.handoffTriggers = input.handoffTriggers
  if (input.greetingMessage !== undefined) updateData.greetingMessage = input.greetingMessage
  if (input.active !== undefined) updateData.active = input.active
  const rows = await db
    .update(aiAgents)
    .set(updateData)
    .where(and(eq(aiAgents.id, id), eq(aiAgents.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

// ─── AI Agent Deployments ──────────────────────────────────────────────────────

export async function listAiAgentDeployments(orgId: string) {
  return db
    .select()
    .from(aiAgentDeployments)
    .where(eq(aiAgentDeployments.orgId, orgId))
    .orderBy(desc(aiAgentDeployments.createdAt))
}

export async function getDeploymentForPhoneNumber(phoneNumberId: string, orgId: string) {
  const rows = await db
    .select()
    .from(aiAgentDeployments)
    .where(
      and(
        eq(aiAgentDeployments.phoneNumberId, phoneNumberId),
        eq(aiAgentDeployments.orgId, orgId),
        eq(aiAgentDeployments.active, true)
      )
    )
    .limit(1)
  return rows[0] ?? null
}

export async function createAiAgentDeployment(orgId: string, input: CreateDeploymentInput) {
  const rows = await db
    .insert(aiAgentDeployments)
    .values({
      orgId,
      agentId: input.agentId,
      phoneNumberId: input.phoneNumberId,
    })
    .returning()
  return rows[0]!
}

export async function deactivateDeployment(id: string, orgId: string) {
  const rows = await db
    .update(aiAgentDeployments)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(aiAgentDeployments.id, id), eq(aiAgentDeployments.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

// ─── Conversations ─────────────────────────────────────────────────────────────

export async function listWaConversations(orgId: string, filters?: ConversationFilters) {
  const conditions = [eq(waConversations.orgId, orgId)]
  if (filters?.status) conditions.push(eq(waConversations.status, filters.status))
  if (filters?.phoneNumberId) conditions.push(eq(waConversations.phoneNumberId, filters.phoneNumberId))
  if (filters?.assignedTo) conditions.push(eq(waConversations.assignedTo, filters.assignedTo))
  return db
    .select()
    .from(waConversations)
    .where(and(...conditions))
    .orderBy(desc(waConversations.lastMessageAt))
}

export async function getWaConversationById(id: string, orgId: string) {
  const rows = await db
    .select()
    .from(waConversations)
    .where(and(eq(waConversations.id, id), eq(waConversations.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getOrCreateConversation(
  orgId: string,
  phoneNumberId: string,
  customerPhone: string,
  deploymentId?: string
) {
  const existing = await db
    .select()
    .from(waConversations)
    .where(
      and(
        eq(waConversations.orgId, orgId),
        eq(waConversations.phoneNumberId, phoneNumberId),
        eq(waConversations.customerPhone, customerPhone)
      )
    )
    .limit(1)
  if (existing[0]) return existing[0]
  const rows = await db
    .insert(waConversations)
    .values({
      orgId,
      phoneNumberId,
      customerPhone,
      deploymentId: deploymentId ?? null,
    })
    .returning()
  return rows[0]!
}

export async function updateConversationStatus(
  id: string,
  orgId: string,
  status: string,
  assignedTo?: string | null
) {
  const rows = await db
    .update(waConversations)
    .set({ status, assignedTo: assignedTo ?? null, updatedAt: new Date() })
    .where(and(eq(waConversations.id, id), eq(waConversations.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

// ─── Conversation Messages ─────────────────────────────────────────────────────

export async function getConversationMessages(
  conversationId: string,
  orgId: string,
  limit = 50
) {
  return db
    .select()
    .from(waConversationMessages)
    .where(
      and(
        eq(waConversationMessages.conversationId, conversationId),
        eq(waConversationMessages.orgId, orgId)
      )
    )
    .orderBy(waConversationMessages.createdAt)
    .limit(limit)
}

export async function insertConversationMessage(
  orgId: string,
  conversationId: string,
  data: {
    direction: string
    role: string
    content: string
    contentType?: string
    mediaUrl?: string | null
    externalMessageId?: string | null
    status?: string
    tokenCount?: number | null
    isAi?: boolean
  }
) {
  const rows = await db
    .insert(waConversationMessages)
    .values({
      orgId,
      conversationId,
      direction: data.direction,
      role: data.role,
      content: data.content,
      contentType: data.contentType ?? "text",
      mediaUrl: data.mediaUrl ?? null,
      externalMessageId: data.externalMessageId ?? null,
      status: data.status ?? "sent",
      tokenCount: data.tokenCount ?? null,
      isAi: data.isAi ?? false,
    })
    .returning()
  // Update lastMessageAt + increment messageCount
  await db
    .update(waConversations)
    .set({
      lastMessageAt: new Date(),
      updatedAt: new Date(),
      messageCount: sql`message_count + 1`,
    })
    .where(eq(waConversations.id, conversationId))
  return rows[0]!
}

// ─── Agent Events ──────────────────────────────────────────────────────────────

export async function insertAgentEvent(
  orgId: string,
  conversationId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  const rows = await db
    .insert(waAgentEvents)
    .values({ orgId, conversationId, eventType, payload })
    .returning()
  return rows[0]!
}

export async function getAgentEvents(conversationId: string, orgId: string) {
  return db
    .select()
    .from(waAgentEvents)
    .where(
      and(
        eq(waAgentEvents.conversationId, conversationId),
        eq(waAgentEvents.orgId, orgId)
      )
    )
    .orderBy(waAgentEvents.createdAt)
}

// ─── Conversation control mode ─────────────────────────────────────────────────

export async function updateConversationControlMode(
  id: string,
  orgId: string,
  input: UpdateControlModeInput
) {
  const rows = await db
    .update(waConversations)
    .set({
      controlMode: input.controlMode,
      assignedTo: input.assignedTo ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(waConversations.id, id), eq(waConversations.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

export async function closeConversation(id: string, orgId: string) {
  const rows = await db
    .update(waConversations)
    .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(waConversations.id, id), eq(waConversations.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

// ─── Agent Versions ────────────────────────────────────────────────────────────

export async function listAgentVersions(agentId: string, orgId: string) {
  return db
    .select()
    .from(aiAgentVersions)
    .where(and(eq(aiAgentVersions.agentId, agentId), eq(aiAgentVersions.orgId, orgId)))
    .orderBy(desc(aiAgentVersions.versionNumber))
}

export async function getAgentVersionById(id: string, orgId: string) {
  const rows = await db
    .select()
    .from(aiAgentVersions)
    .where(and(eq(aiAgentVersions.id, id), eq(aiAgentVersions.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getPublishedVersion(agentId: string, orgId: string) {
  const rows = await db
    .select()
    .from(aiAgentVersions)
    .where(
      and(
        eq(aiAgentVersions.agentId, agentId),
        eq(aiAgentVersions.orgId, orgId),
        eq(aiAgentVersions.status, "published")
      )
    )
    .limit(1)
  return rows[0] ?? null
}

export async function createAgentDraft(agentId: string, orgId: string, createdById: string) {
  // Snapshot the agent's current config
  const agent = await getAiAgentById(agentId, orgId)
  if (!agent) return null

  const maxRows = await db
    .select({ maxVer: max(aiAgentVersions.versionNumber) })
    .from(aiAgentVersions)
    .where(and(eq(aiAgentVersions.agentId, agentId), eq(aiAgentVersions.orgId, orgId)))

  const nextVersion = (maxRows[0]?.maxVer ?? 0) + 1

  const snapshot: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    aiTemperature: agent.aiTemperature,
    maxTokens: agent.maxTokens,
    toolsEnabled: agent.toolsEnabled,
    handoffTriggers: agent.handoffTriggers,
    greetingMessage: agent.greetingMessage,
    snapshotAt: new Date().toISOString(),
    snapshotBy: createdById,
  }

  const rows = await db
    .insert(aiAgentVersions)
    .values({ orgId, agentId, versionNumber: nextVersion, snapshot, status: "draft" })
    .returning()
  return rows[0]!
}

// Atomic publication: archive the current published version, then publish the draft.
// Returns null if versionId is not a draft in this org.
export async function publishAgentVersion(
  versionId: string,
  orgId: string,
  publishedById: string
) {
  // Verify the version is a draft in this org
  const draft = await db
    .select()
    .from(aiAgentVersions)
    .where(
      and(
        eq(aiAgentVersions.id, versionId),
        eq(aiAgentVersions.orgId, orgId),
        eq(aiAgentVersions.status, "draft")
      )
    )
    .limit(1)

  if (!draft[0]) return null

  // Step 1: Archive any currently published version for this agent (non-fatal if none exists)
  await db
    .update(aiAgentVersions)
    .set({ status: "archived", archivedAt: new Date(), archivedBy: publishedById })
    .where(
      and(
        eq(aiAgentVersions.agentId, draft[0].agentId),
        eq(aiAgentVersions.orgId, orgId),
        eq(aiAgentVersions.status, "published")
      )
    )

  // Step 2: Publish the draft (partial unique index prevents a second concurrent publish)
  const rows = await db
    .update(aiAgentVersions)
    .set({ status: "published", publishedAt: new Date(), publishedBy: publishedById })
    .where(and(eq(aiAgentVersions.id, versionId), eq(aiAgentVersions.orgId, orgId)))
    .returning()

  return rows[0] ?? null
}

export async function archiveAgentVersion(
  versionId: string,
  orgId: string,
  archivedById: string
) {
  const rows = await db
    .update(aiAgentVersions)
    .set({ status: "archived", archivedAt: new Date(), archivedBy: archivedById })
    .where(
      and(
        eq(aiAgentVersions.id, versionId),
        eq(aiAgentVersions.orgId, orgId)
      )
    )
    .returning()
  return rows[0] ?? null
}

// ─── Knowledge Sources ─────────────────────────────────────────────────────────

export async function listKnowledgeSources(orgId: string) {
  return db
    .select()
    .from(aiKnowledgeSources)
    .where(eq(aiKnowledgeSources.orgId, orgId))
    .orderBy(desc(aiKnowledgeSources.createdAt))
}

export async function getKnowledgeSourceById(id: string, orgId: string) {
  const rows = await db
    .select()
    .from(aiKnowledgeSources)
    .where(and(eq(aiKnowledgeSources.id, id), eq(aiKnowledgeSources.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createKnowledgeSource(
  orgId: string,
  input: CreateKnowledgeSourceInput,
  createdById: string
) {
  const rows = await db
    .insert(aiKnowledgeSources)
    .values({
      orgId,
      name: input.name,
      description: input.description ?? null,
      sourceType: input.sourceType,
      content: input.content ?? null,
      url: input.url ?? null,
      fileKey: input.fileKey ?? null,
      createdBy: createdById,
    })
    .returning()
  const source = rows[0]!

  // Create the first revision if there's content
  const content = input.content ?? input.url ?? input.fileKey ?? ""
  if (content) {
    await createKnowledgeRevision(orgId, source.id, content)
  }

  return source
}

export async function updateKnowledgeSource(
  id: string,
  orgId: string,
  input: UpdateKnowledgeSourceInput
) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) updateData.name = input.name
  if (input.description !== undefined) updateData.description = input.description
  if (input.content !== undefined) updateData.content = input.content
  if (input.url !== undefined) updateData.url = input.url
  if (input.fileKey !== undefined) updateData.fileKey = input.fileKey

  const rows = await db
    .update(aiKnowledgeSources)
    .set(updateData)
    .where(and(eq(aiKnowledgeSources.id, id), eq(aiKnowledgeSources.orgId, orgId)))
    .returning()
  const source = rows[0]
  if (!source) return null

  // Create a new revision when content changes
  const newContent = input.content ?? input.url ?? input.fileKey
  if (newContent) {
    await createKnowledgeRevision(orgId, id, newContent)
  }

  return source
}

export async function revokeKnowledgeSource(
  id: string,
  orgId: string,
  revokedById: string
) {
  const rows = await db
    .update(aiKnowledgeSources)
    .set({ status: "revoked", revokedAt: new Date(), revokedBy: revokedById, updatedAt: new Date() })
    .where(and(eq(aiKnowledgeSources.id, id), eq(aiKnowledgeSources.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

// ─── Knowledge Revisions ───────────────────────────────────────────────────────

export async function createKnowledgeRevision(orgId: string, sourceId: string, content: string) {
  const contentHash = crypto.createHash("sha256").update(content).digest("hex")

  // Check if this exact content already exists (avoid duplicate revisions)
  const existing = await db
    .select({ id: aiKnowledgeRevisions.id, revisionNumber: aiKnowledgeRevisions.revisionNumber })
    .from(aiKnowledgeRevisions)
    .where(and(eq(aiKnowledgeRevisions.sourceId, sourceId), eq(aiKnowledgeRevisions.contentHash, contentHash)))
    .limit(1)
  if (existing[0]) return existing[0]

  const maxRows = await db
    .select({ maxRev: max(aiKnowledgeRevisions.revisionNumber) })
    .from(aiKnowledgeRevisions)
    .where(eq(aiKnowledgeRevisions.sourceId, sourceId))

  const nextRevision = (maxRows[0]?.maxRev ?? 0) + 1

  const rows = await db
    .insert(aiKnowledgeRevisions)
    .values({ orgId, sourceId, revisionNumber: nextRevision, contentHash, content })
    .returning()
  return rows[0]!
}

export async function getLatestRevision(sourceId: string, orgId: string) {
  const rows = await db
    .select()
    .from(aiKnowledgeRevisions)
    .where(and(eq(aiKnowledgeRevisions.sourceId, sourceId), eq(aiKnowledgeRevisions.orgId, orgId)))
    .orderBy(desc(aiKnowledgeRevisions.revisionNumber))
    .limit(1)
  return rows[0] ?? null
}

export async function getRevisionById(revisionId: string, orgId: string) {
  const rows = await db
    .select()
    .from(aiKnowledgeRevisions)
    .where(and(eq(aiKnowledgeRevisions.id, revisionId), eq(aiKnowledgeRevisions.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

// ─── Version-Knowledge Associations ───────────────────────────────────────────

export async function associateKnowledgeWithVersion(
  orgId: string,
  input: AssociateKnowledgeInput
) {
  // Verify knowledge source and revision belong to same org (cross-tenant guard)
  const source = await getKnowledgeSourceById(input.knowledgeSourceId, orgId)
  if (!source) return null
  const revision = await getRevisionById(input.knowledgeRevisionId, orgId)
  if (!revision) return null
  // Verify revision belongs to this source
  if (revision.sourceId !== source.id) return null

  const rows = await db
    .insert(aiAgentVersionKnowledge)
    .values({
      orgId,
      agentVersionId: input.agentVersionId,
      knowledgeSourceId: input.knowledgeSourceId,
      knowledgeRevisionId: input.knowledgeRevisionId,
    })
    .onConflictDoNothing()
    .returning()
  return rows[0] ?? null
}

// Returns knowledge for a version, skipping revoked sources.
// Revoked sources are excluded from retrieval even if still in the association list.
export async function getKnowledgeForVersion(agentVersionId: string, orgId: string) {
  const associations = await db
    .select({
      assoc: aiAgentVersionKnowledge,
      source: aiKnowledgeSources,
      revision: aiKnowledgeRevisions,
    })
    .from(aiAgentVersionKnowledge)
    .innerJoin(aiKnowledgeSources, eq(aiAgentVersionKnowledge.knowledgeSourceId, aiKnowledgeSources.id))
    .innerJoin(aiKnowledgeRevisions, eq(aiAgentVersionKnowledge.knowledgeRevisionId, aiKnowledgeRevisions.id))
    .where(
      and(
        eq(aiAgentVersionKnowledge.agentVersionId, agentVersionId),
        eq(aiAgentVersionKnowledge.orgId, orgId)
      )
    )

  // Filter out revoked sources at the application layer
  return associations.filter(a => a.source.status !== "revoked")
}

// ─── Campaign Rules ────────────────────────────────────────────────────────────

export async function listCampaignRules(deploymentId: string, orgId: string) {
  return db
    .select()
    .from(aiCampaignRules)
    .where(and(eq(aiCampaignRules.deploymentId, deploymentId), eq(aiCampaignRules.orgId, orgId)))
    .orderBy(desc(aiCampaignRules.priority))
}

export async function createCampaignRule(orgId: string, input: CreateCampaignRuleInput) {
  const rows = await db
    .insert(aiCampaignRules)
    .values({
      orgId,
      deploymentId: input.deploymentId,
      campaignId: input.campaignId ?? null,
      priority: input.priority,
    })
    .returning()
  return rows[0]!
}

export async function deactivateCampaignRule(id: string, orgId: string) {
  const rows = await db
    .update(aiCampaignRules)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(aiCampaignRules.id, id), eq(aiCampaignRules.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

// ─── Episodes ─────────────────────────────────────────────────────────────────

export async function createEpisode(orgId: string, input: CreateEpisodeInput) {
  const rows = await db
    .insert(aiEpisodes)
    .values({
      orgId,
      conversationId: input.conversationId,
      agentVersionId: input.agentVersionId,
      campaignId: input.campaignId ?? null,
      knowledgeSnapshot: input.knowledgeSnapshot,
      triggerMessageId: input.triggerMessageId ?? null,
      modelUsed: input.modelUsed ?? null,
    })
    .returning()
  return rows[0]!
}

export async function getActiveEpisode(conversationId: string, orgId: string) {
  const rows = await db
    .select()
    .from(aiEpisodes)
    .where(
      and(
        eq(aiEpisodes.conversationId, conversationId),
        eq(aiEpisodes.orgId, orgId),
        eq(aiEpisodes.status, "active")
      )
    )
    .orderBy(desc(aiEpisodes.startedAt))
    .limit(1)
  return rows[0] ?? null
}

export async function endEpisode(id: string, orgId: string, input: EndEpisodeInput) {
  const updateData: Record<string, unknown> = {
    status: "ended",
    exitReason: input.exitReason,
    exitDetail: input.exitDetail ?? null,
    endedAt: new Date(),
  }
  if (input.tokenCountIn !== undefined) updateData.tokenCountIn = input.tokenCountIn
  if (input.tokenCountOut !== undefined) updateData.tokenCountOut = input.tokenCountOut

  const rows = await db
    .update(aiEpisodes)
    .set(updateData)
    .where(and(eq(aiEpisodes.id, id), eq(aiEpisodes.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

export async function listEpisodesForConversation(conversationId: string, orgId: string) {
  return db
    .select()
    .from(aiEpisodes)
    .where(and(eq(aiEpisodes.conversationId, conversationId), eq(aiEpisodes.orgId, orgId)))
    .orderBy(desc(aiEpisodes.startedAt))
}

// ─── AI Message Queue ──────────────────────────────────────────────────────────

// Enqueue a message for AI processing. Idempotent via UNIQUE (incoming_message_id).
export async function enqueueForAi(
  orgId: string,
  conversationId: string,
  incomingMessageId: string
) {
  const rows = await db
    .insert(aiMessageQueue)
    .values({ orgId, conversationId, incomingMessageId, status: "enqueued", attemptCount: 0, claimAt: new Date() })
    .onConflictDoNothing()
    .returning()
  return rows[0] ?? null
}

// Claim one item for processing (two-step optimistic lock with per-conversation serialization).
//
// Serialization: the SELECT skips conversations that already have a 'processing'
// item claimed within the last 10 minutes, preventing two workers from processing
// the same conversation concurrently. The 10-minute bound is consistent with the
// orphan-recovery threshold so no eligible conversation is permanently excluded.
//
// Fencing: a UUID lease token is generated and stored. All subsequent mutations on
// the claimed row must supply the matching token; a stale worker that lost the lease
// (after orphan recovery re-queued its item) will see 0 rows affected.
//
// Debounce: items with claimAt in the future are skipped — this is the mechanism
// used by enqueueForAiProcessing to batch burst messages.
export async function claimNextQueueItem(workerId: string) {
  const now = new Date()
  const leaseToken = crypto.randomUUID()

  // Step 1: SELECT — find a claimable item for a conversation not already processing.
  const candidates = await db
    .select()
    .from(aiMessageQueue)
    .where(
      and(
        eq(aiMessageQueue.status, "enqueued"),
        lte(aiMessageQueue.claimAt, now),
        // Exclude conversations currently held by another worker (within orphan window).
        sql`${aiMessageQueue.conversationId} NOT IN (
          SELECT conversation_id FROM ai_message_queue
          WHERE status = 'processing'
            AND claimed_at > NOW() - INTERVAL '10 minutes'
        )`,
      )
    )
    .orderBy(aiMessageQueue.claimAt)
    .limit(1)

  if (!candidates[0]) return null

  const item = candidates[0]

  // Step 2: UPDATE — conditional on still being enqueued (optimistic lock).
  const claimed = await db
    .update(aiMessageQueue)
    .set({
      status: "processing",
      claimedAt: now,
      claimedBy: workerId,
      leaseToken,
      attemptCount: item.attemptCount + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiMessageQueue.id, item.id),
        eq(aiMessageQueue.status, "enqueued"),
      )
    )
    .returning()

  return claimed[0] ?? null
}

// Optional leaseToken: if supplied, the UPDATE is conditional on the stored token
// matching, so a stale worker cannot complete an item that was reclaimed by another.
export async function markQueueItemDone(id: string, leaseToken?: string) {
  await db
    .update(aiMessageQueue)
    .set({ status: "done", updatedAt: new Date() })
    .where(
      leaseToken
        ? and(eq(aiMessageQueue.id, id), eq(aiMessageQueue.leaseToken, leaseToken))
        : eq(aiMessageQueue.id, id)
    )
}

export async function markQueueItemFailed(id: string, error: string, retryAt: Date, leaseToken?: string) {
  await db
    .update(aiMessageQueue)
    .set({ status: "failed", errorLast: error, claimAt: retryAt, updatedAt: new Date() })
    .where(
      leaseToken
        ? and(eq(aiMessageQueue.id, id), eq(aiMessageQueue.leaseToken, leaseToken))
        : eq(aiMessageQueue.id, id)
    )
}

export async function markQueueItemDeadLetter(id: string, error: string, leaseToken?: string) {
  await db
    .update(aiMessageQueue)
    .set({
      status: "dead_letter",
      errorLast: error,
      deadLetteredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      leaseToken
        ? and(eq(aiMessageQueue.id, id), eq(aiMessageQueue.leaseToken, leaseToken))
        : eq(aiMessageQueue.id, id)
    )
}

export async function getPendingQueueItems(orgId: string, limit = 10) {
  return db
    .select()
    .from(aiMessageQueue)
    .where(
      and(
        eq(aiMessageQueue.orgId, orgId),
        eq(aiMessageQueue.status, "enqueued")
      )
    )
    .orderBy(aiMessageQueue.claimAt)
    .limit(limit)
}

// Resets queue items stuck in 'processing' for longer than orphanThresholdMs
// (default 10 minutes). These are items whose worker crashed or exceeded the
// function budget without marking done/failed. The lease token is cleared so the
// next claimant gets a fresh token; attemptCount stays incremented (it was already
// counted when the item was first claimed).
export async function recoverOrphanedQueueItems(
  orphanThresholdMs = 10 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - orphanThresholdMs)
  const result = await db
    .update(aiMessageQueue)
    .set({
      status: "enqueued",
      claimAt: new Date(), // immediately eligible for re-claim
      leaseToken: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiMessageQueue.status, "processing"),
        lt(aiMessageQueue.claimedAt, cutoff),
      )
    )
    .returning({ id: aiMessageQueue.id })
  return result.length
}

// Cancels all 'enqueued' items for a conversation — called when a human takes
// over so pending AI jobs are silently discarded rather than processed later.
// Items currently 'processing' are handled by the cron worker's pre-send check.
export async function cancelPendingQueueItems(
  conversationId: string,
  orgId: string,
): Promise<number> {
  const result = await db
    .update(aiMessageQueue)
    .set({ status: "done", updatedAt: new Date() })
    .where(
      and(
        eq(aiMessageQueue.conversationId, conversationId),
        eq(aiMessageQueue.orgId, orgId),
        eq(aiMessageQueue.status, "enqueued"),
      )
    )
    .returning({ id: aiMessageQueue.id })
  return result.length
}

// Marks unsent AI messages (status='pending', isAi=true) as 'failed' when a human
// takes over. Called alongside cancelPendingQueueItems so the inbox shows that
// those messages were abandoned, not lost in transit.
// IMPORTANT: a message already accepted by Meta cannot be retracted — this only
// affects messages whose send has not yet been attempted.
export async function cancelPendingAiMessages(
  conversationId: string,
  orgId: string,
): Promise<number> {
  const result = await db
    .update(waConversationMessages)
    .set({ status: "failed" })
    .where(
      and(
        eq(waConversationMessages.conversationId, conversationId),
        eq(waConversationMessages.orgId, orgId),
        eq(waConversationMessages.isAi, true),
        eq(waConversationMessages.status, "pending"),
      )
    )
    .returning({ id: waConversationMessages.id })
  return result.length
}

// ─── Tool Executions ───────────────────────────────────────────────────────────

export async function recordToolExecution(orgId: string, input: RecordToolExecutionInput) {
  const rows = await db
    .insert(aiToolExecutions)
    .values({
      orgId,
      episodeId: input.episodeId,
      conversationId: input.conversationId,
      toolName: input.toolName,
      input: input.input,
      output: input.output ?? null,
      status: input.status,
      durationMs: input.durationMs ?? null,
      errorDetail: input.errorDetail ?? null,
    })
    .returning()
  return rows[0]!
}

export async function getToolExecutionsForEpisode(episodeId: string, orgId: string) {
  return db
    .select()
    .from(aiToolExecutions)
    .where(and(eq(aiToolExecutions.episodeId, episodeId), eq(aiToolExecutions.orgId, orgId)))
    .orderBy(aiToolExecutions.createdAt)
}

// ─── Usage Records ─────────────────────────────────────────────────────────────

export async function recordUsage(orgId: string, input: RecordUsageInput) {
  const rows = await db
    .insert(aiUsageRecords)
    .values({
      orgId,
      episodeId: input.episodeId,
      conversationId: input.conversationId,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      latencyMs: input.latencyMs ?? null,
      // Phase 09 fields
      cacheReadTokens: input.cacheReadTokens ?? 0,
      cacheWriteTokens: input.cacheWriteTokens ?? 0,
      inputCostMillicents: input.inputCostMillicents ?? null,
      outputCostMillicents: input.outputCostMillicents ?? null,
      cacheReadCostMillicents: input.cacheReadCostMillicents ?? null,
      cacheWriteCostMillicents: input.cacheWriteCostMillicents ?? null,
      totalCostMillicents: input.totalCostMillicents ?? null,
      pricingTierId: input.pricingTierId ?? null,
      isSandbox: input.isSandbox ?? false,
      callType: input.callType ?? "inference",
    })
    .returning()

  // FIX BUG: ACCUMULATE (not overwrite) episode aggregate token counts.
  // Previously this overwrote with the current call's tokens — wrong for multi-turn episodes.
  await db
    .update(aiEpisodes)
    .set({
      tokenCountIn: sql`token_count_in + ${input.inputTokens}`,
      tokenCountOut: sql`token_count_out + ${input.outputTokens}`,
    })
    .where(and(eq(aiEpisodes.id, input.episodeId), eq(aiEpisodes.orgId, orgId)))
    .catch(() => undefined)

  return rows[0]!
}

export async function getUsageForEpisode(episodeId: string, orgId: string) {
  return db
    .select()
    .from(aiUsageRecords)
    .where(and(eq(aiUsageRecords.episodeId, episodeId), eq(aiUsageRecords.orgId, orgId)))
    .orderBy(aiUsageRecords.createdAt)
}

// ─── Conversation summary ──────────────────────────────────────────────────────

export async function updateConversationSummary(
  conversationId: string,
  orgId: string,
  summary: string
) {
  await db
    .update(waConversations)
    .set({ summary, updatedAt: new Date() })
    .where(and(eq(waConversations.id, conversationId), eq(waConversations.orgId, orgId)))
}
