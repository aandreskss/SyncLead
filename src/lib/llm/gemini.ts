import "server-only"

import {
  GoogleGenerativeAI,
  type Content,
  type Tool,
  type FunctionDeclaration,
  type Part,
} from "@google/generative-ai"
import type {
  LLMProvider,
  LLMChatParams,
  LLMResponse,
  LLMContentBlock,
  LLMMessage,
} from "./provider"

export class GeminiProvider implements LLMProvider {
  readonly name = "google"
  private readonly genAI: GoogleGenerativeAI | null

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GOOGLE_AI_API_KEY
    this.genAI = key ? new GoogleGenerativeAI(key) : null
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    if (!this.genAI) throw new Error("GOOGLE_AI_API_KEY not configured")

    const model = this.genAI.getGenerativeModel({
      model: params.model,
      systemInstruction: params.systemPrompt,
    })

    const tools: Tool[] = params.tools.length > 0
      ? [{ functionDeclarations: params.tools.map(toGeminiFunctionDecl) }]
      : []

    const history: Content[] = []
    const messages = [...params.messages]

    // Last message is the new user turn; everything before is history
    const lastMsg = messages.pop()
    for (const msg of messages) {
      history.push(toGeminiContent(msg))
    }

    const chat = model.startChat({
      history,
      ...(tools.length > 0 ? { tools } : {}),
    })

    const userParts: Part[] = lastMsg
      ? typeof lastMsg.content === "string"
        ? [{ text: lastMsg.content }]
        : lastMsg.content.flatMap((b): Part[] => {
            if (b.type === "text") return [{ text: b.text }]
            if (b.type === "tool_result")
              return [{ functionResponse: { name: b.tool_use_id, response: { result: b.content } } }]
            return []
          })
      : [{ text: "" }]

    let abortController: AbortController | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (params.timeoutMs && params.timeoutMs > 0) {
      abortController = new AbortController()
      timeoutId = setTimeout(() => abortController!.abort(), params.timeoutMs)
    }

    try {
      const res = await chat.sendMessage(userParts)
      const candidate = res.response.candidates?.[0]
      if (!candidate) throw new Error("Gemini returned no candidates")

      const content: LLMContentBlock[] = []
      for (const part of candidate.content.parts ?? []) {
        if (part.text) {
          content.push({ type: "text", text: part.text })
        } else if (part.functionCall) {
          content.push({
            type: "tool_use",
            id: part.functionCall.name,
            name: part.functionCall.name,
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          })
        }
      }

      const finishReason = candidate.finishReason
      let stopReason: LLMResponse["stopReason"]
      if (finishReason === "STOP") stopReason = "end_turn"
      else if (finishReason === "MAX_TOKENS") stopReason = "max_tokens"
      else if (content.some((b) => b.type === "tool_use")) stopReason = "tool_use"
      else stopReason = "end_turn"

      const usage = res.response.usageMetadata
      return {
        stopReason,
        content,
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      }
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }
}

function toGeminiContent(msg: LLMMessage): Content {
  const role = msg.role === "assistant" ? "model" : "user"
  if (typeof msg.content === "string") {
    return { role, parts: [{ text: msg.content }] }
  }
  const parts: Part[] = msg.content.flatMap((b): Part[] => {
    if (b.type === "text") return [{ text: b.text }]
    if (b.type === "tool_use")
      return [{ functionCall: { name: b.name, args: b.input } }]
    if (b.type === "tool_result")
      return [{ functionResponse: { name: b.tool_use_id, response: { result: b.content } } }]
    return []
  })
  return { role, parts }
}

function toGeminiFunctionDecl(t: { name: string; description: string; input_schema: Record<string, unknown> }): FunctionDeclaration {
  return {
    name: t.name,
    description: t.description,
    parameters: t.input_schema as unknown as FunctionDeclaration["parameters"],
  }
}
