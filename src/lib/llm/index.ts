import "server-only"

import { AnthropicProvider } from "./anthropic"
import { OpenAIProvider } from "./openai"
import { GeminiProvider } from "./gemini"
import { DeepSeekProvider } from "./deepseek"
import { GroqProvider } from "./groq"
import { OpenRouterProvider } from "./openrouter"
import type { LLMProvider } from "./provider"

export type LlmProviderName = "anthropic" | "openai" | "google" | "deepseek" | "groq" | "openrouter"

export function createProvider(name: LlmProviderName, apiKey?: string): LLMProvider {
  switch (name) {
    case "openai":      return new OpenAIProvider(apiKey)
    case "google":      return new GeminiProvider(apiKey)
    case "deepseek":    return new DeepSeekProvider(apiKey)
    case "groq":        return new GroqProvider(apiKey)
    case "openrouter":  return new OpenRouterProvider(apiKey)
    default:            return new AnthropicProvider(apiKey)
  }
}

// Singleton default (Anthropic) — used by legacy callers and tests
export const defaultProvider = new AnthropicProvider()

// Re-export types for callers
export type { LLMProvider, LLMMessage, LLMTool, LLMResponse, LLMStopReason, LLMChatParams } from "./provider"
