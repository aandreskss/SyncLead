"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  saveMetaConnectionAction,
  testMetaConnectionAction,
  disconnectMetaConnectionAction,
  updateMetaEventConfigAction,
  type MetaConnectionPublic,
} from "@/domains/meta/actions"
import { Plug, Unplug, RefreshCw, CheckCircle2, AlertCircle, Clock, Loader2 } from "lucide-react"

interface Props {
  clientId: string
  connections: MetaConnectionPublic[]
}

function StatusBadge({ status }: { status: MetaConnectionPublic["status"] }) {
  const map = {
    active: { label: "Activo", cls: "text-ops-green bg-emerald-400/10", dot: "bg-emerald-400" },
    error: { label: "Error", cls: "text-ops-coral bg-red-400/10", dot: "bg-red-400" },
    expired: { label: "Expirado", cls: "text-ops-amber bg-amber-400/10", dot: "bg-amber-400" },
    pending: { label: "Pendiente", cls: "text-ops-tx2 bg-ops-sel/50", dot: "bg-zinc-500" },
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
  const [configPending, startConfig] = useTransition()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [sendLeadEvents, setSendLeadEvents] = useState(conn.sendLeadEvents)
  const [sendContactEvents, setSendContactEvents] = useState(conn.sendContactEvents)

  function handleToggleLeadEvents(checked: boolean) {
    setSendLeadEvents(checked)
    startConfig(async () => {
      await updateMetaEventConfigAction(clientId, { sendLeadEvents: checked })
    })
  }

  function handleToggleContactEvents(checked: boolean) {
    setSendContactEvents(checked)
    startConfig(async () => {
      await updateMetaEventConfigAction(clientId, { sendContactEvents: checked })
    })
  }

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
    <div className="border border-ops-line rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-ops-tx">{conn.pixelId ?? "—"}</span>
            <StatusBadge status={conn.status} />
          </div>
          {conn.datasetId && (
            <p className="text-xs text-ops-tx3">Dataset: {conn.datasetId}</p>
          )}
          <p className="text-xs text-ops-tx3">
            API: {conn.graphApiVersion} · Verificado: {formatTs(conn.lastVerifiedAt)}
          </p>
          {conn.lastError && (
            <p className="text-xs text-ops-coral flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {translateTestError(conn.lastError)}
            </p>
          )}
          {conn.scopes.length > 0 && (
            <p className="text-xs text-ops-tx3">
              Permisos: {conn.scopes.join(", ")}
            </p>
          )}
        </div>
      </div>

      {testResult && (
        <p className={`text-xs px-2 py-1 rounded ${testResult.startsWith("ok:") ? "text-ops-green bg-emerald-400/10" : "text-ops-coral bg-red-400/10"}`}>
          {testResult.startsWith("ok:") ? testResult.slice(3) : testResult.startsWith("err:") ? testResult.slice(4) : testResult}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleTest}
          disabled={testPending || disconnectPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-ops-sel text-ops-tx transition-colors disabled:opacity-50"
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
              className="text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-ops-sel text-ops-tx2 transition-colors"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDisconnect(true)}
            disabled={testPending || disconnectPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-red-900/30 hover:text-ops-coral text-ops-tx3 transition-colors disabled:opacity-50"
          >
            <Unplug className="h-3.5 w-3.5" />
            Desconectar
          </button>
        )}
      </div>

      {/* Auto-event config */}
      <div className="border-t border-ops-line pt-3 space-y-2">
        <p className="text-xs text-ops-tx3 font-medium uppercase tracking-wider">Eventos automáticos</p>
        <label className={`flex items-center gap-2.5 cursor-pointer ${configPending ? "opacity-60" : ""}`}>
          <input
            type="checkbox"
            checked={sendLeadEvents}
            onChange={(e) => handleToggleLeadEvents(e.target.checked)}
            disabled={configPending}
            className="h-3.5 w-3.5 rounded accent-indigo-500"
          />
          <span className="text-xs text-ops-tx2">Enviar evento &ldquo;Lead&rdquo; al crear un lead</span>
        </label>
        <label className={`flex items-center gap-2.5 cursor-pointer ${configPending ? "opacity-60" : ""}`}>
          <input
            type="checkbox"
            checked={sendContactEvents}
            onChange={(e) => handleToggleContactEvents(e.target.checked)}
            disabled={configPending}
            className="h-3.5 w-3.5 rounded accent-indigo-500"
          />
          <span className="text-xs text-ops-tx2">Enviar evento &ldquo;Contact&rdquo; al contactar un lead</span>
        </label>
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
        className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-ops-blue hover:bg-ops-blue/90 text-white transition-colors"
      >
        <Plug className="h-4 w-4" />
        Conectar Meta Pixel
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ops-line rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium text-ops-tx">Nueva conexión Meta</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-ops-tx2">Pixel ID *</label>
          <input
            type="text"
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="123456789012345"
            required
            className="w-full text-sm bg-ops-s1 border border-ops-bd rounded-lg px-3 py-2 text-ops-tx placeholder-ops-tx3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-ops-tx2">Dataset ID (opcional)</label>
          <input
            type="text"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            placeholder="Mismo que Pixel ID"
            className="w-full text-sm bg-ops-s1 border border-ops-bd rounded-lg px-3 py-2 text-ops-tx placeholder-ops-tx3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-ops-tx2">Access Token *</label>
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="EAABcde..."
          required
          autoComplete="off"
          className="w-full text-sm bg-ops-s1 border border-ops-bd rounded-lg px-3 py-2 text-ops-tx placeholder-ops-tx3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="text-xs text-ops-tx3">
          El token se verifica y se almacena cifrado. Nunca se muestra de nuevo.
        </p>
      </div>

      {error && (
        <p className="text-xs text-ops-coral flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-ops-blue hover:bg-ops-blue/90 text-white transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {pending ? "Verificando…" : "Guardar y verificar"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={pending}
          className="text-sm px-4 py-2 rounded-lg bg-ops-s2 hover:bg-ops-sel text-ops-tx2 transition-colors"
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
          <h2 className="text-base font-semibold text-ops-tx">Meta Conversions API</h2>
          <p className="text-xs text-ops-tx3 mt-0.5">
            Las credenciales se almacenan cifradas (AES-256-GCM). El token nunca se muestra tras guardar.
          </p>
        </div>
      </div>

      {connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-ops-line rounded-lg">
          <Clock className="h-8 w-8 text-ops-tx3 mb-3" />
          <p className="text-ops-tx2 text-sm font-medium">Sin conexión Meta</p>
          <p className="text-ops-tx3 text-xs mt-1">
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
