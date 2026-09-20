import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import {
  getHealthSnapshot,
  getCapiQueueStatsByClient,
} from "@/domains/health/repository"
import { getClientsByOrgId } from "@/domains/clients/repository"
import HealthDashboard from "./_components/HealthDashboard"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface Props {
  searchParams: Promise<{ clientId?: string }>
}

export default async function HealthPage({ searchParams }: Props) {
  const { clientId } = await searchParams

  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    if (e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  if (!["owner", "admin"].includes(ctx.role)) redirect("/dashboard")

  const [snapshot, clientsList] = await Promise.all([
    getHealthSnapshot(ctx.orgId),
    getClientsByOrgId(ctx.orgId),
  ])

  // Si hay filtro por cliente, reemplazar las stats de CAPI con las del cliente
  const capiQueue = clientId
    ? await getCapiQueueStatsByClient(ctx.orgId, clientId)
    : snapshot.capiQueue

  // Filtrar metaConnections e imports si hay clientId
  const metaConnections = clientId
    ? snapshot.metaConnections.filter((c) => c.clientId === clientId)
    : snapshot.metaConnections

  const activeImports = clientId
    ? snapshot.activeImports.filter((i) => i.clientId === clientId)
    : snapshot.activeImports

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Salud del sistema</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Visión general de jobs, integraciones y cola CAPI — solo para administradores.
        </p>
      </div>
      <HealthDashboard
        snapshot={{ ...snapshot, capiQueue, metaConnections, activeImports }}
        clients={clientsList.map((c) => ({ id: c.id, name: c.name }))}
        selectedClientId={clientId}
      />
    </div>
  )
}
