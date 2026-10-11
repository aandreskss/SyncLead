"use client"

import { useState, useTransition } from "react"
import { CheckCircle, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react"
import {
  saveProviderKeyAction,
  deleteProviderKeyAction,
} from "@/domains/ai-agents/provider-keys-actions"
import type { ProviderName } from "@/domains/ai-agents/provider-keys-repository"

interface ProviderDef {
  id: ProviderName
  name: string
  logo: string
  models: string[]
  placeholder: string
  docsUrl: string
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    logo: "🤖",
    models: ["Claude Sonnet 4.6", "Claude Haiku 4.5", "Claude Opus 4.7"],
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/account/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    logo: "🧠",
    models: ["GPT-4o", "GPT-4o Mini", "O1 Mini"],
    placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    name: "Google Gemini",
    logo: "✨",
    models: ["Gemini 2.0 Flash", "Gemini 1.5 Pro", "Gemini 1.5 Flash"],
    placeholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
]

interface Props {
  configured: ProviderName[]
}

export function AiProvidersView({ configured }: Props) {
  const [configuredSet, setConfiguredSet] = useState<Set<ProviderName>>(
    new Set(configured)
  )
  const [inputs, setInputs] = useState<Record<ProviderName, string>>({
    anthropic: "",
    openai: "",
    google: "",
  })
  const [showKey, setShowKey] = useState<Record<ProviderName, boolean>>({
    anthropic: false,
    openai: false,
    google: false,
  })
  const [errors, setErrors] = useState<Record<ProviderName, string>>({
    anthropic: "",
    openai: "",
    google: "",
  })
  const [success, setSuccess] = useState<Record<ProviderName, boolean>>({
    anthropic: false,
    openai: false,
    google: false,
  })
  const [isPending, startTransition] = useTransition()

  function handleInput(provider: ProviderName, value: string) {
    setInputs(prev => ({ ...prev, [provider]: value }))
    setErrors(prev => ({ ...prev, [provider]: "" }))
    setSuccess(prev => ({ ...prev, [provider]: false }))
  }

  function handleSave(provider: ProviderName) {
    startTransition(async () => {
      try {
        const result = await saveProviderKeyAction(provider, inputs[provider])
        if (result.success) {
          setConfiguredSet(prev => new Set([...prev, provider]))
          setInputs(prev => ({ ...prev, [provider]: "" }))
          setSuccess(prev => ({ ...prev, [provider]: true }))
          setTimeout(() => setSuccess(prev => ({ ...prev, [provider]: false })), 3000)
        } else {
          setErrors(prev => ({ ...prev, [provider]: result.error ?? "Error" }))
        }
      } catch {
        setErrors(prev => ({ ...prev, [provider]: "Error inesperado" }))
      }
    })
  }

  function handleDelete(provider: ProviderName) {
    startTransition(async () => {
      try {
        const result = await deleteProviderKeyAction(provider)
        if (result.success) {
          setConfiguredSet(prev => {
            const next = new Set(prev)
            next.delete(provider)
            return next
          })
        }
      } catch { /* silent */ }
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-ops-blue">
          CONFIGURACIÓN
        </p>
        <h1 className="text-2xl font-bold text-ops-tx">Proveedores de IA</h1>
        <p className="text-sm text-ops-tx3">
          Ingresa tus propias API keys para cada proveedor. Las claves se cifran con AES-256-GCM
          antes de guardarse. Si no hay clave configurada para un proveedor, se usa la variable
          de entorno del servidor.
        </p>
      </div>

      {/* Provider cards */}
      <div className="space-y-4">
        {PROVIDERS.map(p => {
          const isConfigured = configuredSet.has(p.id)
          return (
            <div
              key={p.id}
              className="rounded-2xl border border-ops-line bg-ops-bg shadow-ops-card"
            >
              {/* Card header */}
              <div className="flex items-center gap-3 border-b border-ops-line px-5 py-4">
                <span className="text-2xl" aria-hidden>{p.logo}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-ops-tx">{p.name}</h2>
                    {isConfigured ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                        <CheckCircle className="h-3 w-3" />
                        Configurado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-ops-hover px-2 py-0.5 text-[11px] font-medium text-ops-tx3">
                        Sin configurar
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-ops-tx3">
                    Modelos: {p.models.join(", ")}
                  </p>
                </div>
                {isConfigured && (
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    disabled={isPending}
                    title="Eliminar clave"
                    className="rounded-full p-2 text-ops-tx3 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Key input */}
              <div className="px-5 py-4">
                <label className="mb-1.5 block text-xs font-medium text-ops-tx2">
                  API Key{" "}
                  <a
                    href={p.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ops-blue hover:underline"
                  >
                    (obtener clave ↗)
                  </a>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey[p.id] ? "text" : "password"}
                      value={inputs[p.id]}
                      onChange={e => handleInput(p.id, e.target.value)}
                      placeholder={isConfigured ? "••••••••••••••••••••" : p.placeholder}
                      className="w-full rounded-xl border border-ops-line bg-ops-s1 px-4 py-2.5 pr-10 text-sm text-ops-tx placeholder:text-ops-tx3 focus:border-ops-blue focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ops-tx3 hover:text-ops-tx2"
                      tabIndex={-1}
                    >
                      {showKey[p.id]
                        ? <EyeOff className="h-4 w-4" />
                        : <Eye className="h-4 w-4" />
                      }
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSave(p.id)}
                    disabled={isPending || !inputs[p.id].trim()}
                    className="flex items-center gap-2 rounded-full bg-ops-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                  >
                    <KeyRound className="h-4 w-4" />
                    Guardar
                  </button>
                </div>

                {errors[p.id] && (
                  <p className="mt-1.5 text-xs text-red-600">{errors[p.id]}</p>
                )}
                {success[p.id] && (
                  <p className="mt-1.5 text-xs text-green-600">
                    ✓ Clave guardada correctamente.
                  </p>
                )}
                {isConfigured && !inputs[p.id] && (
                  <p className="mt-1.5 text-xs text-ops-tx3">
                    Ya hay una clave guardada. Ingresa una nueva para reemplazarla.
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Info box */}
      <div className="rounded-2xl border border-ops-line bg-ops-s1 px-5 py-4 text-xs text-ops-tx3 space-y-1">
        <p className="font-semibold text-ops-tx2">¿Cómo funciona?</p>
        <ul className="ml-3 list-disc space-y-0.5">
          <li>Las claves se cifran con AES-256-GCM antes de guardarse en la base de datos.</li>
          <li>
            Cuando un agente IA responde, el sistema usa primero la clave guardada aquí.
            Si no hay una para ese proveedor, usa la variable de entorno del servidor.
          </li>
          <li>Al eliminar una clave, el sistema vuelve a usar la variable de entorno.</li>
          <li>La clave nunca se muestra tras guardarse — solo puedes reemplazarla o eliminarla.</li>
        </ul>
      </div>
    </div>
  )
}
