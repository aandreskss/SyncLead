import "server-only"

import OpenAI from "openai"
import type {
  LLMProvider,
  LLMChatParams,
  LLMResponse,
  LLMContentBlock,
  LLMMessage,
} from "./provider"

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai"
  private readonly client: OpenAI
  private readonly apiKeyMissing: boolean

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      this.apiKeyMissing = true
      this.client = new OpenAI({ apiKey: "placeholder" })
    } else {
      this.apiKeyMissing = false
      this.client = new OpenAI({ apiKey })
    }
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    if (this.apiKeyMissing) throw new Error("OPENAI_API_KEY not configured")

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: params.systemPrompt },
      ...params.messages.map(toOpenAIMessage),
    ]

    const tools: OpenAI.Chat.ChatCompletionTool[] = params.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))

    let abortController: AbortController | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (params.timeoutMs && params.timeoutMs > 0) {
      abortController = new AbortController()
      timeoutId = setTimeout(() => abortController!.abort(), params.timeoutMs)
    }

    try {
      const res = await this.client.chat.completions.create(
        {
          model: params.model,
          messages,
          max_tokens: params.maxTokens,
          ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
        },
        { signal: abortController?.signal }
      )

      const choice = res.choices[0]
      const content: LLMContentBlock[] = []

      if (choice.message.content) {
        content.push({ type: "text", text: choice.message.content })
      }

      for (const tc of choice.message.tool_calls ?? []) {
        const fn = (tc as { id: string; function: { name: string; arguments: string } }).function
        let input: Record<string, unknown> = {}
        try { input = JSON.parse(fn.arguments) } catch { /* malformed args */ }
        content.push({ type: "tool_use", id: tc.id, name: fn.name, input })
      }

      let stopReason: LLMResponse["stopReason"]
      switch (choice.finish_reason) {
        case "stop":        stopReason = "end_turn"; break
        case "tool_calls":  stopReason = "tool_use"; break
        case "length":      stopReason = "max_tokens"; break
        default:            stopReason = "error"
      }

      return {
        stopReason,
        content,
        usage: {
          inputTokens: res.usage?.prompt_tokens ?? 0,
          outputTokens: res.usage?.completion_tokens ?? 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      }
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }
}

function toOpenAIMessage(msg: LLMMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (typeof msg.content === "string") {
    return { role: msg.role, content: msg.content }
  }

  // Reconstruct tool_calls / tool_result messages
  const toolCalls = msg.content.filter((b) => b.type === "tool_use")
  const toolResults = msg.content.filter((b) => b.type === "tool_result")
  const textBlocks = msg.content.filter((b) => b.type === "text")

  if (toolResults.length > 0 && msg.role === "user") {
    // OpenAI expects separate "tool" role messages per result
    // Return the first one; callers should split if needed (engine sends one at a time)
    const r = toolResults[0]
    if (r.type === "tool_result") {
      return { role: "tool", tool_call_id: r.tool_use_id, content: r.content }
    }
  }

  if (toolCalls.length > 0 && msg.role === "assistant") {
    return {
      role: "assistant",
      content: textBlocks.map((b) => (b.type === "text" ? b.text : "")).join("") || null,
      tool_calls: toolCalls.map((b) => {
        if (b.type !== "tool_use") return null!
        return {
          id: b.id,
          type: "function" as const,
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }
      }),
    }
  }

  return {
    role: msg.role,
    content: textBlocks.map((b) => (b.type === "text" ? b.text : "")).join(""),
  }
}
