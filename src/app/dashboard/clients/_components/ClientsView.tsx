"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PageShell, PageHeader, Panel, StatusChip, EmptyState, opsTable, opsField, opsIconBtn } from "@/components/app/ops"
import { ClientDialog } from "./ClientDialog"
import { deleteClientAction, toggleClientActiveAction } from "@/domains/clients/actions"
import type { Client } from "@/lib/db/schema"
import { Plus, Pencil, Trash2, Building2, ExternalLink, Search } from "lucide-react"
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

export function ClientsView({ clients: allClients }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [deletePending, startDeleteTransition] = useTransition()
  const [togglePending, startToggleTransition] = useTransition()

  const q = query.trim().toLowerCase()
  const clients = allClients.filter((c) => {
    if (statusFilter === "active" && !c.active) return false
    if (statusFilter === "inactive" && c.active) return false
    if (!q) return true
    return c.name.toLowerCase().includes(q) || (c.metaPixelId ?? "").toLowerCase().includes(q)
  })

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

  const rowActions = (client: Client) =>
    confirmDeleteId === client.id ? (
      <>
        <button
          onClick={() => handleDelete(client.id)}
          disabled={deletePending}
          className="h-8 rounded-md bg-ops-coral px-3 text-xs font-medium text-ops-bg transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ops-blue disabled:opacity-50"
        >
          {deletePending ? "…" : "Confirmar"}
        </button>
        <button
          onClick={() => setConfirmDeleteId(null)}
          disabled={deletePending}
          className="h-8 rounded-md border border-ops-bd px-3 text-xs text-ops-tx transition-colors hover:bg-ops-hover focus-visible:outline-2 focus-visible:outline-ops-blue"
        >
          Cancelar
        </button>
      </>
    ) : (
      <>
        <Link href={`/dashboard/clients/${client.id}`} className={opsIconBtn} title="Ver detalle" aria-label="Ver detalle">
          <ExternalLink className="h-4 w-4" />
        </Link>
        <button onClick={() => openEdit(client)} className={opsIconBtn} title="Editar" aria-label="Editar">
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => setConfirmDeleteId(client.id)}
          className={`${opsIconBtn} hover:text-ops-coral`}
          title="Eliminar"
          aria-label="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </>
    )

  const statusButton = (client: Client) => (
    <button
      onClick={() => handleToggleActive(client)}
      disabled={togglePending}
      title={client.active ? "Desactivar" : "Activar"}
      className="rounded transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ops-blue disabled:opacity-50"
    >
      <StatusChip tone={client.active ? "green" : "amber"}>{client.active ? "Activo" : "Inactivo"}</StatusChip>
    </button>
  )

  const capi = (client: Client) =>
    client.metaAccessTokenEnc ? (
      <span className="ml-2 align-middle">
        <StatusChip tone="green">CAPI</StatusChip>
      </span>
    ) : null

  const wa = (client: Client) =>
    client.whatsappNumbers.length > 0 ? (
      <span className="font-plex tabular-nums text-ops-tx">
        {client.whatsappNumbers.length} número{client.whatsappNumbers.length !== 1 ? "s" : ""}
      </span>
    ) : (
      <span className="text-ops-tx3">—</span>
    )

  return (
    <PageShell>
      <PageHeader
        title="Clientes"
        subtitle="Cada cliente tiene su pixel, sus números de WhatsApp y su tracking."
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ops-tx3" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente o pixel"
            aria-label="Buscar cliente"
            className={`${opsField} w-full pl-9`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          aria-label="Filtrar por estado"
          className={opsField}
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {allClients.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="Sin clientes todavía"
            text="Agrega tu primer cliente para comenzar a gestionar sus campañas y leads."
            action={
              <Button onClick={openCreate} className="mt-2 gap-2">
                <Plus className="h-4 w-4" />
                Agregar cliente
              </Button>
            }
          />
        </Panel>
      ) : (
        <Panel>
          {clients.length === 0 ? (
            <EmptyState icon={<Search className="h-5 w-5" />} title="Sin resultados" text="Ningún cliente coincide con el filtro." />
          ) : (
            <>
              <div className={`${opsTable.wrap} hidden md:block`}>
                <table className={opsTable.table}>
                  <thead>
                    <tr>
                      <th className={opsTable.th}>Cliente</th>
                      <th className={opsTable.th}>Pixel ID</th>
                      <th className={opsTable.th}>WhatsApp</th>
                      <th className={opsTable.th}>Estado</th>
                      <th className={opsTable.th}>Creado</th>
                      <th className={opsTable.thRight}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.id} className={opsTable.row}>
                        <td className={opsTable.td}>
                          <Link
                            href={`/dashboard/clients/${client.id}`}
                            className="font-medium text-ops-tx hover:text-ops-blue-t focus-visible:outline-2 focus-visible:outline-ops-blue"
                          >
                            {client.name}
                          </Link>
                          {capi(client)}
                        </td>
                        <td className={`${opsTable.td} ${opsTable.mono} text-xs text-ops-tx2`}>
                          {client.metaPixelId ? client.metaPixelId : <span className="text-ops-tx3">—</span>}
                        </td>
                        <td className={opsTable.td}>{wa(client)}</td>
                        <td className={opsTable.td}>{statusButton(client)}</td>
                        <td className={`${opsTable.td} text-xs text-ops-tx2`}>{formatDate(client.createdAt)}</td>
                        <td className={opsTable.td}>
                          <div className="flex items-center justify-end gap-1">{rowActions(client)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-ops-line md:hidden">
                {clients.map((client) => (
                  <li key={client.id} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/dashboard/clients/${client.id}`} className="font-medium text-ops-tx">
                        {client.name}
                        {capi(client)}
                      </Link>
                      {statusButton(client)}
                    </div>
                    <p className="font-plex tabular-nums text-xs text-ops-tx2">{client.metaPixelId ?? "—"}</p>
                    <div className="flex items-center justify-between text-xs text-ops-tx2">
                      <span>{wa(client)} · {formatDate(client.createdAt)}</span>
                      <div className="flex items-center gap-1">{rowActions(client)}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-ops-line px-4 py-2.5 text-xs text-ops-tx3">
                Mostrando <span className="font-plex tabular-nums">{clients.length}</span> de{" "}
                <span className="font-plex tabular-nums">{allClients.length}</span> clientes
              </div>
            </>
          )}
        </Panel>
      )}

      <ClientDialog open={dialogOpen} onOpenChange={setDialogOpen} client={editClient} />
    </PageShell>
  )
}
