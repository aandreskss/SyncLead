"use client"

import { useState, useRef, useEffect } from "react"
import { simulatorRunAction } from "@/domains/ai-agents/simulator-action"
import type { AgentConfig } from "@/domains/ai-agents/types"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimulatorMessage {
  role: "user" | "assistant"
  text: string
  timestamp: Date
  isTestMode?: boolean
}

interface SimulatorDebugInfo {
  toolsExecuted: Array<{ name: string; status: "success" | "error" }>
  stopReason: string
  estimatedCost: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    totalCostMillicents: number | null
    totalCostUsd: string
    pricingSource: string | null
  }
  modelUsed: string
}

interface Props {
  agent: {
    id: string
    name: string
    status: string
    model: string
    maxTokens: number
    agentConfig: AgentConfig
  }
  hasApiKey: boolean
  canRun: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SimulatorView({ agent, hasApiKey, canRun }: Props) {
  const [messages, setMessages] = useState<SimulatorMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isPending, setIsPending] = useState(false)
  const [debugInfo, setDebugInfo] = useState<SimulatorDebugInfo | null>(null)
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null)
  const [sessionId] = useState(() => crypto.randomUUID())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend() {
    const text = inputValue.trim()
    if (!text || isPending || !canRun) return

    setInputValue("")
    setIsPending(true)

    const userMessage: SimulatorMessage = {
      role: "user",
      text,
      timestamp: new Date(),
    }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)

    try {
      const result = await simulatorRunAction(
        agent.id,
        text,
        messages.map((m) => ({ role: m.role, text: m.text }))
      )

      if (result.success && result.reply) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: result.reply!,
            timestamp: new Date(),
            isTestMode: result.testMode === true,
          },
        ])
        if (result.debugInfo) {
          setDebugInfo(result.debugInfo)
        }
        if (typeof result.latencyMs === "number") {
          setLastLatencyMs(result.latencyMs)
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: result.error ?? "Error al procesar el mensaje.",
            timestamp: new Date(),
          },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Error de conexión. Por favor intenta de nuevo.",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsPending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-screen bg-white">
      {/* ── Chat Panel ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white">
          <div>
            <h1 className="text-base font-semibold text-gray-900">{agent.name}</h1>
            <p className="text-xs text-gray-500">
              Simulador &middot; {agent.model}
            </p>
          </div>
          <span className="ml-auto text-xs text-gray-400 font-mono">
            sess:{sessionId.slice(0, 8)}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Escribe un mensaje para comenzar la simulacion
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-[#F0684D] text-white rounded-br-sm"
                    : msg.isTestMode
                    ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-bl-sm"
                    : "bg-gray-100 text-gray-900 rounded-bl-sm"
                }`}
              >
                {msg.isTestMode && (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">
                    Modo de prueba — sin API key
                  </p>
                )}
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.role === "user"
                      ? "text-orange-100"
                      : msg.isTestMode
                      ? "text-amber-500"
                      : "text-gray-400"
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString("es", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}

          {isPending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5">
                <p className="text-sm text-gray-500 italic">Pensando...</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white">
          <div className="flex gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !canRun
                  ? "Simulador no disponible"
                  : "Escribe un mensaje (Enter para enviar, Shift+Enter para nueva linea)"
              }
              disabled={!canRun || isPending}
              rows={2}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F0684D]/30 focus:border-[#F0684D] disabled:opacity-50 disabled:bg-gray-50"
            />
            <button
              onClick={handleSend}
              disabled={!canRun || isPending || !inputValue.trim()}
              className="px-4 py-2 rounded-xl bg-[#F0684D] text-white text-sm font-medium hover:bg-[#e05a3f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>

      {/* ── Debug Panel ────────────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-gray-50 overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Panel de simulacion</h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* API Key warning */}
          {!hasApiKey && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700 font-medium">Sin API key</p>
              <p className="text-xs text-red-600 mt-1">
                Modo de prueba: sin API key configurada, el simulador no puede ejecutarse con IA
                real. Configura ANTHROPIC_API_KEY.
              </p>
            </div>
          )}

          {/* API Key present notice */}
          {hasApiKey && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs text-amber-800">
                El simulador usa la API real de Anthropic y consume creditos.
              </p>
            </div>
          )}

          {/* Archived agent */}
          {agent.status === "archived" && (
            <div className="rounded-lg bg-gray-100 border border-gray-200 p-3">
              <p className="text-xs text-gray-600">Este agente esta archivado y no puede simularse.</p>
            </div>
          )}

          {/* Sandbox badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              Sandbox
            </span>
            <p className="text-xs text-gray-500">No modifica leads reales ni envia WhatsApp</p>
          </div>

          {/* Agent info */}
          <div className="rounded-lg bg-white border border-gray-200 p-3 space-y-2">
            <p className="text-xs font-medium text-gray-700">Configuracion del agente</p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Modelo</span>
                <span className="text-xs font-mono text-gray-700">{agent.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Max tokens</span>
                <span className="text-xs font-mono text-gray-700">{agent.maxTokens}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Idioma</span>
                <span className="text-xs text-gray-700">
                  {agent.agentConfig.personalidad.language.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Tono</span>
                <span className="text-xs text-gray-700">{agent.agentConfig.personalidad.tone}</span>
              </div>
            </div>
          </div>

          {/* Debug info */}
          {debugInfo && (
            <div className="rounded-lg bg-white border border-gray-200 p-3 space-y-3">
              <p className="text-xs font-medium text-gray-700">Ultima ejecucion</p>

              {/* Stop reason */}
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Resultado</span>
                <span
                  className={`text-xs font-medium ${
                    debugInfo.stopReason === "end_turn"
                      ? "text-green-600"
                      : debugInfo.stopReason === "transfer"
                      ? "text-blue-600"
                      : debugInfo.stopReason === "error"
                      ? "text-red-600"
                      : "text-amber-600"
                  }`}
                >
                  {debugInfo.stopReason}
                </span>
              </div>

              {/* Model */}
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Modelo</span>
                <span className="text-xs font-mono text-gray-700">{debugInfo.modelUsed}</span>
              </div>

              {/* Tools executed */}
              {debugInfo.toolsExecuted.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Herramientas ejecutadas</p>
                  <div className="space-y-1">
                    {debugInfo.toolsExecuted.map((tool, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-xs font-mono text-gray-600">{tool.name}</span>
                        <span
                          className={`text-xs ${
                            tool.status === "success" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {tool.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cost estimation */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Costo estimado</p>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Tokens entrada</span>
                    <span className="text-xs font-mono text-gray-700">
                      {debugInfo.estimatedCost.inputTokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Tokens salida</span>
                    <span className="text-xs font-mono text-gray-700">
                      {debugInfo.estimatedCost.outputTokens.toLocaleString()}
                    </span>
                  </div>
                  {(debugInfo.estimatedCost.cacheReadTokens > 0 || debugInfo.estimatedCost.cacheWriteTokens > 0) && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">Cache lectura</span>
                        <span className="text-xs font-mono text-gray-700">
                          {debugInfo.estimatedCost.cacheReadTokens.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">Cache escritura</span>
                        <span className="text-xs font-mono text-gray-700">
                          {debugInfo.estimatedCost.cacheWriteTokens.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
                    <span className="text-xs text-gray-500">Costo USD</span>
                    <span className="text-xs font-mono font-medium text-gray-900">
                      {debugInfo.estimatedCost.totalCostUsd}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {debugInfo.estimatedCost.pricingSource
                      ? `Fuente: ${debugInfo.estimatedCost.pricingSource}`
                      : "Sin tier de precios configurado — costos no disponibles"}
                  </p>
                </div>
              </div>

              {/* Latency */}
              {lastLatencyMs !== null && (
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Latencia</span>
                  <span className="text-xs font-mono text-gray-700">{lastLatencyMs} ms</span>
                </div>
              )}
            </div>
          )}

          {/* Keyboard shortcut hint */}
          <p className="text-xs text-gray-400 text-center">
            Enter para enviar &middot; Shift+Enter para salto de linea
          </p>
        </div>
      </div>
    </div>
  )
}
