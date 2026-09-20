import { notFound, redirect } from "next/navigation"
import { requireClientAccess } from "@/lib/auth/server"
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors"
import { getClientById } from "@/domains/clients/repository"
import { getMetaConnectionsByClientId } from "@/domains/meta/repository"
import { listSalesReps } from "@/domains/team/repository"
import { getWaClientConfig, listMessageTemplates } from "@/domains/whatsapp/repository"
import { getClientCapiStats } from "@/domains/health/repository"
import { db } from "@/lib/db"
import { metaConnections } from "@/lib/db/schema"
import { and, eq, isNotNull } from "drizzle-orm"
import { getCampaignsByClientWithCounts } from "@/domains/campaigns/repository"
import { getLeadsByClient } from "@/domains/leads/repository"
import {
  getTrackingSitesAction,
  getTrackingOverviewAction,
  getOpenIssuesAction,
} from "@/domains/tracking/actions"
import { getMetaConnectionsAction } from "@/domains/meta/actions"
import { MetaConnectionPanel } from "./_components/MetaConnectionPanel"
import { CapiStatusCard } from "./_components/CapiStatusCard"
import { MetaInsightsPanel } from "./_components/MetaInsightsPanel"
import { QualificationProfilesPanel } from "./_components/QualificationProfilesPanel"
import { SalesTeamPanel } from "./_components/SalesTeamPanel"
import { WhatsAppConfigPanel } from "./_components/WhatsAppConfigPanel"
import { MessageTemplatesPanel } from "./_components/MessageTemplatesPanel"
import { ClientHubTabs } from "./_components/ClientHubTabs"
import { ClientResumenTab } from "./_components/ClientResumenTab"
import { ClientLeadsTab } from "./_components/ClientLeadsTab"
import { TrackingDashboard } from "./tracking/_components/TrackingDashboard"
import { ArrowLeft, Building2 } from "lucide-react"
import Link from "next/link"
import type { LeadStage, Temperature } from "@/lib/db/schema"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    tab?: string
    search?: string
    temperature?: string
    stage?: string
    campaignId?: string
    repId?: string
    assignment?: string
  }>
}

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const tab = sp.tab ?? "resumen"

  let ctx
  try {
    ctx = await requireClientAccess(id)
  } catch (err) {
    if (err instanceof NotFoundError) notFound()
    if (err instanceof ForbiddenError) redirect("/dashboard/clients")
    redirect("/login")
  }

  const client = await getClientById(id, ctx.orgId)
  if (!client) notFound()

  let tabContent: React.ReactNode

  if (tab === "resumen") {
    const [campaigns, metaConn] = await Promise.all([
      getCampaignsByClientWithCounts(id, ctx.orgId),
      getMetaConnectionsByClientId(id, ctx.orgId),
    ])
    const salesRepsData = await listSalesReps(ctx.orgId, id)
    tabContent = (
      <ClientResumenTab
        client={client}
        campaigns={campaigns}
        hasMetaConnection={metaConn.some((c) => c.status === "active")}
        hasSalesReps={salesRepsData.length > 0}
      />
    )
  } else if (tab === "leads") {
    const campaigns = await getCampaignsByClientWithCounts(id, ctx.orgId)
    const [leadsData, salesRepsData] = await Promise.all([
      getLeadsByClient(id, ctx.orgId, {
        search: sp.search,
        temperature: (sp.temperature as Temperature) || undefined,
        stage: (sp.stage as LeadStage) || undefined,
      }),
      listSalesReps(ctx.orgId, id),
    ])
    const filteredLeads = sp.campaignId
      ? leadsData.filter((l) => l.campaignId === sp.campaignId)
      : leadsData
    tabContent = (
      <ClientLeadsTab
        clientId={id}
        leads={filteredLeads}
        totalLeads={leadsData.length}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
        salesReps={salesRepsData}
        whatsappNumbers={client.whatsappNumbers ?? []}
        filters={{
          search: sp.search ?? "",
          temperature: sp.temperature ?? "",
          stage: sp.stage ?? "",
          campaignId: sp.campaignId ?? "",
          repId: sp.repId ?? "",
          assignment: sp.assignment ?? "",
        }}
      />
    )
  } else if (tab === "configuracion") {
    const [metaConnectionsList, salesRepsData, waConfig, templates, insightsConnections, capiStats] =
      await Promise.all([
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
        getClientCapiStats(ctx.orgId, id),
      ])

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

    tabContent = (
      <div className="space-y-6">
        <MetaConnectionPanel clientId={client.id} connections={publicConnections} />
        <div className="border-t border-zinc-800" />
        <CapiStatusCard clientId={client.id} stats={capiStats} />
        <div className="border-t border-zinc-800" />
        <MetaInsightsPanel clientId={client.id} initialConnections={publicInsightsConnections} />
        <div className="border-t border-zinc-800" />
        <QualificationProfilesPanel clientId={client.id} orgId={ctx.orgId} />
        <div className="border-t border-zinc-800" />
        <SalesTeamPanel clientId={client.id} initialReps={salesRepsData} />
        <div className="border-t border-zinc-800" />
        <WhatsAppConfigPanel clientId={client.id} initial={waConfig} />
        <div className="border-t border-zinc-800" />
        <MessageTemplatesPanel clientId={client.id} initialTemplates={templates} />
      </div>
    )
  } else {
    // diagnostico
    const [sitesResult, definitionsResult, issuesResult, metaConns] = await Promise.all([
      getTrackingSitesAction(id),
      getTrackingOverviewAction(id),
      getOpenIssuesAction(id),
      getMetaConnectionsAction(id),
    ])
    tabContent = (
      <TrackingDashboard
        clientId={id}
        sites={sitesResult.data ?? []}
        definitions={definitionsResult.data ?? []}
        issues={issuesResult.data ?? []}
        metaConnections={metaConns}
      />
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <Link
        href="/dashboard/clients"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Clientes
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-zinc-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{client.name}</h1>
          {client.industry && <p className="text-sm text-zinc-500">{client.industry}</p>}
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
            client.active
              ? "text-emerald-400 bg-emerald-400/10"
              : "text-zinc-500 bg-zinc-700/50"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${client.active ? "bg-emerald-400" : "bg-zinc-500"}`}
          />
          {client.active ? "Activo" : "Inactivo"}
        </span>
      </div>

      <ClientHubTabs clientId={id} currentTab={tab} />

      <div>{tabContent}</div>
    </div>
  )
}
