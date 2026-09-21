"use client"

import { useState, useEffect, useTransition } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from "@/components/ui/sheet"
import {
  updateLeadTemperatureAction,
  updateLeadStageAction,
  updateLeadNotesAction,
  updateLeadInfoAction,
  fetchLeadDetailAction,
  deleteLeadsAction,
} from "@/domains/leads/actions"
import {
  registerSaleAction,
  retryCAPIAction,
  fetchConversionStatusAction,
  getAllConversionsByLeadAction,
  type ConversionStatusPublic,
  type ConversionSummary,
} from "@/domains/conversions/actions"
import {
  assignLeadAction,
  getLeadAssignmentAction,
  sendAssignmentEmailAction,
} from "@/domains/team/actions"
import type { AssignmentWithRep } from "@/domains/team/types"
import {
  prepareWaLinkAction,
  markMessageSharedAction,
  markLeadContactedAction,
  getLeadWaMessagesAction,
} from "@/domains/whatsapp/actions"
import type { WaMessagePublic } from "@/domains/whatsapp/types"
import type { Lead, Temperature, LeadStage, SalesRep } from "@/lib/db/schema"
import type { LeadWithHistory } from "@/domains/leads/repository"
import {
  MessageCircle, ThermometerSun, Clock, DollarSign,
  CheckCircle2, AlertCircle, RefreshCw, Loader2, X,
  Users, UserCheck, ExternalLink, Pencil, Save,
  Phone, Mail, MapPin, Copy, Check, Tag, Trash2,
} from "lucide-react"

const CURRENCIES = ["USD", "EUR", "VES", "COP", "MXN", "BRL", "ARS"]

interface Props {
  lead: Lead | null
  open: boolean
  onClose: () => void
  onMutated?: () => void
  whatsappNumbers: string[]
  clientId?: string
  salesReps?: SalesRep[]
}

const TEMP_CYCLE: Record<Temperature, Temperature> = { cold: "warm", warm: "hot", hot: "cold" }
const TEMP_LABEL: Record<Temperature, string> = { cold: "Frío", warm: "Tibio", hot: "Caliente" }
const TEMP_CLASS: Record<Temperature, string> = {
  cold: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  warm: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  hot: "bg-red-500/15 text-red-400 border border-red-500/30",
}
const STAGES: LeadStage[] = ["new", "contacted", "interested", "quoted", "won", "lost"]
const STAGE_LABEL: Record<LeadStage, string> = {
  new: "Nuevo", contacted: "Contactado", interested: "Interesado",
  quoted: "Cotizado", won: "Ganado", lost: "Perdido",
}
const STAGE_ACTIVE_CLASS: Record<LeadStage, string> = {
  new: "bg-zinc-700/60 text-zinc-300", contacted: "bg-blue-500/20 text-blue-400",
  interested: "bg-indigo-500/20 text-indigo-400", quoted: "bg-purple-500/20 text-purple-400",
  won: "bg-emerald-500/20 text-emerald-400", lost: "bg-red-500/20 text-red-400",
}

function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(date))
}
function historyLabel(field: string, value: string | null) {
  if (!value) return "—"
  if (field === "temperature") return TEMP_LABEL[value as Temperature] ?? value
  if (field === "stage") return STAGE_LABEL[value as LeadStage] ?? value
  return value
}

// ─── CAPI status display ──────────────────────────────────────────────────────

function formatRelative(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes}m`
  if (hours < 24) return `hace ${hours}h`
  return `hace ${days}d`
}

function CAPIStatus({ capi }: { capi: ConversionStatusPublic["capi"] }) {
  if (!capi) return <span className="text-xs text-zinc-600">Sin conexión Meta configurada</span>
  const map: Record<string, { label: string; cls: string }> = {
    sent: { label: "Enviado a Meta", cls: "text-emerald-400" },
    pending: { label: "Pendiente de envío", cls: "text-zinc-400" },
    processing: { label: "Enviando…", cls: "text-blue-400" },
    retrying: { label: `Reintentando (${capi.attemptCount}×)`, cls: "text-amber-400" },
    failed: { label: `Fallido tras ${capi.attemptCount} intentos`, cls: "text-red-400" },
    skipped: { label: "Sin conexión activa", cls: "text-zinc-500" },
    cancelled: { label: "Cancelado", cls: "text-zinc-500" },
  }
  const m = map[capi.status] ?? { label: capi.status, cls: "text-zinc-400" }
  return (
    <div className="space-y-0.5">
      <span className={`text-xs font-mono ${m.cls}`}>{m.label}</span>
      {capi.pixelId && (
        <p className="text-xs text-zinc-600">Pixel: {capi.pixelId}</p>
      )}
      {capi.sentAt && (
        <p className="text-xs text-zinc-600">Enviado: {formatRelative(capi.sentAt)}</p>
      )}
    </div>
  )
}

// ─── Conversion panel ─────────────────────────────────────────────────────────

function ConversionPanel({
  leadId,
  capiStatus,
  allConversions,
  onDone,
  onMutated,
}: {
  leadId: string
  capiStatus: ConversionStatusPublic | null
  allConversions: ConversionSummary[]
  onDone: () => void
  onMutated?: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [orderId, setOrderId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [retryPending, startRetry] = useTransition()

  function openForm() {
    setOrderId(crypto.randomUUID())
    setAmount("")
    setError("")
    setShowForm(true)
  }

  function handleRegister() {
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError("Ingresa un monto válido mayor a cero.")
      return
    }
    setError("")
    startTransition(async () => {
      try {
        const r = await registerSaleAction(leadId, { amount: amountNum, currency, orderId, convertedAt: new Date(date) })
        if (r.success) { setShowForm(false); onMutated?.(); onDone() }
        else setError(r.error ?? "Error desconocido")
      } catch {
        setError("Error inesperado al registrar la venta")
      }
    })
  }

  function handleRetry() {
    if (!capiStatus?.conversionId) return
    startRetry(async () => { await retryCAPIAction(capiStatus.conversionId); onDone() })
  }

  const capi = capiStatus?.capi
  const canRetry = capi && !["sent", "cancelled"].includes(capi.status)

  return (
    <div className="space-y-4">
      {/* Registration form or button */}
      {showForm ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
              onChange={(e) => { setAmount(e.target.value); setError("") }}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Order ID (para idempotencia)</label>
            <input type="text" value={orderId} onChange={(e) => setOrderId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-400 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleRegister} disabled={pending}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {pending ? "Registrando…" : "Confirmar venta"}
            </button>
            <button onClick={() => { setShowForm(false); setError("") }} disabled={pending}
              className="p-2 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button onClick={openForm} className="w-full px-3 py-2 text-sm font-medium border border-emerald-700/50 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors">
          + Registrar venta
        </button>
      )}

      {/* Historial de ventas */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-500">
          Historial {allConversions.length > 0 ? `(${allConversions.length})` : ""}
        </p>
        {allConversions.length === 0 ? (
          <p className="text-xs text-zinc-600">Sin ventas registradas.</p>
        ) : (
          allConversions.map((c) => {
            const s = CONVERSION_STATUS_MAP[c.status] ?? { label: c.status, cls: "text-zinc-400" }
            const isLatest = c.conversionId === capiStatus?.conversionId
            return (
              <div key={c.conversionId} className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-200">
                    {c.amount} {c.currency}
                  </span>
                  <span className={`text-xs ${s.cls}`}>{s.label}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>{new Date(c.convertedAt).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  {c.orderId && <span className="font-mono truncate max-w-[120px]">{c.orderId.slice(0, 8)}…</span>}
                </div>
                {c.notes && <p className="text-xs text-zinc-500 italic">{c.notes}</p>}
                {/* CAPI status inline for the latest conversion */}
                {isLatest && capi && (
                  <div className="pt-1 border-t border-zinc-700/40 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <CAPIStatus capi={capi} />
                      {canRetry && (
                        <button onClick={handleRetry} disabled={retryPending} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors disabled:opacity-50">
                          {retryPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Reintentar
                        </button>
                      )}
                    </div>
                    {capi.lastError && capi.status !== "sent" && (
                      <p className="text-xs text-red-400/80 flex items-start gap-1">
                        <AlertCircle className="h-3 w-3 flex-shrink-0 mt-px" />{capi.lastError}
                      </p>
                    )}
                    {capi.nextAttemptAt && capi.status === "retrying" && (
                      <p className="text-xs text-zinc-600">Próximo intento: {formatDateTime(capi.nextAttemptAt)}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Copy to clipboard button ─────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
      title="Copiar"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

// ─── Edit lead info panel ─────────────────────────────────────────────────────

function EditInfoPanel({
  leadId,
  initial,
  onSaved,
}: {
  leadId: string
  initial: { name: string | null; email: string | null; phone: string | null; city: string | null }
  onSaved: (data: typeof initial) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initial.name ?? "")
  const [email, setEmail] = useState(initial.email ?? "")
  const [phone, setPhone] = useState(initial.phone ?? "")
  const [city, setCity] = useState(initial.city ?? "")
  const [isPending, start] = useTransition()
  const [error, setError] = useState("")

  function handleEdit() {
    setName(initial.name ?? "")
    setEmail(initial.email ?? "")
    setPhone(initial.phone ?? "")
    setCity(initial.city ?? "")
    setError("")
    setEditing(true)
  }

  function handleSave() {
    setError("")
    start(async () => {
      try {
        const r = await updateLeadInfoAction(leadId, {
          name: name.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          city: city.trim() || null,
        })
        if (!r.success) { setError(r.error ?? "Error al guardar"); return }
        onSaved({
          name: name.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          city: city.trim() || null,
        })
        setEditing(false)
      } catch {
        setError("Error inesperado al guardar la información")
      }
    })
  }

  if (!editing) {
    return (
      <button
        onClick={handleEdit}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
      >
        <Pencil className="h-3 w-3" />
        Editar datos
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-indigo-500/30 bg-zinc-800/60 p-3">
      <p className="text-xs font-medium text-indigo-300 flex items-center gap-1.5">
        <Pencil className="h-3 w-3" />
        Editar información del lead
      </p>
      {[
        { label: "Nombre completo", value: name, set: setName, placeholder: "Nombre completo", type: "text" },
        { label: "Email", value: email, set: setEmail, placeholder: "correo@ejemplo.com", type: "email" },
        { label: "Teléfono", value: phone, set: setPhone, placeholder: "+58 424...", type: "tel" },
        { label: "Ciudad", value: city, set: setCity, placeholder: "Ciudad", type: "text" },
      ].map(({ label, value, set, placeholder, type }) => (
        <div key={label} className="space-y-0.5">
          <label className="text-xs text-zinc-500">{label}</label>
          <input
            type={type}
            value={value}
            onChange={(e) => set(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      ))}
      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {isPending ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={isPending}
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700 rounded-md transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── All conversions panel ────────────────────────────────────────────────────

const CONVERSION_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmada", cls: "text-emerald-400" },
  cancelled: { label: "Cancelada", cls: "text-zinc-500" },
  refunded: { label: "Reembolsada", cls: "text-amber-400" },
  pending: { label: "Pendiente", cls: "text-zinc-400" },
}

function AllConversionsPanel({ conversions }: { conversions: ConversionSummary[] }) {
  if (conversions.length === 0) {
    return <p className="text-xs text-zinc-600">Sin ventas registradas.</p>
  }
  return (
    <div className="space-y-2">
      {conversions.map((c) => {
        const s = CONVERSION_STATUS_MAP[c.status] ?? { label: c.status, cls: "text-zinc-400" }
        return (
          <div key={c.conversionId} className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-200">
                {c.amount} {c.currency}
              </span>
              <span className={`text-xs ${s.cls}`}>{s.label}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{new Date(c.convertedAt).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}</span>
              {c.orderId && <span className="font-mono truncate max-w-[120px]">{c.orderId.slice(0, 8)}…</span>}
            </div>
            {c.notes && <p className="text-xs text-zinc-500 italic">{c.notes}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ─── WhatsApp status labels ───────────────────────────────────────────────────

const WA_STATUS_LABEL: Record<string, string> = {
  link_prepared: "Enlace preparado",
  marked_shared: "Confirmado manualmente",
  provider_accepted: "Aceptado por proveedor",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  contacted: "Contactado",
  failed: "Fallido",
}
const WA_STATUS_CLASS: Record<string, string> = {
  link_prepared: "text-zinc-400",
  marked_shared: "text-emerald-400",
  provider_accepted: "text-blue-400",
  sent: "text-blue-400",
  delivered: "text-indigo-400",
  read: "text-violet-400",
  contacted: "text-emerald-400",
  failed: "text-red-400",
}

// ─── WhatsApp panel ───────────────────────────────────────────────────────────

function WhatsAppPanel({
  leadId,
  waMessages,
  onRefresh,
}: {
  leadId: string
  waMessages: WaMessagePublic[]
  onRefresh: () => void
}) {
  const [isPending, start] = useTransition()
  const [waLink, setWaLink] = useState<string | null>(null)
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [contactNote, setContactNote] = useState("")
  const [showContactNote, setShowContactNote] = useState(false)

  // Latest message that's in link_prepared state (waiting for manual confirmation)
  const pendingMessage = waMessages.find((m) => m.status === "link_prepared" && m.confirmationMode === "manual")

  function handleOpenWhatsApp() {
    start(async () => {
      const result = await prepareWaLinkAction({ leadId })
      if (result && "data" in result && result.data) {
        setWaLink(result.data.waLink)
        setActiveMessageId(result.data.message.id)
        window.open(result.data.waLink, "_blank")
        onRefresh()
      }
    })
  }

  function handleMarkShared(messageId: string) {
    start(async () => {
      await markMessageSharedAction({ messageId })
      setActiveMessageId(null)
      setWaLink(null)
      onRefresh()
    })
  }

  function handleMarkContacted() {
    start(async () => {
      await markLeadContactedAction(leadId, contactNote || undefined)
      setShowContactNote(false)
      setContactNote("")
      onRefresh()
    })
  }

  const currentPending = activeMessageId
    ? (waMessages.find((m) => m.id === activeMessageId) ?? null)
    : pendingMessage ?? null

  return (
    <div className="space-y-3">
      {/* Primary action */}
      <button
        onClick={handleOpenWhatsApp}
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-lg transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        Abrir WhatsApp
      </button>

      {/* After link is opened: show manual confirmation */}
      {currentPending && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-3 space-y-2">
          <p className="text-xs text-amber-300 font-medium">Enlace preparado — ¿Se envió el mensaje?</p>
          <button
            onClick={() => handleMarkShared(currentPending.id)}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Marcar como enviado
          </button>
          <p className="text-xs text-zinc-500 text-center">
            Confirmación manual · Indicador visible
          </p>
        </div>
      )}

      {/* Mark as contacted */}
      {showContactNote ? (
        <div className="space-y-2">
          <input
            placeholder="Nota (opcional)"
            value={contactNote}
            onChange={(e) => setContactNote(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleMarkContacted}
              disabled={isPending}
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Confirmar
            </button>
            <button onClick={() => setShowContactNote(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowContactNote(true)}
          className="w-full px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors"
        >
          Marcar como contactado
        </button>
      )}

      {/* Message history */}
      {waMessages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-600">Historial de mensajes</p>
          {waMessages.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <span className={WA_STATUS_CLASS[m.status] ?? "text-zinc-400"}>
                {WA_STATUS_LABEL[m.status] ?? m.status}
              </span>
              <div className="text-zinc-600 text-right">
                <span>{m.confirmationMode === "manual" ? "Manual" : "Proveedor"}</span>
                {m.confirmedAt && (
                  <span className="block">{new Date(m.confirmedAt).toLocaleDateString("es")}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Assignment panel ─────────────────────────────────────────────────────────

function buildWaText(lead: { name?: string | null; phone?: string | null; email?: string | null; metaCampaignName?: string | null }) {
  const lines = ["Hola, te fue asignado un nuevo lead:"]
  if (lead.name) lines.push(`📋 Nombre: ${lead.name}`)
  if (lead.phone) lines.push(`📱 Teléfono: ${lead.phone}`)
  if (lead.email) lines.push(`📧 Email: ${lead.email}`)
  if (lead.metaCampaignName) lines.push(`📣 Campaña: ${lead.metaCampaignName}`)
  return lines.join("\n")
}

function AssignmentPanel({
  leadId,
  currentAssignment,
  salesReps,
  onRefresh,
  lead,
}: {
  leadId: string
  currentAssignment: Awaited<ReturnType<typeof getLeadAssignmentAction>>
  salesReps: SalesRep[]
  onRefresh: () => void
  lead: { name?: string | null; phone?: string | null; email?: string | null; metaCampaignName?: string | null }
}) {
  const savedRepId = currentAssignment?.salesRepId ?? ""
  const [selectedRepId, setSelectedRepId] = useState<string>(savedRepId)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const [emailPending, startEmail] = useTransition()
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  // Sync dropdown when parent refreshes currentAssignment
  useEffect(() => {
    setSelectedRepId(currentAssignment?.salesRepId ?? "")
    setEmailSent(false)
    setEmailError(null)
  }, [currentAssignment?.salesRepId])

  function handleAssign() {
    setError(null)
    start(async () => {
      try {
        const result = await assignLeadAction({ leadId, salesRepId: selectedRepId || null })
        if (result && "error" in result) {
          setError(result.error ?? "Error al asignar")
          return
        }
        onRefresh()
      } catch {
        setError("Error inesperado al asignar")
      }
    })
  }

  function handleSendEmail() {
    setEmailError(null)
    setEmailSent(false)
    startEmail(async () => {
      try {
        const result = await sendAssignmentEmailAction(leadId)
        if (result && "error" in result) {
          setEmailError(result.error ?? "Error al enviar")
          return
        }
        setEmailSent(true)
        setTimeout(() => setEmailSent(false), 3000)
      } catch {
        setEmailError("Error inesperado al enviar el email")
      }
    })
  }

  const activeReps = salesReps.filter((r) => r.active)

  // Resolve current rep: prefer DB join result, fall back to salesReps list
  const currentRepId = currentAssignment?.salesRepId
  const assignedRep = currentAssignment?.salesRep
    ?? (currentRepId ? (salesReps.find((r) => r.id === currentRepId) ?? null) : null)

  // Email from salesReps list (AssignmentWithRep.salesRep doesn't carry email)
  const assignedRepEmail = currentRepId
    ? (salesReps.find((r) => r.id === currentRepId)?.email ?? null)
    : null

  const hasChanged = selectedRepId !== savedRepId

  const waText = buildWaText(lead)
  const waNumber = assignedRep?.whatsappNumber?.replace(/\D/g, "")
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}` : null

  return (
    <div className="space-y-2.5">
      {/* Current assignee badge */}
      {assignedRep ? (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <UserCheck className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
            <p className="text-sm text-emerald-300 font-medium flex-1">{assignedRep.displayName}</p>
          </div>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 transition-colors w-full"
            >
              <MessageCircle className="h-3 w-3" />
              Notificar por WhatsApp
            </a>
          )}
          {assignedRepEmail && (
            <button
              onClick={handleSendEmail}
              disabled={emailPending || isPending}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 transition-colors w-full disabled:opacity-50"
            >
              {emailPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : emailSent
                  ? <Check className="h-3 w-3 text-emerald-400" />
                  : <Mail className="h-3 w-3" />}
              {emailSent ? "Email enviado" : "Notificar por email"}
            </button>
          )}
          {emailError && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{emailError}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-500 italic">Sin asignar</p>
      )}

      {/* Selector + Asignar button */}
      {activeReps.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              value={selectedRepId}
              onChange={(e) => { setSelectedRepId(e.target.value); setError(null) }}
              disabled={isPending}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60 appearance-none pr-8"
            >
              <option value="">— Sin asignar —</option>
              {activeReps.map((r) => (
                <option key={r.id} value={r.id}>{r.displayName}</option>
              ))}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              {isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                : <span className="text-zinc-500 text-xs">▾</span>}
            </div>
          </div>
          <button
            onClick={handleAssign}
            disabled={isPending || !hasChanged}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Asignar"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  )
}

// ─── Main drawer ─────────────────────────────────────────────────────────────

export function LeadDrawer({ lead, open, onClose, onMutated, whatsappNumbers, clientId, salesReps = [] }: Props) {
  const [detail, setDetail] = useState<LeadWithHistory | null>(null)
  const [conversion, setConversion] = useState<ConversionStatusPublic | null>(null)
  const [allConversions, setAllConversions] = useState<ConversionSummary[]>([])
  const [currentAssignment, setCurrentAssignment] = useState<Awaited<ReturnType<typeof getLeadAssignmentAction>>>(null)
  const [waMessages, setWaMessages] = useState<WaMessagePublic[]>([])
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState("")
  const [notesDirty, setNotesDirty] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function loadAll(leadId: string) {
    setLoading(true)
    try {
      const [dR, cR, allCR, assignR, msgsR] = await Promise.allSettled([
        fetchLeadDetailAction(leadId),
        fetchConversionStatusAction(leadId),
        getAllConversionsByLeadAction(leadId),
        getLeadAssignmentAction(leadId),
        getLeadWaMessagesAction(leadId),
      ])
      const d = dR.status === "fulfilled" ? dR.value : null
      const c = cR.status === "fulfilled" ? cR.value : null
      const allC = allCR.status === "fulfilled" ? allCR.value : []
      const assign = assignR.status === "fulfilled" ? assignR.value : null
      const msgs = msgsR.status === "fulfilled" ? msgsR.value : []
      setDetail(d)
      setNotes(d?.notes ?? "")
      setNotesDirty(false)
      setConversion(c)
      setAllConversions(allC)
      setCurrentAssignment(assign)
      setWaMessages(msgs)
    } finally {
      setLoading(false)
    }
  }

  async function refreshWa(leadId: string) {
    const [assign, msgs] = await Promise.all([
      getLeadAssignmentAction(leadId),
      getLeadWaMessagesAction(leadId),
    ])
    setCurrentAssignment(assign)
    setWaMessages(msgs)
  }

  useEffect(() => {
    if (open && lead) {
      setDetail(null)
      setConversion(null)
      setAllConversions([])
      setCurrentAssignment(null)
      setWaMessages([])
      loadAll(lead.id)
    }
  }, [open, lead?.id])

  const current = detail ?? lead
  if (!current) return null

  const leadId = current.id
  const leadName = current.name
  const temperature = (detail?.temperature ?? lead?.temperature ?? "cold") as Temperature
  const stage = (detail?.stage ?? lead?.stage ?? "new") as LeadStage

  function handleTemperature() {
    const next = TEMP_CYCLE[temperature]
    setDetail((d) => (d ? { ...d, temperature: next } : null))
    startTransition(async () => {
      const result = await updateLeadTemperatureAction(leadId, next)
      if (!result?.error) { onMutated?.() }
    })
  }
  function handleStage(s: LeadStage) {
    if (s === stage) return
    setDetail((d) => (d ? { ...d, stage: s } : null))
    startTransition(async () => { await updateLeadStageAction(leadId, s) })
  }
  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteLeadsAction([leadId])
        if (!result.error) onClose()
      } catch {
        // Non-fatal — drawer stays open
      }
    })
  }

  function handleSaveNotes() {
    setNotesDirty(false); setNotesSaved(true)
    setDetail((d) => (d ? { ...d, notes } : null))
    startTransition(async () => { await updateLeadNotesAction(leadId, notes) })
    setTimeout(() => setNotesSaved(false), 2000)
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{current.name}</SheetTitle>
          <p className="text-xs text-zinc-500 mt-0.5">{current.phone ?? ""}{current.phone && current.email ? " · " : ""}{current.email ?? ""}</p>
        </SheetHeader>

        <SheetBody>
          {/* ── Información ─────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Información</h3>
              {!loading && (
                <EditInfoPanel
                  leadId={leadId}
                  initial={{
                    name: current.name ?? null,
                    email: current.email ?? null,
                    phone: current.phone ?? null,
                    city: current.city ?? null,
                  }}
                  onSaved={(data) => {
                    setDetail((d) => d ? {
                      ...d,
                      name: data.name ?? d.name,
                      email: data.email,
                      phone: data.phone,
                      city: data.city,
                    } : null)
                    onMutated?.()
                  }}
                />
              )}
            </div>

            {/* Contact card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-800/30 divide-y divide-zinc-800">
              {current.phone && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <Phone className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                  <span className="text-sm text-zinc-200 font-mono flex-1">{current.phone}</span>
                  <CopyButton text={current.phone} />
                </div>
              )}
              {current.email && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <Mail className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                  <span className="text-sm text-zinc-300 flex-1 truncate">{current.email}</span>
                  <CopyButton text={current.email} />
                </div>
              )}
              {current.city && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                  <span className="text-sm text-zinc-300">{current.city}</span>
                </div>
              )}
            </div>

            {/* Key facts */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs px-0.5">
              <span className="text-zinc-500">Negocio</span>
              <span className={current.negocio ? "text-emerald-400 font-medium" : "text-zinc-600"}>
                {current.negocio ? "Sí" : "No"}
              </span>
              {current.platform && (<><span className="text-zinc-500">Plataforma</span><span className="text-zinc-300 capitalize">{current.platform}</span></>)}
              {current.device && (<><span className="text-zinc-500">Dispositivo</span><span className="text-zinc-300 capitalize">{current.device}</span></>)}
              <span className="text-zinc-500">Ingresó</span>
              <span className="text-zinc-400">{formatDateTime(current.createdAt)}</span>
            </div>

            {/* Attribution */}
            {(current.metaAdsetName || current.metaAdName || current.metaCampaignName || current.utmSource || current.utmCampaign || current.utmContent || current.landingUrl) && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-800/20 p-3 space-y-1.5">
                <p className="text-xs text-zinc-600 font-medium flex items-center gap-1.5">
                  <Tag className="h-3 w-3" />
                  Atribución
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {current.metaCampaignName && (<><span className="text-zinc-500">Campaña</span><span className="text-zinc-300 truncate" title={current.metaCampaignName}>{current.metaCampaignName}</span></>)}
                  {current.metaAdsetName && (<><span className="text-zinc-500">Conjunto</span><span className="text-indigo-300 truncate" title={current.metaAdsetName}>{current.metaAdsetName}</span></>)}
                  {current.metaAdName && (<><span className="text-zinc-500">Anuncio</span><span className="text-indigo-300 truncate" title={current.metaAdName}>{current.metaAdName}</span></>)}
                  {current.utmSource && (<><span className="text-zinc-500">UTM Source</span><span className="text-zinc-400 truncate">{current.utmSource}</span></>)}
                  {current.utmMedium && (<><span className="text-zinc-500">UTM Medium</span><span className="text-zinc-400 truncate">{current.utmMedium}</span></>)}
                  {current.utmCampaign && (<><span className="text-zinc-500">UTM Campaign</span><span className="text-zinc-400 truncate">{current.utmCampaign}</span></>)}
                  {current.utmContent && (<><span className="text-zinc-500">UTM Content</span><span className="text-zinc-400 truncate">{current.utmContent}</span></>)}
                  {current.landingUrl && (
                    <>
                      <span className="text-zinc-500">Landing</span>
                      <a href={current.landingUrl} target="_blank" rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 truncate block"
                        title={current.landingUrl}
                      >
                        {(() => { try { return new URL(current.landingUrl).pathname } catch { return current.landingUrl } })()}
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Asignación ──────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />Asignado a
            </h3>
            {loading ? (
              <p className="text-xs text-zinc-600">Cargando…</p>
            ) : salesReps.length === 0 ? (
              <p className="text-xs text-zinc-600">No hay vendedores configurados para este cliente.</p>
            ) : (
              <AssignmentPanel
                leadId={leadId}
                currentAssignment={currentAssignment}
                salesReps={salesReps}
                onRefresh={() => refreshWa(leadId)}
                lead={{
                  name: current.name,
                  phone: current.phone,
                  email: current.email,
                  metaCampaignName: current.metaCampaignName,
                }}
              />
            )}
          </section>

          {/* ── Temperatura y etapa ─────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <ThermometerSun className="h-3.5 w-3.5" />Temperatura y etapa
            </h3>
            <div className="flex items-center gap-3">
              <button onClick={handleTemperature} disabled={isPending} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-opacity disabled:opacity-50 ${TEMP_CLASS[temperature]}`}>
                {TEMP_LABEL[temperature]}
              </button>
              <span className="text-zinc-700 text-xs">click para cambiar</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <button key={s} onClick={() => handleStage(s)} disabled={isPending} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors disabled:opacity-50 ${stage === s ? STAGE_ACTIVE_CLASS[s] : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"}`}>
                  {STAGE_LABEL[s]}
                </button>
              ))}
            </div>
          </section>

          {/* ── Notas ───────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Notas</h3>
            <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); setNotesSaved(false) }} placeholder="Agregar notas…" rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
            />
            <div className="flex items-center justify-between">
              <span className={`text-xs transition-opacity ${notesSaved ? "text-emerald-400 opacity-100" : "opacity-0"}`}>Guardado</span>
              <button onClick={handleSaveNotes} disabled={!notesDirty || isPending} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Guardar notas
              </button>
            </div>
          </section>

          {/* ── Venta ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />Venta
            </h3>
            {loading
              ? <p className="text-xs text-zinc-600">Cargando…</p>
              : <ConversionPanel leadId={leadId} capiStatus={conversion} allConversions={allConversions} onMutated={onMutated} onDone={() => {
                  Promise.all([
                    fetchConversionStatusAction(leadId),
                    getAllConversionsByLeadAction(leadId),
                  ]).then(([c, allC]) => { setConversion(c); setAllConversions(allC) }).catch(() => undefined)
                }} />
            }
          </section>

          {/* ── WhatsApp ────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />WhatsApp
            </h3>
            {loading ? (
              <p className="text-xs text-zinc-600">Cargando…</p>
            ) : (
              <WhatsAppPanel
                leadId={leadId}
                waMessages={waMessages}
                onRefresh={() => refreshWa(leadId)}
              />
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />Historial
            </h3>
            {loading && <p className="text-xs text-zinc-600">Cargando historial…</p>}
            {!loading && (!detail?.stageHistory || detail.stageHistory.length === 0) && <p className="text-xs text-zinc-600">Sin cambios registrados.</p>}
            {detail?.stageHistory && detail.stageHistory.length > 0 && (
              <div className="space-y-2">
                {detail.stageHistory.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 text-xs text-zinc-500">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-700 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-zinc-400">
                        {entry.field === "temperature" && "Temperatura"}{entry.field === "stage" && "Etapa"}{entry.field === "assignedTo" && "Asignación"}{entry.field === "converted" && "Conversión"}
                        {!["temperature", "stage", "assignedTo", "converted"].includes(entry.field) && entry.field}
                      </span>{" "}
                      <span className="text-zinc-600">{historyLabel(entry.field, entry.fromValue)} → {historyLabel(entry.field, entry.toValue)}</span>
                      <div className="mt-0.5 text-zinc-600">{entry.changedBy && <span>{entry.changedBy} · </span>}{formatDateTime(entry.changedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {/* ── Eliminar ────────────────────────────────────────── */}
          <section className="pt-2 border-t border-zinc-800/60">
            {confirmDelete ? (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-red-800/50 bg-red-900/10">
                <p className="text-xs text-zinc-400">¿Eliminar este lead permanentemente?</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={isPending}
                    className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                  >
                    {isPending ? "Eliminando…" : "Eliminar"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={isPending}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-red-400 transition-colors w-full justify-center py-2 rounded-lg hover:bg-zinc-800/60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar lead
              </button>
            )}
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
