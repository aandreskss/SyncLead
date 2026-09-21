"use client"

import { useState } from "react"
import { CheckCircle2, XCircle, FlaskConical, X } from "lucide-react"

interface NormalizedResult {
  name: string
  phone: string | null
  email: string | null
  city: string
  negocioNormalized: string | null
  cityCanonical: string | null
  utmSource: string | null
  utmCampaign: string | null
}

interface ValidationResponse {
  valid: boolean
  normalized?: NormalizedResult
  campaignId?: string
  errors?: { field: string; message: string }[]
}

interface Props {
  apiKey: string
  appUrl: string
}

const FIELD_LABEL: Record<string, string> = {
  name: "Nombre",
  phone: "Teléfono",
  email: "Email",
  city: "Ciudad",
  negocioNormalized: "Negocio (normalizado)",
  cityCanonical: "Ciudad (canónica)",
  utmSource: "UTM Source",
  utmCampaign: "UTM Campaign",
}

export function TestIngestButton({ apiKey, appUrl }: Props) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<ValidationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", negocio: "" })

  async function handleTest() {
    if (!form.name.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const payload: Record<string, string> = { name: form.name }
      if (form.phone.trim()) payload.phone = form.phone
      if (form.email.trim()) payload.email = form.email
      if (form.city.trim()) payload.city = form.city
      if (form.negocio.trim()) payload.negocio = form.negocio

      const res = await fetch(`${appUrl}/api/ingest/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Campaign-Key": apiKey,
        },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as ValidationResponse
      setResult(data)
    } catch {
      setResult({ valid: false, errors: [{ field: "_network", message: "Error de red — verifica la consola" }] })
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-ops-blue-t hover:text-ops-tx transition-colors"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        Probar integración
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-ops-blue/30 bg-ops-blue/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-ops-blue-t" />
          <p className="text-sm font-medium text-ops-tx">Probar integración</p>
        </div>
        <button onClick={() => { setOpen(false); setResult(null) }} className="text-ops-tx3 hover:text-ops-tx">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-ops-tx3">
        Valida el payload sin guardar datos. Verifica que la autenticación y el esquema son correctos.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {(["name", "phone", "email", "city", "negocio"] as const).map((field) => (
          <div key={field} className={field === "name" ? "col-span-2" : ""}>
            <label className="block text-[10px] uppercase text-ops-tx3 mb-1">
              {FIELD_LABEL[field] ?? field}{field === "name" && " *"}
            </label>
            <input
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              placeholder={field === "name" ? "Ej: Juan Pérez" : field === "phone" ? "+58 412 1234567" : ""}
              className="w-full rounded border border-ops-bd bg-ops-s2 px-2 py-1.5 text-xs text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue/60"
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleTest}
        disabled={!form.name.trim() || loading}
        className="w-full rounded py-2 text-xs font-medium bg-ops-blue text-white disabled:opacity-50 hover:bg-ops-blue/80 transition-colors"
      >
        {loading ? "Validando…" : "Validar payload"}
      </button>

      {result && (
        <div className={`rounded border p-3 space-y-2 ${result.valid ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
          <div className="flex items-center gap-1.5">
            {result.valid
              ? <CheckCircle2 className="h-4 w-4 text-green-400" />
              : <XCircle className="h-4 w-4 text-red-400" />
            }
            <span className={`text-xs font-medium ${result.valid ? "text-green-400" : "text-red-400"}`}>
              {result.valid ? "Payload válido — integración correcta" : "Payload inválido"}
            </span>
          </div>

          {result.valid && result.normalized && (
            <div className="space-y-1">
              {Object.entries(result.normalized)
                .filter(([, v]) => v !== null && v !== "" && v !== undefined)
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-[11px]">
                    <span className="text-ops-tx3 w-32 flex-shrink-0">{FIELD_LABEL[k] ?? k}</span>
                    <span className="text-ops-tx font-mono">{String(v)}</span>
                  </div>
                ))
              }
            </div>
          )}

          {!result.valid && result.errors && (
            <ul className="space-y-1">
              {result.errors.map((e, i) => (
                <li key={i} className="text-xs text-red-300">
                  <span className="font-mono text-red-400">{e.field}:</span> {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
