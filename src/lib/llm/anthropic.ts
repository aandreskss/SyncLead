import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import type {
  LLMProvider,
  LLMChatParams,
  LLMResponse,
  LLMContentBlock,
  LLMMessage,
} from "./provider"

// ─── Anthropic provider ───────────────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic"
  private readonly client: Anthropic
  private readonly apiKeyMissing: boolean

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!key) {
      this.apiKeyMissing = true
      this.client = new Anthropic({ apiKey: "placeholder" })
    } else {
      this.apiKeyMissing = false
      this.client = new Anthropic({ apiKey: key })
    }
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    if (this.apiKeyMissing) {
      throw new Error("ANTHROPIC_API_KEY not configured")
    }

    // Build Anthropic MessageParam[] from LLMMessage[]
    const messages: Anthropic.MessageParam[] = params.messages.map((msg) =>
      buildAnthropicMessage(msg)
    )

    // Build request options
    const requestOptions: Anthropic.MessageCreateParamsNonStreaming = {
      model: params.model,
      system: params.systemPrompt,
      messages,
      max_tokens: params.maxTokens,
    }

    // Attach tools only when the caller provides them
    if (params.tools.length > 0) {
      requestOptions.tools = params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }))
      requestOptions.tool_choice = {
        type: "auto",
        disable_parallel_tool_use: true,
      }
    }

    // Optional timeout via AbortController
    let abortController: AbortController | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (params.timeoutMs !== undefined && params.timeoutMs > 0) {
      abortController = new AbortController()
      timeoutId = setTimeout(() => abortController!.abort(), params.timeoutMs)
    }

    try {
      const response = await this.client.messages.create(requestOptions, {
        signal: abortController?.signal,
      })

      // Map content blocks
      const content: LLMContentBlock[] = response.content.map((block) => {
        if (block.type === "text") {
          return { type: "text", text: block.text }
        }
        if (block.type === "tool_use") {
          return {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          }
        }
        // Fallback for unknown block types — treat as text
        return { type: "text", text: JSON.stringify(block) }
      })

      // Map stop reason
      let stopReason: LLMResponse["stopReason"]
      switch (response.stop_reason) {
        case "end_turn":
          stopReason = "end_turn"
          break
        case "tool_use":
          stopReason = "tool_use"
          break
        case "max_tokens":
          stopReason = "max_tokens"
          break
        default:
          stopReason = "error"
      }

      return {
        stopReason,
        content,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
          cacheWriteTokens: (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
        },
      }
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }
}

// ─── Message mapping helpers ──────────────────────────────────────────────────

function buildAnthropicMessage(msg: LLMMessage): Anthropic.MessageParam {
  if (typeof msg.content === "string") {
    return { role: msg.role, content: msg.content }
  }

  const content: Anthropic.ContentBlockParam[] = msg.content.map((block) => {
    if (block.type === "text") {
      return { type: "text", text: block.text } as Anthropic.TextBlockParam
    }
    if (block.type === "tool_use") {
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      } as Anthropic.ToolUseBlockParam
    }
    if (block.type === "tool_result") {
      return {
        type: "tool_result",
        tool_use_id: block.tool_use_id,
        content: block.content,
        is_error: block.is_error,
      } as Anthropic.ToolResultBlockParam
    }
    // Unreachable, but TypeScript exhaustiveness safety
    const _exhaustive: never = block
    return { type: "text", text: "" } as Anthropic.TextBlockParam
  })

  return { role: msg.role, content }
}
