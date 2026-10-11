import "server-only"

import { AnthropicProvider } from "./anthropic"

// Singleton default provider instance
export const defaultProvider = new AnthropicProvider()

// Re-export types for callers
export type { LLMProvider, LLMMessage, LLMTool, LLMResponse, LLMStopReason, LLMChatParams } from "./provider"
