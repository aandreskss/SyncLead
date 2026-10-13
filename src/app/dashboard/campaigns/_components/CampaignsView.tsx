"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CampaignDialog } from "./CampaignDialog"
import { CredentialsModal } from "./CredentialsModal"
import { MultiScriptModal } from "./MultiScriptModal"
import { UrlParamBuilderModal } from "./UrlParamBuilderModal"
import { deleteCampaignAction, toggleCampaignActiveAction } from "@/domains/campaigns/actions"
import type { Campaign, Client } from "@/lib/db/schema"
import type { CampaignWithClient } from "@/domains/campaigns/repository"
import Link from "next/link"
import {
  Plus, Pencil, Trash2, Key, Megaphone, Users, Code2, Link2,
  Play, Pause, TrendingUp, Layers, BarChart2, ChevronRight, Building2
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  PageHeader, StatusChip, EmptyState,
  opsBtnPrimary, opsBtnSecondary, opsIconBtn
} from "@/components/app/ops"

interface Props {
  campaigns: CampaignWithClient[]
  clients: Client[]
  orgName: string
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(date)
  )
}

function StatPill({
  value,
  label,
  color = "default",
}: {
  value: number
  label: string
  color?: "default" | "green" | "neutral" | "coral"
}) {
  const colors = {
    default: "text-ops-tx",
    green: "text-ops-green",
    neutral: "text-ops-tx2",
    coral: "text-ops-coral",
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("font-plex text-xl font-bold tabular-nums", colors[color])}>{value}</span>
      <span className="text-xs text-ops-tx2">{label}</span>
    </div>
  )
}

interface CardProps {
  campaign: CampaignWithClient
  confirmDeleteId: string | null
  deletePending: boolean
  togglePending: boolean
  onEdit: (c: Campaign) => void
  onShowCredentials: (c: CampaignWithClient) => void
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
  onDelete: (id: string) => void
  onToggleActive: (c: CampaignWithClient) => void
}

function CampaignCard({
  campaign,
  confirmDeleteId,
  deletePending,
  togglePending,
  onEdit,
  onShowCredentials,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onToggleActive,
}: CardProps) {
  const isConfirming = confirmDeleteId === campaign.id

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
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold",
                campaign.active
                  ? "bg-ops-green-bg text-ops-green"
                  : "bg-ops-line text-ops-tx3"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  campaign.active ? "bg-ops-green" : "bg-ops-tx3"
                )}
              />
              {campaign.active ? "Activa" : "Pausada"}
            </span>
          </div>
          <h3 className="truncate text-[15px] font-semibold leading-snug text-ops-tx">
            {campaign.name}
          </h3>
          {campaign.client && (
            <p className="mt-0.5 truncate text-xs text-ops-tx2">
              {campaign.client.name}
            </p>
          )}
        </div>

        {/* Toggle activo/pausado */}
        <button
          onClick={() => onToggleActive(campaign)}
          disabled={togglePending}
          title={campaign.active ? "Pausar campaña" : "Activar campaña"}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
            campaign.active
              ? "border-ops-green/30 bg-ops-green-bg text-ops-green hover:bg-ops-green/20"
              : "border-ops-line bg-ops-s2 text-ops-tx3 hover:bg-ops-line"
          )}
        >
          {campaign.active ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Leads count — zona principal */}
      <div className="flex items-end gap-3 px-5 pb-4">
        <div>
          <span className="font-plex text-4xl font-bold tabular-nums leading-none text-ops-tx">
            {campaign.leadCount.toLocaleString("es")}
          </span>
          <span className="ml-2 text-sm text-ops-tx2">leads</span>
        </div>
        <div className="mb-0.5 flex items-center gap-1 rounded-full bg-ops-blue-bg px-2 py-0.5">
          <TrendingUp className="h-3 w-3 text-ops-blue" />
          <span className="text-[11px] font-medium text-ops-blue">total</span>
        </div>
      </div>

      {/* Fecha */}
      <div className="px-5 pb-4">
        <span className="text-[11px] text-ops-tx3">Creada {formatDate(campaign.createdAt)}</span>
      </div>

      {/* Separador */}
      <div className="mx-5 border-t border-ops-line" />

      {/* Footer de acciones */}
      {isConfirming ? (
        <div className="flex items-center justify-between gap-2 px-5 py-3">
          <span className="text-xs text-ops-coral font-medium">¿Eliminar campaña?</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onDelete(campaign.id)}
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
          {/* Acción principal */}
          <Link
            href={`/dashboard/campaigns/${campaign.id}/leads`}
            className="flex h-8 items-center gap-1.5 rounded-full bg-ops-blue px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Users className="h-3.5 w-3.5" />
            Ver leads
            <ChevronRight className="h-3 w-3" />
          </Link>

          {/* Acciones secundarias */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onShowCredentials(campaign)}
              className={opsIconBtn}
              title="Scripts e instalación"
              aria-label={`Scripts de ${campaign.name}`}
            >
              <Code2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => onEdit(campaign)}
              className={opsIconBtn}
              title="Editar campaña"
              aria-label={`Editar ${campaign.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => onConfirmDelete(campaign.id)}
              className={cn(opsIconBtn, "hover:text-ops-coral")}
              title="Eliminar campaña"
              aria-label={`Eliminar ${campaign.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function CampaignsView({ campaigns, clients, orgName }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null)
  const [apiKeyModal, setApiKeyModal] = useState<CampaignWithClient | null>(null)
  const [multiScriptOpen, setMultiScriptOpen] = useState(false)
  const [urlBuilderOpen, setUrlBuilderOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()
  const [clientFilter, setClientFilter] = useState("all")
  const [togglePending, startToggleTransition] = useTransition()

  const appUrl = typeof window !== "undefined" ? window.location.origin : ""

  function openCreate() {
    setEditCampaign(null)
    setDialogOpen(true)
  }

  function openEdit(campaign: Campaign) {
    setEditCampaign(campaign)
    setDialogOpen(true)
  }

  function handleDelete(campaignId: string) {
    startDeleteTransition(async () => {
      await deleteCampaignAction(campaignId)
      setConfirmDeleteId(null)
      router.refresh()
    })
  }

  function handleToggleActive(campaign: CampaignWithClient) {
    startToggleTransition(async () => {
      await toggleCampaignActiveAction(campaign.id, !campaign.active)
      router.refresh()
    })
  }

  // Campañas filtradas por cliente
  const filtered =
    clientFilter === "all"
      ? campaigns
      : campaigns.filter((c) => (c.client?.id ?? "") === clientFilter)

  // KPIs del slice actual
  const totalLeads = filtered.reduce((s, c) => s + c.leadCount, 0)
  const activeCampaigns = filtered.filter((c) => c.active).length
  const pausedCampaigns = filtered.filter((c) => !c.active).length

  const selectedClient = clients.find((c) => c.id === clientFilter) ?? null

  return (
    <div className="flex min-h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-ops-line px-4 py-5 md:px-7 md:py-6">
        <PageHeader
          eyebrow="CAMPAÑAS"
          title="Campañas"
          subtitle="Gestiona campañas, instala scripts y monitorea leads por empresa."
          actions={
            <>
              <button onClick={() => setUrlBuilderOpen(true)} className={opsBtnSecondary}>
                <Link2 className="h-4 w-4" />
                Parámetros URL
              </button>
              {campaigns.length > 0 && (
                <button onClick={() => setMultiScriptOpen(true)} className={opsBtnSecondary}>
                  <Code2 className="h-4 w-4" />
                  Script multi-campaña
                </button>
              )}
              <button onClick={openCreate} className={opsBtnPrimary}>
                <Plus className="h-4 w-4" />
                Nueva campaña
              </button>
            </>
          }
        />
      </div>

      {/* ── Selector de empresa (chips) ─────────────────────────────────── */}
      {clients.length > 0 && (
        <div className="border-b border-ops-line bg-ops-s1">
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-3 md:px-7">
            <button
              onClick={() => setClientFilter("all")}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                clientFilter === "all"
                  ? "bg-ops-blue text-white"
                  : "border border-ops-line bg-white text-ops-tx2 hover:border-ops-blue/40 hover:text-ops-tx"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Todas
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  clientFilter === "all"
                    ? "bg-white/20 text-white"
                    : "bg-ops-line text-ops-tx2"
                )}
              >
                {campaigns.length}
              </span>
            </button>

            {clients.map((client) => {
              const count = campaigns.filter((c) => c.client?.id === client.id).length
              const isSelected = clientFilter === client.id
              return (
                <button
                  key={client.id}
                  onClick={() => setClientFilter(client.id)}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-ops-blue text-white"
                      : "border border-ops-line bg-white text-ops-tx2 hover:border-ops-blue/40 hover:text-ops-tx"
                  )}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="max-w-[140px] truncate">{client.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-ops-line text-ops-tx2"
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
      {campaigns.length > 0 && (
        <div className="border-b border-ops-line bg-white px-4 py-3 md:px-7">
          <div className="flex items-center gap-6">
            {selectedClient && (
              <span className="hidden text-sm font-semibold text-ops-tx md:block">
                {selectedClient.name}
              </span>
            )}
            {selectedClient && (
              <div className="hidden h-4 w-px bg-ops-line md:block" />
            )}
            <div className="flex items-center gap-5">
              <StatPill value={totalLeads} label="leads totales" />
              <div className="h-4 w-px bg-ops-line" />
              <StatPill value={activeCampaigns} label="activas" color="green" />
              <div className="h-4 w-px bg-ops-line" />
              <StatPill value={pausedCampaigns} label="pausadas" color="neutral" />
              <div className="h-4 w-px bg-ops-line" />
              <StatPill value={filtered.length} label="campañas" />
            </div>
          </div>
        </div>
      )}

      {/* ── Contenido principal ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-6 md:px-7">
        {campaigns.length === 0 ? (
          <div className="flex h-full min-h-64 items-center justify-center">
            <div className="mx-auto max-w-sm rounded-[20px] border border-ops-line bg-ops-s1 px-8 py-10 text-center shadow-ops-card">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ops-blue-bg">
                <Megaphone className="h-5 w-5 text-ops-blue" />
              </div>
              <p className="mb-1 text-[15px] font-semibold text-ops-tx">Sin campañas todavía</p>
              <p className="mb-5 text-sm text-ops-tx2">
                Crea tu primera campaña para obtener un snippet de tracking y empezar a recibir leads.
              </p>
              <button onClick={openCreate} className={opsBtnPrimary}>
                <Plus className="h-4 w-4" />
                Crear campaña
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-medium text-ops-tx">Sin campañas para esta empresa</p>
              <p className="mt-1 text-xs text-ops-tx2">
                {selectedClient?.name} aún no tiene campañas.
              </p>
              <button onClick={openCreate} className={cn(opsBtnPrimary, "mt-4")}>
                <Plus className="h-4 w-4" />
                Nueva campaña
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                confirmDeleteId={confirmDeleteId}
                deletePending={deletePending}
                togglePending={togglePending}
                onEdit={openEdit}
                onShowCredentials={setApiKeyModal}
                onConfirmDelete={setConfirmDeleteId}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
              />
            ))}

            {/* Card "Nueva campaña" */}
            <button
              onClick={openCreate}
              className="group flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-ops-line bg-transparent text-ops-tx3 transition-all hover:border-ops-blue/40 hover:bg-ops-blue-bg/40 hover:text-ops-blue"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-current transition-colors">
                <Plus className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">Nueva campaña</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Modales ─────────────────────────────────────────────────────── */}
      <CampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaign={editCampaign}
        clients={clients}
      />

      {apiKeyModal && (
        <CredentialsModal
          open={!!apiKeyModal}
          onOpenChange={(open) => {
            if (!open) setApiKeyModal(null)
          }}
          campaignId={apiKeyModal.id}
          campaignName={apiKeyModal.name}
        />
      )}

      <MultiScriptModal
        open={multiScriptOpen}
        onOpenChange={setMultiScriptOpen}
        campaigns={campaigns}
        appUrl={appUrl}
      />

      <UrlParamBuilderModal
        open={urlBuilderOpen}
        onOpenChange={setUrlBuilderOpen}
      />
    </div>
  )
}
