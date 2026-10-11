import "server-only"

// ─── Content block types ──────────────────────────────────────────────────────

export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }

// ─── Message type ─────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "user" | "assistant"
  content: string | LLMContentBlock[]
}

// ─── Tool definition ──────────────────────────────────────────────────────────

export interface LLMTool {
  name: string
  description: string
  input_schema: {
    type: "object"
    properties: Record<string, unknown>
    required: string[]
  }
}

// ─── Usage ────────────────────────────────────────────────────────────────────

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number  // tokens read from prompt cache (cheaper than input)
  cacheWriteTokens?: number // tokens written to prompt cache (more expensive than input)
}

// ─── Stop reason ─────────────────────────────────────────────────────────────

export type LLMStopReason = "end_turn" | "tool_use" | "max_tokens" | "error"

// ─── Response ─────────────────────────────────────────────────────────────────

export interface LLMResponse {
  stopReason: LLMStopReason
  content: LLMContentBlock[]
  usage: LLMUsage
}

// ─── Chat params ──────────────────────────────────────────────────────────────

export interface LLMChatParams {
  model: string
  systemPrompt: string
  messages: LLMMessage[]
  tools: LLMTool[]
  maxTokens: number
  timeoutMs?: number
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface LLMProvider {
  chat(params: LLMChatParams): Promise<LLMResponse>
  name: string
}
