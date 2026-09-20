import { notFound, redirect } from "next/navigation"
import { requireClientAccess } from "@/lib/auth/server"
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors"
import { getClientById } from "@/domains/clients/repository"
import { getMetaConnectionsByClientId } from "@/domains/meta/repository"
import { listSalesReps } from "@/domains/team/repository"
import { getWaClientConfig, listMessageTemplates } from "@/domains/whatsapp/repository"
import { db } from "@/lib/db"
import { metaConnections } from "@/lib/db/schema"
import { and, eq, isNotNull } from "drizzle-orm"
import { MetaConnectionPanel } from "./_components/MetaConnectionPanel"
import { MetaInsightsPanel } from "./_components/MetaInsightsPanel"
import { QualificationProfilesPanel } from "./_components/QualificationProfilesPanel"
import { SalesTeamPanel } from "./_components/SalesTeamPanel"
import { WhatsAppConfigPanel } from "./_components/WhatsAppConfigPanel"
import { MessageTemplatesPanel } from "./_components/MessageTemplatesPanel"
import { ArrowLeft, Building2 } from "lucide-react"
import Link from "next/link"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params

  let ctx
  try {
    ctx = await requireClientAccess(id)
  } catch (err) {
    if (err instanceof NotFoundError) notFound()
    if (err instanceof ForbiddenError) redirect("/dashboard/clients")
    redirect("/login")
  }

  const [client, metaConnectionsList, salesRepsData, waConfig, templates, insightsConnections] = await Promise.all([
    getClientById(id, ctx.orgId),
    getMetaConnectionsByClientId(id, ctx.orgId),
    listSalesReps(ctx.orgId, id),
    getWaClientConfig(id, ctx.orgId),
    listMessageTemplates(ctx.orgId, id),
    db.query.metaConnections.findMany({
      where: and(
        eq(metaConnections.clientId, id),
        eq(metaConnections.orgId, ctx.orgId),
        isNotNull(metaConnections.adAccountId),
      ),
    }),
  ])

  if (!client) notFound()

  const publicConnections = metaConnectionsList.map((c) => ({
    id: c.id,
    pixelId: c.pixelId,
    datasetId: c.datasetId,
    graphApiVersion: c.graphApiVersion,
    status: c.status,
    scopes: c.scopes,
    expiresAt: c.expiresAt,
    lastVerifiedAt: c.lastVerifiedAt,
    lastError: c.lastError,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }))

  const publicInsightsConnections = insightsConnections.map((c) => ({
    id: c.id,
    adAccountId: c.adAccountId,
    connectionMode: c.connectionMode,
    status: c.status,
    lastVerifiedAt: c.lastVerifiedAt,
    lastError: c.lastError,
    createdAt: c.createdAt,
  }))

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Back nav */}
      <Link
        href="/dashboard/clients"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Clientes
      </Link>

      {/* Client header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-zinc-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{client.name}</h1>
          {client.industry && (
            <p className="text-sm text-zinc-500">{client.industry}</p>
          )}
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
            client.active
              ? "text-emerald-400 bg-emerald-400/10"
              : "text-zinc-500 bg-zinc-700/50"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${client.active ? "bg-emerald-400" : "bg-zinc-500"}`} />
          {client.active ? "Activo" : "Inactivo"}
        </span>
      </div>

      {/* Tracking link */}
      <Link
        href={`/dashboard/clients/${id}/tracking`}
        className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors"
      >
        <div>
          <p className="text-sm font-medium text-zinc-200">Diagnóstico de conversiones</p>
          <p className="text-xs text-zinc-500 mt-0.5">Pixel, CAPI, eventos y pruebas en tiempo real</p>
        </div>
        <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">Ver →</span>
      </Link>

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Meta Conversions API section */}
      <MetaConnectionPanel
        clientId={client.id}
        connections={publicConnections}
      />

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Meta Ads Insights — beta interna */}
      <MetaInsightsPanel
        clientId={client.id}
        initialConnections={publicInsightsConnections}
      />

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Qualification profiles section */}
      <QualificationProfilesPanel
        clientId={client.id}
        orgId={ctx.orgId}
      />

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Sales team section */}
      <SalesTeamPanel clientId={client.id} initialReps={salesRepsData} />

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* WhatsApp confirmation config */}
      <WhatsAppConfigPanel clientId={client.id} initial={waConfig} />

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Message templates */}
      <MessageTemplatesPanel clientId={client.id} initialTemplates={templates} />
    </div>
  )
}
