"use client"

import { Panel, opsField } from "@/components/app/ops"
import type { AgentPersonalidadConfig, AgentLanguage, AgentTone, AgentResponseLength, AgentLlmProvider } from "@/domains/ai-agents/types"
import { AGENT_LANGUAGES, AGENT_TONES, AGENT_RESPONSE_LENGTHS, AGENT_LLM_PROVIDERS, LLM_MODELS, DEFAULT_LLM_MODEL } from "@/domains/ai-agents/types"
import { cn } from "@/lib/utils"

interface Props {
  config: AgentPersonalidadConfig
  onChange: (v: AgentPersonalidadConfig) => void
  readOnly: boolean
}

const PROVIDER_LABELS: Record<AgentLlmProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai:    "OpenAI (GPT)",
  google:    "Google (Gemini)",
}

const LANGUAGE_LABELS: Record<AgentLanguage, string> = { es: "Español", en: "English", pt: "Português" }
const TONE_LABELS: Record<AgentTone, string> = {
  formal: "Formal",
  friendly: "Amigable",
  neutral: "Neutral",
  empathetic: "Empático",
}
const LENGTH_LABELS: Record<AgentResponseLength, string> = {
  brief: "Breve",
  standard: "Estándar",
  detailed: "Detallado",
}

function RadioGroup<T extends string>({
  options,
  labels,
  value,
  onChange,
  readOnly,
  legend,
}: {
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (v: T) => void
  readOnly: boolean
  legend: string
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <label
            key={opt}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              value === opt
                ? "border-ops-blue bg-ops-blue-bg text-ops-blue font-medium"
                : "border-ops-bd text-ops-tx2 hover:border-ops-bd2",
              readOnly && "cursor-default"
            )}
          >
            <input
              type="radio"
              name={legend}
              value={opt}
              checked={value === opt}
              onChange={() => !readOnly && onChange(opt)}
              disabled={readOnly}
              className="sr-only"
            />
            {labels[opt]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function TabPersonalidad({ config, onChange, readOnly }: Props) {
  const currentProvider = config.llmProvider ?? "anthropic"
  const modelOptions = LLM_MODELS[currentProvider] ?? []

  function handleProviderChange(provider: AgentLlmProvider) {
    onChange({ ...config, llmProvider: provider, llmModel: DEFAULT_LLM_MODEL[provider] })
  }

  return (
    <div className="space-y-4">
      <Panel title="Modelo de IA" description="Proveedor y modelo que el agente usará para generar respuestas.">
        <div className="space-y-4 px-5 pb-5">
          <div>
            <p className="mb-2 text-xs font-medium text-ops-tx2">Proveedor</p>
            <RadioGroup
              options={AGENT_LLM_PROVIDERS}
              labels={PROVIDER_LABELS}
              value={currentProvider}
              onChange={handleProviderChange}
              readOnly={readOnly}
              legend="Proveedor de IA"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-ops-tx2">Modelo</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {modelOptions.map((m) => (
                <label
                  key={m.id}
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 transition-colors",
                    config.llmModel === m.id
                      ? "border-ops-blue bg-ops-blue-bg"
                      : "border-ops-bd hover:border-ops-bd2",
                    readOnly && "cursor-default"
                  )}
                >
                  <input
                    type="radio"
                    name="llmModel"
                    value={m.id}
                    checked={config.llmModel === m.id}
                    onChange={() => !readOnly && onChange({ ...config, llmModel: m.id })}
                    disabled={readOnly}
                    className="sr-only"
                  />
                  <span className={cn("text-sm font-medium", config.llmModel === m.id ? "text-ops-blue" : "text-ops-tx")}>
                    {m.label}
                  </span>
                  <span className="text-[11px] text-ops-tx3">{m.description}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Nombre interno" description="Identificador del agente (solo visible para tu equipo).">
        <div className="px-5 pb-5">
          <input
            value={config.internalName}
            onChange={e => onChange({ ...config, internalName: e.target.value })}
            readOnly={readOnly}
            placeholder="Ej: Asistente de calificación"
            className={opsField}
            aria-label="Nombre interno del agente"
          />
        </div>
      </Panel>

      <Panel title="Presentación" description="Primer mensaje que el agente envía para iniciar la conversación.">
        <div className="px-5 pb-5">
          <textarea
            value={config.presentation}
            onChange={e => onChange({ ...config, presentation: e.target.value })}
            readOnly={readOnly}
            placeholder="Ej: ¡Hola! Soy el asistente de {{nombre_empresa}}. ¿En qué te puedo ayudar?"
            rows={4}
            className={cn(opsField, "resize-none")}
            aria-label="Mensaje de presentación"
          />
          <p className="mt-1.5 text-xs text-ops-tx3">Puedes usar <code className="rounded bg-ops-s2 px-1">{"{{nombre_empresa}}"}</code> como variable dinámica.</p>
        </div>
      </Panel>

      <Panel title="Idioma" description="Idioma principal de la conversación.">
        <div className="px-5 pb-5">
          <RadioGroup
            options={AGENT_LANGUAGES}
            labels={LANGUAGE_LABELS}
            value={config.language}
            onChange={lang => onChange({ ...config, language: lang })}
            readOnly={readOnly}
            legend="Idioma"
          />
        </div>
      </Panel>

      <Panel title="Tono" description="Estilo de comunicación del agente.">
        <div className="px-5 pb-5">
          <RadioGroup
            options={AGENT_TONES}
            labels={TONE_LABELS}
            value={config.tone}
            onChange={tone => onChange({ ...config, tone })}
            readOnly={readOnly}
            legend="Tono"
          />
        </div>
      </Panel>

      <Panel title="Extensión de respuestas" description="Longitud habitual de los mensajes del agente.">
        <div className="px-5 pb-5">
          <RadioGroup
            options={AGENT_RESPONSE_LENGTHS}
            labels={LENGTH_LABELS}
            value={config.responseLength}
            onChange={responseLength => onChange({ ...config, responseLength })}
            readOnly={readOnly}
            legend="Extensión"
          />
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-ops-s2 p-3 text-center">
              <p className="text-xs font-medium text-ops-tx">Breve</p>
              <p className="mt-1 text-[11px] text-ops-tx3">1-2 frases. Rápido, directo.</p>
            </div>
            <div className="rounded-xl bg-ops-s2 p-3 text-center">
              <p className="text-xs font-medium text-ops-tx">Estándar</p>
              <p className="mt-1 text-[11px] text-ops-tx3">2-4 frases. Claro y completo.</p>
            </div>
            <div className="rounded-xl bg-ops-s2 p-3 text-center">
              <p className="text-xs font-medium text-ops-tx">Detallado</p>
              <p className="mt-1 text-[11px] text-ops-tx3">4+ frases. Explicación amplia.</p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
