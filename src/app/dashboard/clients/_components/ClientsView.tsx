"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  PageHeader,
  opsBtnPrimary,
  opsIconBtn,
} from "@/components/app/ops"
import { ClientDialog } from "./ClientDialog"
import { deleteClientAction, toggleClientActiveAction } from "@/domains/clients/actions"
import type { Client } from "@/lib/db/schema"
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  ChevronRight,
  Wifi,
  MessageCircle,
  Radio,
  Play,
  Pause,
  Layers,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface Props {
  clients: Client[]
  orgName: string
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date))
}

function StatPill({
  value,
  label,
  color = "default",
}: {
  value: number
  label: string
  color?: "default" | "green" | "neutral" | "coral" | "blue"
}) {
  const colors = {
    default: "text-ops-tx",
    green: "text-ops-green",
    neutral: "text-ops-tx2",
    coral: "text-ops-coral",
    blue: "text-ops-blue",
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("font-plex text-xl font-bold tabular-nums", colors[color])}>
        {value}
      </span>
      <span className="text-xs text-ops-tx2">{label}</span>
    </div>
  )
}

function Indicator({
  active,
  label,
  icon,
}: {
  active: boolean
  label: string
  icon: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
        active ? "bg-ops-green-bg text-ops-green" : "bg-ops-line text-ops-tx3"
      )}
    >
      {icon}
      {label}
      {active ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3 opacity-50" />
      )}
    </div>
  )
}

interface CardProps {
  client: Client
  confirmDeleteId: string | null
  deletePending: boolean
  togglePending: boolean
  onEdit: (c: Client) => void
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
  onDelete: (id: string) => void
  onToggleActive: (c: Client) => void
}

function ClientCard({
  client,
  confirmDeleteId,
  deletePending,
  togglePending,
  onEdit,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onToggleActive,
}: CardProps) {
  const isConfirming = confirmDeleteId === client.id
  const hasCapi = !!client.metaAccessTokenEnc
  const hasPixel = !!client.metaPixelId
  const hasWa = client.whatsappNumbers.length > 0

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-[20px] border bg-white shadow-ops-card transition-shadow hover:shadow-lg",
        isConfirming ? "border-ops-coral/40" : "border-ops-line"
      )}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold",
                client.active
                  ? "bg-ops-green-bg text-ops-green"
                  : "bg-ops-line text-ops-tx3"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  client.active ? "bg-ops-green" : "bg-ops-tx3"
                )}
              />
              {client.active ? "Activo" : "Inactivo"}
            </span>
          </div>

          <h3 className="truncate text-[15px] font-semibold leading-snug text-ops-tx">
            {client.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-ops-tx3">
            Creado {formatDate(client.createdAt)}
          </p>
        </div>

        {/* Toggle activo/inactivo */}
        <button
          onClick={() => onToggleActive(client)}
          disabled={togglePending}
          title={client.active ? "Desactivar cliente" : "Activar cliente"}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
            client.active
              ? "border-ops-green/30 bg-ops-green-bg text-ops-green hover:bg-ops-green/20"
              : "border-ops-line bg-ops-s2 text-ops-tx3 hover:bg-ops-line"
          )}
        >
          {client.active ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Indicadores de configuración */}
      <div className="flex flex-wrap gap-1.5 px-5 pb-4">
        <Indicator
          active={hasCapi}
          label="CAPI"
          icon={<Wifi className="h-3 w-3" />}
        />
        <Indicator
          active={hasPixel}
          label="Pixel"
          icon={<Radio className="h-3 w-3" />}
        />
        <Indicator
          active={hasWa}
          label={hasWa ? `WA ${client.whatsappNumbers.length}` : "WhatsApp"}
          icon={<MessageCircle className="h-3 w-3" />}
        />
      </div>

      {/* Pixel ID si existe */}
      {client.metaPixelId && (
        <div className="px-5 pb-4">
          <span className="font-plex text-[11px] tabular-nums text-ops-tx3">
            Pixel: {client.metaPixelId}
          </span>
        </div>
      )}

      {/* Separador */}
      <div className="mx-5 mt-auto border-t border-ops-line" />

      {/* Footer de acciones */}
      {isConfirming ? (
        <div className="flex items-center justify-between gap-2 px-5 py-3">
          <span className="text-xs font-medium text-ops-coral">¿Eliminar cliente?</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onDelete(client.id)}
              disabled={deletePending}
              className="h-7 rounded-full bg-ops-coral px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {deletePending ? "…" : "Confirmar"}
            </button>
            <button
              onClick={onCancelDelete}
              disabled={deletePending}
              className="h-7 rounded-full border border-ops-bd px-3 text-xs font-medium text-ops-tx2 transition-colors hover:bg-ops-s2"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link
            href={`/dashboard/clients/${client.id}`}
            className="flex h-8 items-center gap-1.5 rounded-full bg-ops-blue px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Building2 className="h-3.5 w-3.5" />
            Ver cliente
            <ChevronRight className="h-3 w-3" />
          </Link>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onEdit(client)}
              className={opsIconBtn}
              title="Editar cliente"
              aria-label={`Editar ${client.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => onConfirmDelete(client.id)}
              className={cn(opsIconBtn, "hover:text-ops-coral")}
              title="Eliminar cliente"
              aria-label={`Eliminar ${client.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type StatusFilter = "all" | "active" | "inactive"

export function ClientsView({ clients: allClients }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [deletePending, startDeleteTransition] = useTransition()
  const [togglePending, startToggleTransition] = useTransition()

  function openCreate() {
    setEditClient(null)
    setDialogOpen(true)
  }

  function openEdit(client: Client) {
    setEditClient(client)
    setDialogOpen(true)
  }

  function handleDelete(clientId: string) {
    startDeleteTransition(async () => {
      await deleteClientAction(clientId)
      setConfirmDeleteId(null)
      router.refresh()
    })
  }

  function handleToggleActive(client: Client) {
    startToggleTransition(async () => {
      await toggleClientActiveAction(client.id, !client.active)
      router.refresh()
    })
  }

  const filtered = allClients.filter((c) => {
    if (statusFilter === "active") return c.active
    if (statusFilter === "inactive") return !c.active
    return true
  })

  const totalActive = allClients.filter((c) => c.active).length
  const totalInactive = allClients.filter((c) => !c.active).length
  const totalCapi = allClients.filter((c) => !!c.metaAccessTokenEnc).length

  const FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "active", label: "Activos" },
    { value: "inactive", label: "Inactivos" },
  ]

  return (
    <div className="flex min-h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-ops-line px-4 py-5 md:px-7 md:py-6">
        <PageHeader
          eyebrow="CLIENTES"
          title="Clientes"
          subtitle="Gestiona tus clientes, configura sus credenciales Meta y monitorea su actividad."
          actions={
            <button onClick={openCreate} className={opsBtnPrimary}>
              <Plus className="h-4 w-4" />
              Nuevo cliente
            </button>
          }
        />
      </div>

      {/* ── Chips de filtro de estado ───────────────────────────────────── */}
      {allClients.length > 0 && (
        <div className="border-b border-ops-line bg-ops-s1">
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-3 md:px-7">
            {FILTERS.map(({ value, label }) => {
              const count =
                value === "all"
                  ? allClients.length
                  : value === "active"
                  ? totalActive
                  : totalInactive
              const isSelected = statusFilter === value
              return (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-ops-blue text-white"
                      : "border border-ops-line bg-white text-ops-tx2 hover:border-ops-blue/40 hover:text-ops-tx"
                  )}
                >
                  {value === "all" && <Layers className="h-3.5 w-3.5" />}
                  {label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                      isSelected ? "bg-white/20 text-white" : "bg-ops-line text-ops-tx2"
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── KPIs strip ──────────────────────────────────────────────────── */}
      {allClients.length > 0 && (
        <div className="border-b border-ops-line bg-white px-4 py-3 md:px-7">
          <div className="flex items-center gap-5">
            <StatPill value={allClients.length} label="clientes" />
            <div className="h-4 w-px bg-ops-line" />
            <StatPill value={totalActive} label="activos" color="green" />
            <div className="h-4 w-px bg-ops-line" />
            <StatPill value={totalInactive} label="inactivos" color="neutral" />
            <div className="h-4 w-px bg-ops-line" />
            <StatPill value={totalCapi} label="con CAPI" color="blue" />
          </div>
        </div>
      )}

      {/* ── Contenido principal ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-6 md:px-7">
        {allClients.length === 0 ? (
          <div className="flex h-full min-h-64 items-center justify-center">
            <div className="mx-auto max-w-sm rounded-[20px] border border-ops-line bg-ops-s1 px-8 py-10 text-center shadow-ops-card">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ops-blue-bg">
                <Building2 className="h-5 w-5 text-ops-blue" />
              </div>
              <p className="mb-1 text-[15px] font-semibold text-ops-tx">
                Sin clientes todavía
              </p>
              <p className="mb-5 text-sm text-ops-tx2">
                Agrega tu primer cliente para comenzar a gestionar sus campañas y leads.
              </p>
              <button onClick={openCreate} className={opsBtnPrimary}>
                <Plus className="h-4 w-4" />
                Agregar cliente
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-medium text-ops-tx">Sin clientes en este filtro</p>
              <p className="mt-1 text-xs text-ops-tx2">
                Cambia el filtro de estado para ver otros clientes.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                confirmDeleteId={confirmDeleteId}
                deletePending={deletePending}
                togglePending={togglePending}
                onEdit={openEdit}
                onConfirmDelete={setConfirmDeleteId}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
              />
            ))}

            {/* Card "Nuevo cliente" */}
            <button
              onClick={openCreate}
              className="group flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-ops-line bg-transparent text-ops-tx3 transition-all hover:border-ops-blue/40 hover:bg-ops-blue-bg/40 hover:text-ops-blue"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-current transition-colors">
                <Plus className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">Nuevo cliente</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Modal ───────────────────────────────────────────────────────── */}
      <ClientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        client={editClient}
      />
    </div>
  )
}
