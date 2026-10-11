import "server-only"

import { AnthropicProvider } from "./anthropic"
import { OpenAIProvider } from "./openai"
import { GeminiProvider } from "./gemini"
import type { LLMProvider } from "./provider"

export type LlmProviderName = "anthropic" | "openai" | "google"

export function createProvider(name: LlmProviderName): LLMProvider {
  switch (name) {
    case "openai":   return new OpenAIProvider()
    case "google":   return new GeminiProvider()
    default:         return new AnthropicProvider()
  }
}

// Singleton default (Anthropic) — used by legacy callers and tests
export const defaultProvider = new AnthropicProvider()

// Re-export types for callers
export type { LLMProvider, LLMMessage, LLMTool, LLMResponse, LLMStopReason, LLMChatParams } from "./provider"
