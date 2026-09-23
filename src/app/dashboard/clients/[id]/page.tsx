import { notFound, redirect } from "next/navigation"
import { requireClientAccess } from "@/lib/auth/server"
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors"
import { getClientById } from "@/domains/clients/repository"
import { getMetaConnectionsByClientId } from "@/domains/meta/repository"
import { listSalesReps } from "@/domains/team/repository"
import { getWaClientConfig, listMessageTemplates } from "@/domains/whatsapp/repository"
import { getClientCapiStats } from "@/domains/health/repository"
import { getTrackingSitesByClient } from "@/domains/tracking/repository"
import { db } from "@/lib/db"
import { metaConnections } from "@/lib/db/schema"
import { and, eq, isNotNull } from "drizzle-orm"
import { getCampaignsByClientWithCounts } from "@/domains/campaigns/repository"
import { getLeadsByClientWithActivity } from "@/domains/leads/repository"
import {
  getTrackingSitesAction,
  getTrackingOverviewAction,
  getOpenIssuesAction,
  getIngestErrorsByClientAction,
  getCheckoutFunnelAction,
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
import { LeadSourcesPanel } from "./_components/LeadSourcesPanel"
import { ScriptInstallPanel } from "./_components/ScriptInstallPanel"
import { TrackingDashboard } from "./tracking/_components/TrackingDashboard"
import { CapiLogPanel } from "./_components/CapiLogPanel"
import { AudienceSyncPanel } from "./_components/AudienceSyncPanel"
import { ArrowLeft, Building2 } from "lucide-react"
import { PageShell, StatusChip } from "@/components/app/ops"
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
    converted?: string
    source?: string
    activity?: string
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

  const client = await getClientById(id, ctx.orgId).catch((e) => { console.error("[ClientPage] getClientById:", e); throw e })
  if (!client) notFound()

  let tabContent: React.ReactNode

  if (tab === "resumen") {
    const [campaigns, metaConn] = await Promise.all([
      getCampaignsByClientWithCounts(id, ctx.orgId).catch((e) => { console.error("[ClientPage/resumen] getCampaignsByClientWithCounts:", e); throw e }),
      getMetaConnectionsByClientId(id, ctx.orgId).catch((e) => { console.error("[ClientPage/resumen] getMetaConnectionsByClientId:", e); throw e }),
    ])
    const salesRepsData = await listSalesReps(ctx.orgId, id).catch((e) => { console.error("[ClientPage/resumen] listSalesReps:", e); throw e })
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
    const convertedFilter =
      sp.converted === "yes" ? true : sp.converted === "no" ? false : undefined
    const [leadsData, salesRepsData] = await Promise.all([
      getLeadsByClientWithActivity(id, ctx.orgId, {
        search: sp.search,
        temperature: (sp.temperature as Temperature) || undefined,
        stage: (sp.stage as LeadStage) || undefined,
        converted: convertedFilter,
        source: (sp.source as "meta_ads" | "organic" | "imported" | undefined) || undefined,
        activity: (sp.activity as "has_sale" | "pending_capi" | "checkout" | "cart_abandoned" | "form_submitted" | "info_requested" | undefined) || undefined,
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
          converted: sp.converted ?? "",
          source: sp.source ?? "",
          activity: sp.activity ?? "",
        }}
      />
    )
  } else if (tab === "fuentes") {
    const metaConnectionsList = await getMetaConnectionsByClientId(id, ctx.orgId)
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
      metaPageId: c.metaPageId ?? null,
      webhookVerifyToken: c.webhookVerifyToken ?? null,
      leadAdsEnabled: c.leadAdsEnabled,
      captureScriptKey: c.captureScriptKey ?? null,
      sendLeadEvents: c.sendLeadEvents,
      sendContactEvents: c.sendContactEvents,
      sendBehaviorCapi: c.sendBehaviorCapi,
    }))
    tabContent = (
      <LeadSourcesPanel clientId={id} metaConnections={publicConnections} />
    )
  } else if (tab === "configuracion") {
    const [metaConnectionsList, salesRepsData, waConfig, templates, insightsConnections, capiStats, trackingSitesData] =
      await Promise.all([
        getMetaConnectionsByClientId(id, ctx.orgId).catch((e) => { console.error("[ClientPage/config] getMetaConnections:", e); throw e }),
        listSalesReps(ctx.orgId, id).catch((e) => { console.error("[ClientPage/config] listSalesReps:", e); throw e }),
        getWaClientConfig(id, ctx.orgId).catch((e) => { console.error("[ClientPage/config] getWaClientConfig:", e); throw e }),
        listMessageTemplates(ctx.orgId, id).catch((e) => { console.error("[ClientPage/config] listMessageTemplates:", e); throw e }),
        db.query.metaConnections.findMany({
          where: and(
            eq(metaConnections.clientId, id),
            eq(metaConnections.orgId, ctx.orgId),
            isNotNull(metaConnections.adAccountId),
          ),
        }).catch((e) => { console.error("[ClientPage/config] insightsConnections:", e); throw e }),
        getClientCapiStats(ctx.orgId, id).catch((e) => { console.error("[ClientPage/config] getClientCapiStats:", e); throw e }),
        getTrackingSitesByClient(ctx.orgId, id).catch((e) => { console.error("[ClientPage/config] getTrackingSites:", e); throw e }),
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
      metaPageId: c.metaPageId ?? null,
      webhookVerifyToken: c.webhookVerifyToken ?? null,
      leadAdsEnabled: c.leadAdsEnabled,
      captureScriptKey: c.captureScriptKey ?? null,
      sendLeadEvents: c.sendLeadEvents,
      sendContactEvents: c.sendContactEvents,
      sendBehaviorCapi: c.sendBehaviorCapi,
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
        <div className="border-t border-ops-line" />
        <CapiStatusCard clientId={client.id} stats={capiStats} />
        <div className="border-t border-ops-line" />
        <MetaInsightsPanel clientId={client.id} initialConnections={publicInsightsConnections} />
        <div className="border-t border-ops-line" />
        <AudienceSyncPanel
          clientId={client.id}
          hasAdAccount={metaConnectionsList.some((c) => c.status === "active" && !!c.adAccountId)}
        />
        <div className="border-t border-ops-line" />
        <QualificationProfilesPanel clientId={client.id} orgId={ctx.orgId} />
        <div className="border-t border-ops-line" />
        <SalesTeamPanel clientId={client.id} initialReps={salesRepsData} />
        <div className="border-t border-ops-line" />
        <WhatsAppConfigPanel clientId={client.id} initial={waConfig} />
        <div className="border-t border-ops-line" />
        <MessageTemplatesPanel clientId={client.id} initialTemplates={templates} />
        <div className="border-t border-ops-line" />
        <ScriptInstallPanel
          sites={trackingSitesData.map((s) => ({
            id: s.id,
            name: s.name,
            domain: s.domain,
            collectToken: s.collectToken ?? null,
          }))}
        />
      </div>
    )
  } else {
    // diagnostico
    const [sitesResult, definitionsResult, issuesResult, metaConns, ingestErrResult, funnelResult] = await Promise.all([
      getTrackingSitesAction(id),
      getTrackingOverviewAction(id),
      getOpenIssuesAction(id),
      getMetaConnectionsAction(id),
      getIngestErrorsByClientAction(id),
      getCheckoutFunnelAction(id, 30),
    ])
    tabContent = (
      <div className="space-y-6">
        <TrackingDashboard
          clientId={id}
          sites={sitesResult.data ?? []}
          definitions={definitionsResult.data ?? []}
          issues={issuesResult.data ?? []}
          metaConnections={metaConns}
          ingestErrors={ingestErrResult.data ?? []}
          checkoutFunnel={funnelResult.data ?? { startedCount: 0, completedCount: 0, abandonedCount: 0, abandonmentRate: 0, bySource: [] }}
        />
        <div className="border-t border-ops-line" />
        <CapiLogPanel clientId={id} />
      </div>
    )
  }

  return (
    <PageShell className="max-w-7xl space-y-6">
      <Link
        href="/dashboard/clients"
        className="inline-flex items-center gap-1.5 text-sm text-ops-tx2 hover:text-ops-tx transition-colors focus-visible:outline-2 focus-visible:outline-ops-blue"
      >
        <ArrowLeft className="h-4 w-4" />
        Clientes
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg border border-ops-line bg-ops-s2 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-ops-tx2" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ops-tx">{client.name}</h1>
          {client.industry && <p className="text-sm text-ops-tx2">{client.industry}</p>}
        </div>
        <span className="ml-auto">
          <StatusChip tone={client.active ? "green" : "amber"}>{client.active ? "Activo" : "Inactivo"}</StatusChip>
        </span>
      </div>

      <ClientHubTabs clientId={id} currentTab={tab} />

      <div>{tabContent}</div>
    </PageShell>
  )
}
