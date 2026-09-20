"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  saveMetaConnectionAction,
  testMetaConnectionAction,
  disconnectMetaConnectionAction,
  type MetaConnectionPublic,
} from "@/domains/meta/actions"
import { Plug, Unplug, RefreshCw, CheckCircle2, AlertCircle, Clock, Loader2 } from "lucide-react"

interface Props {
  clientId: string
  connections: MetaConnectionPublic[]
}

function StatusBadge({ status }: { status: MetaConnectionPublic["status"] }) {
  const map = {
    active: { label: "Activo", cls: "text-emerald-400 bg-emerald-400/10", dot: "bg-emerald-400" },
    error: { label: "Error", cls: "text-red-400 bg-red-400/10", dot: "bg-red-400" },
    expired: { label: "Expirado", cls: "text-amber-400 bg-amber-400/10", dot: "bg-amber-400" },
    pending: { label: "Pendiente", cls: "text-zinc-400 bg-zinc-700/50", dot: "bg-zinc-500" },
  }
  const s = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

function formatTs(d: Date | null): string {
  if (!d) return "—"
  return new Intl.DateTimeFormat("es", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(d))
}

function translateTestError(status: string): string {
  if (status === "invalid_token") return "Token inválido o revocado — regenera el token en Meta Business"
  if (status === "network_error") return "Error de red — Meta no respondió"
  if (status === "decrypt_error") return "Error interno al descifrar el token"
  if (status === "not_found") return "Conexión no encontrada"
  if (status === "no_credentials") return "Sin credenciales configuradas"
  // api_error:CODE — traducir códigos Meta comunes
  const match = status.match(/^api_error:(\d+)$/)
  if (match) {
    const code = Number(match[1])
    if (code === 100) return "Parámetro inválido (código 100) — verifica el Pixel ID"
    if (code === 200 || code === 273) return "Sin permiso CAPI en este Pixel (código " + code + ") — el token no tiene acceso de envío"
    if (code === 190) return "Token expirado (código 190)"
    if (code === 102) return "Token revocado (código 102)"
    return `Error de Meta API (código ${code}) — verifica permisos del token`
  }
  return status
}

function ConnectionCard({
  conn,
  clientId,
  onDone,
}: {
  conn: MetaConnectionPublic
  clientId: string
  onDone: () => void
}) {
  const [testPending, startTest] = useTransition()
  const [disconnectPending, startDisconnect] = useTransition()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  function handleTest() {
    setTestResult(null)
    startTest(async () => {
      const r = await testMetaConnectionAction(conn.id, clientId)
      if (r.sent) {
        setTestResult(`ok:Evento enviado correctamente`)
      } else {
        const label = translateTestError(r.status)
        setTestResult(`err:${label}`)
      }
      onDone()
    })
  }

  function handleDisconnect() {
    startDisconnect(async () => {
      await disconnectMetaConnectionAction(conn.id, clientId)
      setConfirmDisconnect(false)
      onDone()
    })
  }

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-zinc-200">{conn.pixelId ?? "—"}</span>
            <StatusBadge status={conn.status} />
          </div>
          {conn.datasetId && (
            <p className="text-xs text-zinc-500">Dataset: {conn.datasetId}</p>
          )}
          <p className="text-xs text-zinc-500">
            API: {conn.graphApiVersion} · Verificado: {formatTs(conn.lastVerifiedAt)}
          </p>
          {conn.lastError && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {translateTestError(conn.lastError)}
            </p>
          )}
          {conn.scopes.length > 0 && (
            <p className="text-xs text-zinc-600">
              Permisos: {conn.scopes.join(", ")}
            </p>
          )}
        </div>
      </div>

      {testResult && (
        <p className={`text-xs px-2 py-1 rounded ${testResult.startsWith("ok:") ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
          {testResult.startsWith("ok:") ? testResult.slice(3) : testResult.startsWith("err:") ? testResult.slice(4) : testResult}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleTest}
          disabled={testPending || disconnectPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors disabled:opacity-50"
        >
          {testPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Probar conexión
        </button>

        {confirmDisconnect ? (
          <>
            <button
              onClick={handleDisconnect}
              disabled={disconnectPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
            >
              {disconnectPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
              Confirmar desconexión
            </button>
            <button
              onClick={() => setConfirmDisconnect(false)}
              disabled={disconnectPending}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDisconnect(true)}
            disabled={testPending || disconnectPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-900/30 hover:text-red-400 text-zinc-500 transition-colors disabled:opacity-50"
          >
            <Unplug className="h-3.5 w-3.5" />
            Desconectar
          </button>
        )}
      </div>
    </div>
  )
}

function AddConnectionForm({
  clientId,
  onDone,
}: {
  clientId: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pixelId, setPixelId] = useState("")
  const [datasetId, setDatasetId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await saveMetaConnectionAction(clientId, pixelId, accessToken, datasetId || undefined)
      if (r.success) {
        setPixelId("")
        setDatasetId("")
        setAccessToken("")
        setOpen(false)
        onDone()
      } else {
        setError(r.error ?? "Error desconocido")
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
      >
        <Plug className="h-4 w-4" />
        Conectar Meta Pixel
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-zinc-200">Nueva conexión Meta</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Pixel ID *</label>
          <input
            type="text"
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="123456789012345"
            required
            className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Dataset ID (opcional)</label>
          <input
            type="text"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            placeholder="Mismo que Pixel ID"
            className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-zinc-400">Access Token *</label>
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="EAABcde..."
          required
          autoComplete="off"
          className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="text-xs text-zinc-600">
          El token se verifica y se almacena cifrado. Nunca se muestra de nuevo.
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {pending ? "Verificando…" : "Guardar y verificar"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={pending}
          className="text-sm px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function MetaConnectionPanel({ clientId, connections: initial }: Props) {
  const router = useRouter()
  const [connections, setConnections] = useState(initial)

  function refresh() {
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Meta Conversions API</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Las credenciales se almacenan cifradas (AES-256-GCM). El token nunca se muestra tras guardar.
          </p>
        </div>
      </div>

      {connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-zinc-800 rounded-xl">
          <Clock className="h-8 w-8 text-zinc-600 mb-3" />
          <p className="text-zinc-400 text-sm font-medium">Sin conexión Meta</p>
          <p className="text-zinc-600 text-xs mt-1">
            Conecta un Pixel para enviar eventos de conversión.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              conn={conn}
              clientId={clientId}
              onDone={refresh}
            />
          ))}
        </div>
      )}

      <AddConnectionForm clientId={clientId} onDone={refresh} />
    </div>
  )
}
