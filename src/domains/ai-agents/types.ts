import { z } from "zod"

// ─── Status values ────────────────────────────────────────────────────────────

export const WA_BUSINESS_ACCOUNT_STATUSES = ["active", "inactive", "error", "disconnected"] as const
export type WaBusinessAccountStatus = typeof WA_BUSINESS_ACCOUNT_STATUSES[number]

export const WA_PHONE_NUMBER_STATUSES = ["active", "inactive", "pending", "deleted"] as const
export type WaPhoneNumberStatus = typeof WA_PHONE_NUMBER_STATUSES[number]

export const WA_CONVERSATION_STATUSES = ["active", "closed", "human_takeover"] as const
export type WaConversationStatus = typeof WA_CONVERSATION_STATUSES[number]

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const
export type MessageDirection = typeof MESSAGE_DIRECTIONS[number]

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const
export type MessageRole = typeof MESSAGE_ROLES[number]

export const MESSAGE_CONTENT_TYPES = ["text", "image", "audio", "document", "template", "sticker", "reaction"] as const
export type MessageContentType = typeof MESSAGE_CONTENT_TYPES[number]

export const MESSAGE_STATUSES = ["sent", "delivered", "read", "failed"] as const
export type MessageStatus = typeof MESSAGE_STATUSES[number]

export const AGENT_EVENT_TYPES = [
  "tool_call",
  "tool_result",
  "handoff_triggered",
  "handoff_completed",
  "context_updated",
  "error",
  "greeting_sent",
] as const
export type AgentEventType = typeof AGENT_EVENT_TYPES[number]

// ─── Input schemas ────────────────────────────────────────────────────────────

export const CreateWaBusinessAccountSchema = z.object({
  wabaId: z.string().min(1, "WABA ID requerido"),
  displayName: z.string().min(1).max(100),
  accessToken: z.string().min(1, "Access token requerido"),
  webhookVerifyToken: z.string().optional(),
})
export type CreateWaBusinessAccountInput = z.infer<typeof CreateWaBusinessAccountSchema>

export const CreateWaPhoneNumberSchema = z.object({
  wabaAccountId: z.string().uuid(),
  phoneNumberId: z.string().min(1),
  displayPhoneNumber: z.string().min(1),
  verifiedName: z.string().optional(),
  qualityRating: z.string().optional(),
})
export type CreateWaPhoneNumberInput = z.infer<typeof CreateWaPhoneNumberSchema>

export const CreateAiAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  systemPrompt: z.string().min(1, "System prompt requerido"),
  model: z.string().default("claude-sonnet-4-6"),
  aiTemperature: z.number().min(0).max(1).default(0.7),
  maxTokens: z.number().int().min(256).max(8192).default(1024),
  toolsEnabled: z.array(z.string()).default([]),
  handoffTriggers: z.record(z.string(), z.unknown()).default({}),
  greetingMessage: z.string().optional(),
})
export type CreateAiAgentInput = z.infer<typeof CreateAiAgentSchema>

export const UpdateAiAgentSchema = CreateAiAgentSchema.partial().extend({
  active: z.boolean().optional(),
})
export type UpdateAiAgentInput = z.infer<typeof UpdateAiAgentSchema>

export const CreateDeploymentSchema = z.object({
  agentId: z.string().uuid(),
  phoneNumberId: z.string().uuid(),
})
export type CreateDeploymentInput = z.infer<typeof CreateDeploymentSchema>

// ─── Conversation filters ─────────────────────────────────────────────────────

export const ConversationFiltersSchema = z.object({
  status: z.enum(["active", "closed", "human_takeover"]).optional(),
  phoneNumberId: z.string().uuid().optional(),
  assignedTo: z.string().optional(),
  search: z.string().optional(),
})
export type ConversationFilters = z.infer<typeof ConversationFiltersSchema>

// ─── Tool call payload ────────────────────────────────────────────────────────

export const AgentToolCallSchema = z.object({
  toolName: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  callId: z.string().min(1),
})
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>

export const AgentToolResultSchema = z.object({
  callId: z.string().min(1),
  toolName: z.string().min(1),
  output: z.record(z.string(), z.unknown()),
  isError: z.boolean().default(false),
})
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>

// ─── Phase 02 schemas ─────────────────────────────────────────────────────────

// Agent version statuses
export const AGENT_VERSION_STATUSES = ["draft", "published", "archived"] as const
export type AgentVersionStatus = typeof AGENT_VERSION_STATUSES[number]

// Episode exit reasons
export const EPISODE_EXIT_REASONS = [
  "objective_met",
  "human_requested",
  "transfer_rule",
  "inactivity",
  "error",
  "budget",
  "limit",
] as const
export type EpisodeExitReason = typeof EPISODE_EXIT_REASONS[number]

// Episode statuses
export const EPISODE_STATUSES = ["active", "ended"] as const
export type EpisodeStatus = typeof EPISODE_STATUSES[number]

// Message queue statuses (outbox FSM)
export const QUEUE_STATUSES = ["enqueued", "processing", "done", "failed", "dead_letter"] as const
export type QueueStatus = typeof QUEUE_STATUSES[number]

// Conversation control modes
export const CONTROL_MODES = ["ai", "waiting_human", "human", "paused"] as const
export type ConversationControlMode = typeof CONTROL_MODES[number]

// Knowledge source types + statuses
export const KNOWLEDGE_SOURCE_TYPES = ["text", "url", "file"] as const
export type KnowledgeSourceType = typeof KNOWLEDGE_SOURCE_TYPES[number]

export const KNOWLEDGE_SOURCE_STATUSES = ["active", "revoked"] as const
export type KnowledgeSourceStatus = typeof KNOWLEDGE_SOURCE_STATUSES[number]

// Tool execution statuses
export const TOOL_EXECUTION_STATUSES = ["success", "error"] as const
export type ToolExecutionStatus = typeof TOOL_EXECUTION_STATUSES[number]

// ─── Version management schemas ───────────────────────────────────────────────

export const CreateAgentVersionSchema = z.object({
  agentId: z.string().uuid(),
  // Optional override of the agent's current config for this draft.
  // If omitted, the agent's current config is snapshotted as-is.
  snapshotOverride: z.record(z.string(), z.unknown()).optional(),
})
export type CreateAgentVersionInput = z.infer<typeof CreateAgentVersionSchema>

export const PublishVersionSchema = z.object({
  versionId: z.string().uuid(),
})
export type PublishVersionInput = z.infer<typeof PublishVersionSchema>

// ─── Knowledge schemas ────────────────────────────────────────────────────────

export const CreateKnowledgeSourceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  sourceType: z.enum(["text", "url", "file"]),
  content: z.string().optional(),  // required when sourceType = text
  url: z.string().url().optional(), // required when sourceType = url
  fileKey: z.string().optional(),   // required when sourceType = file
})
export type CreateKnowledgeSourceInput = z.infer<typeof CreateKnowledgeSourceSchema>

export const UpdateKnowledgeSourceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  url: z.string().url().optional(),
  fileKey: z.string().optional(),
})
export type UpdateKnowledgeSourceInput = z.infer<typeof UpdateKnowledgeSourceSchema>

export const AssociateKnowledgeSchema = z.object({
  agentVersionId: z.string().uuid(),
  knowledgeSourceId: z.string().uuid(),
  knowledgeRevisionId: z.string().uuid(),
})
export type AssociateKnowledgeInput = z.infer<typeof AssociateKnowledgeSchema>

// ─── Campaign rule schemas ────────────────────────────────────────────────────

export const CreateCampaignRuleSchema = z.object({
  deploymentId: z.string().uuid(),
  campaignId: z.string().uuid().optional(), // null = catch-all
  priority: z.number().int().min(0).default(0),
})
export type CreateCampaignRuleInput = z.infer<typeof CreateCampaignRuleSchema>

// ─── Episode schemas ──────────────────────────────────────────────────────────

export const CreateEpisodeSchema = z.object({
  conversationId: z.string().uuid(),
  agentVersionId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  knowledgeSnapshot: z.array(z.object({
    sourceId: z.string().uuid(),
    revisionId: z.string().uuid(),
    revisionNumber: z.number().int(),
  })).default([]),
  triggerMessageId: z.string().uuid().optional(),
  modelUsed: z.string().optional(),
})
export type CreateEpisodeInput = z.infer<typeof CreateEpisodeSchema>

export const EndEpisodeSchema = z.object({
  exitReason: z.enum(EPISODE_EXIT_REASONS),
  exitDetail: z.string().max(500).optional(),
  tokenCountIn: z.number().int().min(0).optional(),
  tokenCountOut: z.number().int().min(0).optional(),
})
export type EndEpisodeInput = z.infer<typeof EndEpisodeSchema>

// ─── Queue schemas ────────────────────────────────────────────────────────────

export const EnqueueMessageSchema = z.object({
  conversationId: z.string().uuid(),
  incomingMessageId: z.string().uuid(),
})
export type EnqueueMessageInput = z.infer<typeof EnqueueMessageSchema>

// ─── Tool execution + usage schemas ──────────────────────────────────────────

export const RecordToolExecutionSchema = z.object({
  episodeId: z.string().uuid(),
  conversationId: z.string().uuid(),
  toolName: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["success", "error"]),
  durationMs: z.number().int().min(0).optional(),
  errorDetail: z.string().max(500).optional(),
})
export type RecordToolExecutionInput = z.infer<typeof RecordToolExecutionSchema>

export const RecordUsageSchema = z.object({
  episodeId: z.string().uuid(),
  conversationId: z.string().uuid(),
  provider: z.enum(["anthropic", "openai", "google"]),
  model: z.string().min(1),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  latencyMs: z.number().int().min(0).optional(),
  // Phase 09 — cache token tracking
  cacheReadTokens: z.number().int().nonnegative().optional().default(0),
  cacheWriteTokens: z.number().int().nonnegative().optional().default(0),
  // Phase 09 — sandbox flag: sandbox runs do not count toward budget
  isSandbox: z.boolean().optional().default(false),
  // Phase 09 — call type classification
  callType: z.enum(["inference", "embedding", "transcription", "recovery", "retry"]).optional().default("inference"),
  // Phase 09 — cost fields (computed by caller using cost-calculator, stored as-is)
  inputCostMillicents: z.number().int().nonnegative().optional(),
  outputCostMillicents: z.number().int().nonnegative().optional(),
  cacheReadCostMillicents: z.number().int().nonnegative().optional(),
  cacheWriteCostMillicents: z.number().int().nonnegative().optional(),
  totalCostMillicents: z.number().int().nonnegative().optional(),
  pricingTierId: z.string().uuid().optional(),
})
export type RecordUsageInput = z.infer<typeof RecordUsageSchema>

// ─── Conversation control ─────────────────────────────────────────────────────

export const UpdateControlModeSchema = z.object({
  controlMode: z.enum(CONTROL_MODES),
  assignedTo: z.string().optional(),
})
export type UpdateControlModeInput = z.infer<typeof UpdateControlModeSchema>

// Knowledge snapshot item (stored in ai_episodes.knowledge_snapshot)
export interface KnowledgeSnapshotItem {
  sourceId: string
  revisionId: string
  revisionNumber: number
}

// ─── Phase 03 — Agent Config (6-tab editor) ───────────────────────────────────

export const AGENT_STATUSES = ["draft", "active", "paused", "archived"] as const
export type AgentStatus = typeof AGENT_STATUSES[number]

export const AGENT_LANGUAGES = ["es", "en", "pt"] as const
export type AgentLanguage = typeof AGENT_LANGUAGES[number]

export const AGENT_TONES = ["formal", "friendly", "neutral", "empathetic"] as const
export type AgentTone = typeof AGENT_TONES[number]

export const AGENT_RESPONSE_LENGTHS = ["brief", "standard", "detailed"] as const
export type AgentResponseLength = typeof AGENT_RESPONSE_LENGTHS[number]

export interface AgentFaqItem {
  id: string
  question: string
  answer: string
}

export interface AgentActionConfig {
  enabled: boolean
  allowedResources?: string[]
}

export interface AgentSchedule {
  timezone: string
  enabled: boolean
  // "09:00"-"18:00" ranges per weekday (0=Sun…6=Sat)
  hours?: Partial<Record<number, { from: string; to: string }>>
}

// 6 tabs of the editor
export interface AgentObjetivoConfig {
  goal: string
  steps: string[]
  requiredData: string[]
  completionCriteria: string
}

export interface AgentPersonalidadConfig {
  internalName: string
  presentation: string
  language: AgentLanguage
  tone: AgentTone
  responseLength: AgentResponseLength
}

export interface AgentConocimientoConfig {
  faq: AgentFaqItem[]
  knowledgeSourceIds: string[]
}

export interface AgentAccionesConfig {
  actions: Record<string, AgentActionConfig>
}

export interface AgentReglasConfig {
  prohibitions: string[]
  transferRule?: string
  schedule?: AgentSchedule
  inactivityTimeoutMinutes: number
  maxMessagesPerConversation: number
}

export interface AgentDespliegueConfig {
  phoneNumberId?: string
  isDefault: boolean
  campaignIds: string[]
}

export interface AgentConfig {
  objetivo: AgentObjetivoConfig
  personalidad: AgentPersonalidadConfig
  conocimiento: AgentConocimientoConfig
  acciones: AgentAccionesConfig
  reglas: AgentReglasConfig
  despliegue: AgentDespliegueConfig
}

export const AGENT_TEMPLATES = ["qualify_leads", "sales_advisor", "appointment_request", "support_faq"] as const
export type AgentTemplateId = typeof AGENT_TEMPLATES[number]

export interface AgentTemplate {
  id: AgentTemplateId
  name: string
  description: string
  config: AgentConfig
}

// ─── Phase 03 Zod schemas ─────────────────────────────────────────────────────

export const AgentObjetivoSchema = z.object({
  goal: z.string().min(1, "El objetivo es requerido").max(500),
  steps: z.array(z.string().min(1)).min(1, "Agrega al menos un paso"),
  requiredData: z.array(z.string().min(1)),
  completionCriteria: z.string().max(500),
})

export const AgentPersonalidadSchema = z.object({
  internalName: z.string().min(1, "El nombre es requerido").max(80),
  presentation: z.string().max(1000),
  language: z.enum(AGENT_LANGUAGES),
  tone: z.enum(AGENT_TONES),
  responseLength: z.enum(AGENT_RESPONSE_LENGTHS),
})

export const AgentFaqItemSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(2000),
})

export const AgentConocimientoSchema = z.object({
  faq: z.array(AgentFaqItemSchema),
  knowledgeSourceIds: z.array(z.string().uuid()),
})

export const AgentActionConfigSchema = z.object({
  enabled: z.boolean(),
  allowedResources: z.array(z.string()).optional(),
})

export const AgentAccionesSchema = z.object({
  actions: z.record(z.string(), AgentActionConfigSchema),
})

export const AgentScheduleSchema = z.object({
  timezone: z.string(),
  enabled: z.boolean(),
  hours: z.record(z.string(), z.object({ from: z.string(), to: z.string() })).optional(),
})

export const AgentReglasSchema = z.object({
  prohibitions: z.array(z.string()),
  transferRule: z.string().max(500).optional(),
  schedule: AgentScheduleSchema.optional(),
  inactivityTimeoutMinutes: z.number().int().min(1).max(10080),
  maxMessagesPerConversation: z.number().int().min(1).max(500),
})

export const AgentDespliegueSchema = z.object({
  phoneNumberId: z.string().uuid().optional(),
  isDefault: z.boolean(),
  campaignIds: z.array(z.string().uuid()),
})

export const AgentConfigSchema = z.object({
  objetivo: AgentObjetivoSchema,
  personalidad: AgentPersonalidadSchema,
  conocimiento: AgentConocimientoSchema,
  acciones: AgentAccionesSchema,
  reglas: AgentReglasSchema,
  despliegue: AgentDespliegueSchema,
})

export const SaveAgentDraftSchema = z.object({
  agentId: z.string().uuid(),
  config: AgentConfigSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})
export type SaveAgentDraftInput = z.infer<typeof SaveAgentDraftSchema>

export const CreateAgentFromTemplateSchema = z.object({
  templateId: z.enum(AGENT_TEMPLATES),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})
export type CreateAgentFromTemplateInput = z.infer<typeof CreateAgentFromTemplateSchema>

export const DuplicateAgentSchema = z.object({
  sourceAgentId: z.string().uuid(),
  name: z.string().min(1).max(100),
})
export type DuplicateAgentInput = z.infer<typeof DuplicateAgentSchema>

export const ArchiveAgentSchema = z.object({
  agentId: z.string().uuid(),
})
export type ArchiveAgentInput = z.infer<typeof ArchiveAgentSchema>

export const PublishAgentConfigSchema = z.object({
  agentId: z.string().uuid(),
})
export type PublishAgentConfigInput = z.infer<typeof PublishAgentConfigSchema>
