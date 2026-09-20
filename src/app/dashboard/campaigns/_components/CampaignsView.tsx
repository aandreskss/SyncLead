"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CampaignDialog } from "./CampaignDialog"
import { ApiKeyModal } from "./ApiKeyModal"
import { MultiScriptModal } from "./MultiScriptModal"
import { deleteCampaignAction, toggleCampaignActiveAction } from "@/domains/campaigns/actions"
import type { Campaign, Client } from "@/lib/db/schema"
import type { CampaignWithClient } from "@/domains/campaigns/repository"
import Link from "next/link"
import { Plus, Pencil, Trash2, Key, Megaphone, Users, Code2 } from "lucide-react"

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Campañas</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{orgName}</p>
        </div>
        <div className="flex items-center gap-2">
          {campaigns.length > 0 && (
            <button
              onClick={() => setMultiScriptOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 rounded-lg transition-colors"
            >
              <Code2 className="h-4 w-4" />
              Script multi-campaña
            </button>
          )}
          <Button
            onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Nueva campaña
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <Megaphone className="h-7 w-7 text-zinc-500" />
          </div>
          <p className="text-zinc-300 font-medium">Sin campañas todavía</p>
          <p className="text-zinc-500 text-sm mt-1 max-w-xs">
            Crea tu primera campaña para obtener una API key y empezar a recibir leads.
          </p>
          <Button
            onClick={openCreate}
            className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Crear campaña
          </Button>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Campaña</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Leads</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Creada</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-zinc-100">{campaign.name}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {campaign.client?.name ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-zinc-300 font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded">
                      {campaign.leadCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(campaign)}
                      disabled={togglePending}
                      className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium transition-opacity ${
                        campaign.active
                          ? "bg-emerald-500/15 text-emerald-400 hover:opacity-70"
                          : "bg-zinc-700/50 text-zinc-500 hover:opacity-70"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${campaign.active ? "bg-emerald-400" : "bg-zinc-500"}`} />
                      {campaign.active ? "Activa" : "Inactiva"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {formatDate(campaign.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {confirmDeleteId === campaign.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(campaign.id)}
                            disabled={deletePending}
                            className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                          >
                            {deletePending ? "…" : "Confirmar"}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={deletePending}
                            className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <Link
                            href={`/dashboard/campaigns/${campaign.id}/leads`}
                            className="p-1.5 rounded text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                            title="Ver leads"
                          >
                            <Users className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            onClick={() => setApiKeyModal(campaign)}
                            className="p-1.5 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-400/10 transition-colors"
                            title="Ver API key y snippet"
                          >
                            <Key className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(campaign)}
                            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(campaign.id)}
                            className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaign={editCampaign}
        clients={clients}
      />

      {apiKeyModal && (
        <ApiKeyModal
          open={!!apiKeyModal}
          onOpenChange={(open) => { if (!open) setApiKeyModal(null) }}
          campaignId={apiKeyModal.id}
          campaignName={apiKeyModal.name}
          apiKey={apiKeyModal.apiKey}
        />
      )}

      <MultiScriptModal
        open={multiScriptOpen}
        onOpenChange={setMultiScriptOpen}
        campaigns={campaigns}
        appUrl={appUrl}
      />
    </div>
  )
}
