"use client"

import { useState, useTransition, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  listIngestionCredentialsAction,
  createIngestionCredentialAction,
  revokeIngestionCredentialAction,
  type IngestionCredentialPublic,
} from "@/domains/campaigns/actions"
import {
  Copy, Check, Plus, ShieldAlert, Globe, Server,
  Loader2, AlertTriangle, CheckCircle2, XCircle, Key,
} from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  campaignName: string
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded border border-ops-bd bg-ops-s2 px-3 py-1.5 text-xs font-medium text-ops-tx2 hover:bg-ops-sel transition-colors shrink-0"
    >
      {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" />Copiado</> : <><Copy className="h-3.5 w-3.5" />Copiar</>}
    </button>
  )
}

function TokenRevealDialog({
  token,
  type,
  onDone,
}: {
  token: string
  type: "public_form" | "server_secret"
  onDone: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="space-y-4">
      <div className="rounded border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300 flex gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          <strong className="text-amber-200">Copia este token ahora.</strong> No podrás verlo de nuevo una vez que cierres este diálogo — solo guardamos su hash.
        </p>
      </div>

      <div>
        <p className="text-xs text-ops-tx3 mb-1.5">
          {type === "public_form"
            ? "Token público (pub_xxx) — seguro en código del navegador"
            : "Token de servidor (slk_xxx) — NUNCA en código del navegador"}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded border border-ops-bd bg-ops-bg px-3 py-2 text-xs font-mono text-emerald-400 break-all select-all">
            {token}
          </code>
          <CopyBtn text={token} />
        </div>
      </div>

      {type === "public_form" && (
        <div className="rounded border border-ops-bd bg-ops-s2 px-3 py-2.5 text-xs text-ops-tx3 space-y-1">
          <p className="text-ops-tx2 font-medium text-xs">Uso en el Pixel Universal:</p>
          <code className="block text-indigo-300 select-all">
            {`<script src="${typeof window !== "undefined" ? window.location.origin : "https://app.synclead.io"}/pixel.js" data-token="${token}" async></script>`}
          </code>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <input
          id="confirm-copied"
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="h-3.5 w-3.5 rounded accent-indigo-500"
        />
        <label htmlFor="confirm-copied" className="text-xs text-ops-tx2 cursor-pointer">
          Ya lo copié y lo guardé en un lugar seguro
        </label>
      </div>

      <button
        onClick={onDone}
        disabled={!confirmed}
        className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white transition-colors"
      >
        Listo
      </button>
    </div>
  )
}

function CredentialRow({
  cred,
  campaignId,
  onRevoked,
}: {
  cred: IngestionCredentialPublic
  campaignId: string
  onRevoked: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startRevoke] = useTransition()

  function handleRevoke() {
    startRevoke(async () => {
      await revokeIngestionCredentialAction(cred.id, campaignId)
      setConfirming(false)
      onRevoked()
    })
  }

  const isActive = cred.status === "active"
  const date = new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(cred.createdAt)
  )

  return (
    <div className={`flex items-center gap-3 rounded border px-3 py-2.5 ${isActive ? "border-ops-bd bg-ops-s2" : "border-ops-line bg-ops-bg opacity-60"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-ops-tx2">{cred.keyPrefix}…</code>
          {isActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-700/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />Activa
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-ops-tx3">
              <XCircle className="h-2.5 w-2.5" />Revocada
            </span>
          )}
        </div>
        <p className="text-[11px] text-ops-tx3 mt-0.5">Creada {date}</p>
      </div>

      {isActive && (
        confirming ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <p className="text-[11px] text-ops-amber">¿Confirmar?</p>
            <button
              onClick={handleRevoke}
              disabled={pending}
              className="text-[11px] px-2 py-1 rounded bg-ops-coral text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sí"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-[11px] px-2 py-1 rounded border border-ops-bd text-ops-tx2 hover:bg-ops-sel transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-[11px] px-2 py-1 rounded border border-ops-bd text-ops-tx3 hover:text-ops-coral hover:border-ops-coral/50 transition-colors shrink-0"
          >
            Revocar
          </button>
        )
      )}
    </div>
  )
}

type CredType = "public_form" | "server_secret"

function CredentialSection({
  type,
  campaignId,
  credentials,
  onRefresh,
}: {
  type: CredType
  campaignId: string
  credentials: IngestionCredentialPublic[]
  onRefresh: () => void
}) {
  const [creating, startCreate] = useTransition()
  const [newToken, setNewToken] = useState<string | null>(null)
  const [createError, setCreateError] = useState("")

  const isPublic = type === "public_form"
  const label = isPublic ? "Pixel / Formulario (pub_xxx)" : "Servidor a servidor (slk_xxx)"
  const Icon = isPublic ? Globe : Server
  const activeCreds = credentials.filter((c) => c.status === "active")

  function handleCreate() {
    setCreateError("")
    startCreate(async () => {
      const r = await createIngestionCredentialAction(campaignId, type)
      if (r.error) { setCreateError("No se pudo crear la credencial."); return }
      if (r.token) setNewToken(r.token)
      onRefresh()
    })
  }

  if (newToken) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ops-tx">
          <Icon className="h-4 w-4 text-ops-tx3" />
          {label}
        </div>
        <TokenRevealDialog
          token={newToken}
          type={type}
          onDone={() => setNewToken(null)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-ops-tx">
          <Icon className="h-4 w-4 text-ops-tx3" />
          {label}
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 rounded border border-ops-bd bg-ops-s2 px-2.5 py-1.5 text-xs text-ops-tx2 hover:bg-ops-sel transition-colors disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Nueva credencial
        </button>
      </div>

      {createError && (
        <p className="text-xs text-ops-coral flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />{createError}
        </p>
      )}

      {isPublic && (
        <div className="rounded border border-ops-bd bg-ops-s2/60 px-3 py-2 text-xs text-ops-tx3 space-y-0.5">
          <p>Seguro en HTML/JS del navegador. Úsalo con el <strong className="text-ops-tx2">Pixel Universal</strong>:</p>
          <code className="text-indigo-300 block">
            {`<script src="/pixel.js" data-token="pub_xxx..." async></script>`}
          </code>
        </div>
      )}
      {!isPublic && (
        <div className="rounded border border-amber-700/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-400/80">
          Nunca pongas este token en código del navegador. Solo en variables de entorno del servidor.
        </div>
      )}

      {credentials.length === 0 ? (
        <p className="text-xs text-ops-tx3 py-2 text-center">Sin credenciales — crea una con el botón de arriba.</p>
      ) : (
        <div className="space-y-1.5">
          {credentials.map((c) => (
            <CredentialRow key={c.id} cred={c} campaignId={campaignId} onRevoked={onRefresh} />
          ))}
          {activeCreds.length === 0 && (
            <p className="text-xs text-ops-amber py-1">Todas las credenciales están revocadas. Crea una nueva.</p>
          )}
        </div>
      )}
    </div>
  )
}

export function CredentialsModal({ open, onOpenChange, campaignId, campaignName }: Props) {
  const router = useRouter()
  const [credentials, setCredentials] = useState<IngestionCredentialPublic[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const r = await listIngestionCredentialsAction(campaignId)
    if (r.data) setCredentials(r.data)
    setLoading(false)
    router.refresh()
  }, [campaignId, router])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const pubCreds = credentials.filter((c) => c.type === "public_form")
  const svrCreds = credentials.filter((c) => c.type === "server_secret")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4 text-ops-tx3" />
            Credenciales — {campaignName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-ops-tx3" />
          </div>
        ) : (
          <div className="space-y-6 pt-1">
            <CredentialSection
              type="public_form"
              campaignId={campaignId}
              credentials={pubCreds}
              onRefresh={refresh}
            />

            <div className="border-t border-ops-line" />

            <CredentialSection
              type="server_secret"
              campaignId={campaignId}
              credentials={svrCreds}
              onRefresh={refresh}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
