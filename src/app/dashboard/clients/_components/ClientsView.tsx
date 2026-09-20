"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ClientDialog } from "./ClientDialog"
import { deleteClientAction, toggleClientActiveAction } from "@/domains/clients/actions"
import type { Client } from "@/lib/db/schema"
import { Plus, Pencil, Trash2, Building2, ExternalLink } from "lucide-react"
import Link from "next/link"

interface Props {
  clients: Client[]
  orgName: string
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(date)
  )
}

export function ClientsView({ clients, orgName }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Clientes</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{orgName}</p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      {/* Empty state */}
      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <Building2 className="h-7 w-7 text-zinc-500" />
          </div>
          <p className="text-zinc-300 font-medium">Sin clientes todavía</p>
          <p className="text-zinc-500 text-sm mt-1 max-w-xs">
            Agrega tu primer cliente para comenzar a gestionar sus campañas y leads.
          </p>
          <Button
            onClick={openCreate}
            className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Agregar cliente
          </Button>
        </div>
      ) : (
        /* Table */
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Pixel ID</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">WhatsApp</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Creado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="font-medium text-zinc-100 hover:text-indigo-400 transition-colors"
                    >
                      {client.name}
                    </Link>
                    {client.metaAccessTokenEnc && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 1a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V6a3 3 0 0 0-3-3zm1 11.732V17h-2v-2.268a2 2 0 1 1 2 0z" />
                        </svg>
                        CAPI
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                    {client.metaPixelId ? (
                      <span className="text-zinc-300">{client.metaPixelId}</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {client.whatsappNumbers.length > 0 ? (
                      <span className="text-zinc-300">{client.whatsappNumbers.length} número{client.whatsappNumbers.length !== 1 ? "s" : ""}</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(client)}
                      disabled={togglePending}
                      className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium transition-opacity ${
                        client.active
                          ? "bg-emerald-500/15 text-emerald-400 hover:opacity-70"
                          : "bg-zinc-700/50 text-zinc-500 hover:opacity-70"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${client.active ? "bg-emerald-400" : "bg-zinc-500"}`} />
                      {client.active ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {formatDate(client.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {confirmDeleteId === client.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(client.id)}
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
                            href={`/dashboard/clients/${client.id}`}
                            className="p-1.5 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-400/10 transition-colors"
                            title="Ver detalle"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            onClick={() => openEdit(client)}
                            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(client.id)}
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

      <ClientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        client={editClient}
      />
    </div>
  )
}
