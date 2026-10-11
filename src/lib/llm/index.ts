import "server-only"

import { AnthropicProvider } from "./anthropic"
import { OpenAIProvider } from "./openai"
import { GeminiProvider } from "./gemini"
import type { LLMProvider } from "./provider"

export type LlmProviderName = "anthropic" | "openai" | "google"

export function createProvider(name: LlmProviderName, apiKey?: string): LLMProvider {
  switch (name) {
    case "openai":   return new OpenAIProvider(apiKey)
    case "google":   return new GeminiProvider(apiKey)
    default:         return new AnthropicProvider(apiKey)
  }
}

// Singleton default (Anthropic) — used by legacy callers and tests
export const defaultProvider = new AnthropicProvider()

// Re-export types for callers
export type { LLMProvider, LLMMessage, LLMTool, LLMResponse, LLMStopReason, LLMChatParams } from "./provider"
