"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CampaignDialog } from "./CampaignDialog"
import { CredentialsModal } from "./CredentialsModal"
import { MultiScriptModal } from "./MultiScriptModal"
import { UrlParamBuilderModal } from "./UrlParamBuilderModal"
import { deleteCampaignAction, toggleCampaignActiveAction } from "@/domains/campaigns/actions"
import type { Campaign, Client } from "@/lib/db/schema"
import type { CampaignWithClient } from "@/domains/campaigns/repository"
import Link from "next/link"
import { Plus, Pencil, Trash2, Key, Megaphone, Users, Code2, Link2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { PageShell, PageHeader, Panel, StatusChip, EmptyState, opsTable, opsField, opsIconBtn } from "@/components/app/ops"

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

export function CampaignsView({ campaigns, clients, orgName }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null)
  const [apiKeyModal, setApiKeyModal] = useState<CampaignWithClient | null>(null)
  const [multiScriptOpen, setMultiScriptOpen] = useState(false)
  const [urlBuilderOpen, setUrlBuilderOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [clientFilter, setClientFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all")
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

  const q = query.trim().toLowerCase()
  const filtered = campaigns.filter((c) => {
    if (clientFilter !== "all" && (c.client?.id ?? "") !== clientFilter) return false
    if (statusFilter === "active" && !c.active) return false
    if (statusFilter === "paused" && c.active) return false
    if (q && !c.name.toLowerCase().includes(q) && !(c.client?.name ?? "").toLowerCase().includes(q)) return false
    return true
  })

  function rowActions(campaign: CampaignWithClient) {
    if (confirmDeleteId === campaign.id) {
      return (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => handleDelete(campaign.id)}
            disabled={deletePending}
            className="h-8 rounded-md bg-ops-coral px-3 text-xs font-medium text-ops-bg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ops-blue disabled:opacity-50"
          >
            {deletePending ? "…" : "Confirmar"}
          </button>
          <button
            onClick={() => setConfirmDeleteId(null)}
            disabled={deletePending}
            className="h-8 rounded-md border border-ops-bd px-3 text-xs font-medium text-ops-tx2 transition-colors hover:bg-ops-hover hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"
          >
            Cancelar
          </button>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-end gap-0.5">
        <Link
          href={`/dashboard/campaigns/${campaign.id}/leads`}
          className={opsIconBtn}
          title="Ver leads"
          aria-label={`Ver leads de ${campaign.name}`}
        >
          <Users className="h-4 w-4" />
        </Link>
        <button
          onClick={() => setApiKeyModal(campaign)}
          className={opsIconBtn}
          title="API key y snippet"
          aria-label={`API key y snippet de ${campaign.name}`}
        >
          <Key className="h-4 w-4" />
        </button>
        <button
          onClick={() => openEdit(campaign)}
          className={opsIconBtn}
          title="Editar"
          aria-label={`Editar ${campaign.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => setConfirmDeleteId(campaign.id)}
          className={cn(opsIconBtn, "hover:text-ops-coral")}
          title="Eliminar"
          aria-label={`Eliminar ${campaign.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }

  function statusButton(campaign: CampaignWithClient) {
    return (
      <button
        onClick={() => handleToggleActive(campaign)}
        disabled={togglePending}
        className="rounded focus-visible:outline-2 focus-visible:outline-ops-blue disabled:opacity-60"
        title={campaign.active ? "Pausar campaña" : "Activar campaña"}
        aria-label={`${campaign.active ? "Pausar" : "Activar"} ${campaign.name}`}
      >
        <StatusChip tone={campaign.active ? "green" : "amber"}>{campaign.active ? "Activa" : "Pausada"}</StatusChip>
      </button>
    )
  }

  const secondaryBtn =
    "inline-flex h-9 items-center gap-2 rounded-md border border-ops-bd px-3 text-[13px] font-medium text-ops-tx2 transition-colors hover:border-ops-bd2 hover:bg-ops-hover hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"

  return (
    <PageShell>
      <PageHeader
        title="Campañas"
        subtitle="Crea campañas, copia su snippet de tracking y revisa sus leads."
        actions={
          <>
            <button onClick={() => setUrlBuilderOpen(true)} className={secondaryBtn}>
              <Link2 className="h-4 w-4" />
              Parámetros de URL
            </button>
            {campaigns.length > 0 && (
              <button onClick={() => setMultiScriptOpen(true)} className={secondaryBtn}>
                <Code2 className="h-4 w-4" />
                Script multi-campaña
              </button>
            )}
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva campaña
            </Button>
          </>
        }
      />

      {campaigns.length > 0 && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative md:w-72">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ops-tx3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar campaña o cliente"
              aria-label="Buscar campaña o cliente"
              className={cn(opsField, "w-full pl-9")}
            />
          </div>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            aria-label="Filtrar por cliente"
            className={cn(opsField, "md:w-48")}
          >
            <option value="all">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "paused")}
            aria-label="Filtrar por estado"
            className={cn(opsField, "md:w-40")}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activa</option>
            <option value="paused">Pausada</option>
          </select>
        </div>
      )}

      {campaigns.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="Sin campañas todavía"
            text="Crea tu primera campaña para obtener una API key y empezar a recibir leads."
            action={
              <Button onClick={openCreate} className="mt-2 gap-2">
                <Plus className="h-4 w-4" />
                Crear campaña
              </Button>
            }
          />
        </Panel>
      ) : (
        <Panel>
          {filtered.length === 0 ? (
            <EmptyState icon={<Search className="h-5 w-5" />} title="Sin resultados" text="Ninguna campaña coincide con los filtros." />
          ) : (
            <>
              <div className={cn(opsTable.wrap, "hidden md:block")}>
                <table className={opsTable.table}>
                  <thead>
                    <tr>
                      <th className={opsTable.th}>Campaña</th>
                      <th className={opsTable.th}>Cliente</th>
                      <th className={opsTable.th}>Estado</th>
                      <th className={opsTable.thRight}>Leads</th>
                      <th className={opsTable.th}>Creada</th>
                      <th className={opsTable.thRight}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((campaign) => (
                      <tr key={campaign.id} className={opsTable.row}>
                        <td className={opsTable.td}>
                          <div className="font-medium">{campaign.name}</div>
                          <div className="text-xs text-ops-tx3">{orgName}</div>
                        </td>
                        <td className={cn(opsTable.td, "text-ops-tx2")}>
                          {campaign.client?.name ?? <span className="text-ops-tx3">—</span>}
                        </td>
                        <td className={opsTable.td}>{statusButton(campaign)}</td>
                        <td className={cn(opsTable.tdRight, opsTable.mono)}>{campaign.leadCount}</td>
                        <td className={cn(opsTable.td, "text-ops-tx2")}>{formatDate(campaign.createdAt)}</td>
                        <td className={opsTable.td}>{rowActions(campaign)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-ops-line md:hidden">
                {filtered.map((campaign) => (
                  <li key={campaign.id} className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ops-tx">{campaign.name}</p>
                        <p className="text-xs text-ops-tx3">{campaign.client?.name ?? "Sin cliente"}</p>
                      </div>
                      {statusButton(campaign)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-ops-tx2">
                      <span>
                        <span className="font-plex tabular-nums text-ops-tx">{campaign.leadCount}</span> leads
                      </span>
                      <span>{formatDate(campaign.createdAt)}</span>
                    </div>
                    {rowActions(campaign)}
                  </li>
                ))}
              </ul>

              <div className="border-t border-ops-line px-4 py-2.5 text-xs text-ops-tx3">
                Mostrando <span className="font-plex tabular-nums">{filtered.length}</span> de{" "}
                <span className="font-plex tabular-nums">{campaigns.length}</span> campañas
              </div>
            </>
          )}
        </Panel>
      )}

      <CampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaign={editCampaign}
        clients={clients}
      />

      {apiKeyModal && (
        <CredentialsModal
          open={!!apiKeyModal}
          onOpenChange={(open) => { if (!open) setApiKeyModal(null) }}
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
    </PageShell>
  )
}
