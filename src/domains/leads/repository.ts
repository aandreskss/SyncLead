import { db } from "@/lib/db"
import { leads, leadStageHistory, campaigns, conversions, leadBehaviorEvents, metaEvents } from "@/lib/db/schema"
import type { Lead, LeadStageHistory, Temperature, LeadStage } from "@/lib/db/schema"
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or } from "drizzle-orm"

export interface ConversionData {
  conversionAmount: string
  conversionCurrency: string
  conversionDate: Date
  metaPurchaseSentAt?: Date
  metaPurchaseStatus?: string
}

export async function markLeadConverted(
  leadId: string,
  orgId: string,
  data: ConversionData,
  changedBy: string
): Promise<void> {
  const current = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.orgId, orgId)),
    columns: { stage: true },
  })
  if (!current) return

  await Promise.all([
    db.update(leads)
      .set({
        converted: true,
        conversionAmount: data.conversionAmount,
        conversionCurrency: data.conversionCurrency,
        conversionDate: data.conversionDate,
        stage: "won",
        metaPurchaseSentAt: data.metaPurchaseSentAt,
        metaPurchaseStatus: data.metaPurchaseStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId))),
    db.insert(leadStageHistory).values({
      leadId,
      orgId,
      field: "stage",
      fromValue: current.stage,
      toValue: "won",
      changedBy,
    }),
    db.insert(leadStageHistory).values({
      leadId,
      orgId,
      field: "converted",
      fromValue: "false",
      toValue: "true",
      changedBy,
    }),
  ])
}

export interface LeadFilters {
  search?: string
  temperature?: Temperature | ""
  stage?: LeadStage | ""
  platform?: string
  device?: string
  converted?: boolean
  source?: "meta_ads" | "organic" | "imported" | ""
  activity?: "has_sale" | "pending_capi" | "checkout" | "cart_abandoned" | "form_submitted" | "info_requested" | ""
}

export interface LeadActivitySummary {
  hasCheckout: boolean
  hasAbandonedCart: boolean
  hasFormSubmit: boolean
  hasInfoRequest: boolean
  hasAddToCart: boolean
  lastEventAt: Date | null
}

export interface LeadWithActivity extends Lead {
  saleCount: number
  saleTotalAmount: string | null  // sum if uniform currency, null if mixed or no sales
  saleCurrency: string | null     // null if mixed or no sales
  hasPendingCapi: boolean
  activity: LeadActivitySummary
}

export type LeadWithHistory = Lead & { stageHistory: LeadStageHistory[] }

export async function getLeadsByCampaign(
  campaignId: string,
  orgId: string,
  filters: LeadFilters = {}
): Promise<Lead[]> {
  const searchCond = filters.search
    ? or(
        ilike(leads.name, `%${filters.search}%`),
        ilike(leads.email, `%${filters.search}%`),
        ilike(leads.phone, `%${filters.search}%`)
      )
    : undefined

  return db.query.leads.findMany({
    where: and(
      eq(leads.campaignId, campaignId),
      eq(leads.orgId, orgId),
      filters.temperature ? eq(leads.temperature, filters.temperature) : undefined,
      filters.stage ? eq(leads.stage, filters.stage) : undefined,
      filters.platform ? eq(leads.platform, filters.platform) : undefined,
      filters.device ? eq(leads.device, filters.device) : undefined,
      filters.source ? eq(leads.leadSource, filters.source) : undefined,
      searchCond,
    ),
    orderBy: (l, { desc }) => [desc(l.createdAt)],
  })
}

function emptyActivity(): LeadActivitySummary {
  return {
    hasCheckout: false,
    hasAbandonedCart: false,
    hasFormSubmit: false,
    hasInfoRequest: false,
    hasAddToCart: false,
    lastEventAt: null,
  }
}

export async function getLeadsByCampaignWithActivity(
  campaignId: string,
  orgId: string,
  filters: LeadFilters = {}
): Promise<LeadWithActivity[]> {
  const leadRows = await getLeadsByCampaign(campaignId, orgId, filters)
  if (leadRows.length === 0) return []

  const leadIds = leadRows.map((l) => l.id)

  const [convRows, eventRows, capiRows] = await Promise.all([
    db
      .select({
        leadId: conversions.leadId,
        amount: conversions.amount,
        currency: conversions.currency,
        status: conversions.status,
        convertedAt: conversions.convertedAt,
      })
      .from(conversions)
      .where(
        and(
          eq(conversions.orgId, orgId),
          inArray(conversions.leadId, leadIds),
          eq(conversions.status, "confirmed")
        )
      )
      .orderBy(desc(conversions.convertedAt)),

    db
      .select({
        leadId: leadBehaviorEvents.leadId,
        eventType: leadBehaviorEvents.eventType,
        occurredAt: leadBehaviorEvents.occurredAt,
      })
      .from(leadBehaviorEvents)
      .where(
        and(
          eq(leadBehaviorEvents.orgId, orgId),
          isNotNull(leadBehaviorEvents.leadId),
          inArray(leadBehaviorEvents.leadId, leadIds)
        )
      ),

    db
      .select({ leadId: metaEvents.leadId })
      .from(metaEvents)
      .where(
        and(
          eq(metaEvents.orgId, orgId),
          isNotNull(metaEvents.leadId),
          inArray(metaEvents.leadId, leadIds),
          or(eq(metaEvents.status, "pending"), eq(metaEvents.status, "retrying"))
        )
      ),
  ])

  const pendingCapiLeadIds = new Set<string>(
    capiRows.map((r) => r.leadId).filter((id): id is string => id !== null)
  )

  // Group all confirmed conversions per lead
  const convsByLead = new Map<string, typeof convRows>()
  for (const c of convRows) {
    if (!convsByLead.has(c.leadId)) convsByLead.set(c.leadId, [])
    convsByLead.get(c.leadId)!.push(c)
  }

  // Compute per-lead sale summary (sum if uniform currency, else show count only)
  const saleSummary = new Map<string, { count: number; totalAmount: string | null; currency: string | null }>()
  for (const [lid, convs] of convsByLead) {
    const currencies = new Set(convs.map((c) => c.currency))
    if (currencies.size === 1) {
      const total = convs.reduce((acc, c) => acc + parseFloat(c.amount), 0)
      saleSummary.set(lid, { count: convs.length, totalAmount: total.toFixed(2), currency: convs[0].currency })
    } else {
      saleSummary.set(lid, { count: convs.length, totalAmount: null, currency: null })
    }
  }

  const eventMap = new Map<string, LeadActivitySummary>()
  for (const e of eventRows) {
    if (!e.leadId) continue
    if (!eventMap.has(e.leadId)) eventMap.set(e.leadId, emptyActivity())
    const a = eventMap.get(e.leadId)!
    if (e.eventType === "begin_checkout") a.hasCheckout = true
    if (e.eventType === "checkout_abandoned") a.hasAbandonedCart = true
    if (e.eventType === "form_submitted") a.hasFormSubmit = true
    if (e.eventType === "info_requested") a.hasInfoRequest = true
    if (e.eventType === "add_to_cart") a.hasAddToCart = true
    if (!a.lastEventAt || (e.occurredAt && e.occurredAt > a.lastEventAt)) {
      a.lastEventAt = e.occurredAt
    }
  }

  let result: LeadWithActivity[] = leadRows.map((lead) => {
    const sale = saleSummary.get(lead.id) ?? { count: 0, totalAmount: null, currency: null }
    return {
      ...lead,
      saleCount: sale.count,
      saleTotalAmount: sale.totalAmount,
      saleCurrency: sale.currency,
      hasPendingCapi: pendingCapiLeadIds.has(lead.id),
      activity: eventMap.get(lead.id) ?? emptyActivity(),
    }
  })

  if (filters.activity === "has_sale") result = result.filter((l) => l.saleCount > 0)
  else if (filters.activity === "pending_capi") result = result.filter((l) => l.hasPendingCapi)
  else if (filters.activity === "checkout") result = result.filter((l) => l.activity.hasCheckout)
  else if (filters.activity === "cart_abandoned") result = result.filter((l) => l.activity.hasAbandonedCart)
  else if (filters.activity === "form_submitted") result = result.filter((l) => l.activity.hasFormSubmit)
  else if (filters.activity === "info_requested") result = result.filter((l) => l.activity.hasInfoRequest)

  return result
}

export async function getLeadsByClient(
  clientId: string,
  orgId: string,
  filters: LeadFilters = {}
): Promise<Lead[]> {
  const clientCampaigns = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.clientId, clientId), eq(campaigns.orgId, orgId)))

  if (clientCampaigns.length === 0) return []
  const campaignIds = clientCampaigns.map((c) => c.id)

  const searchCond = filters.search
    ? or(
        ilike(leads.name, `%${filters.search}%`),
        ilike(leads.email, `%${filters.search}%`),
        ilike(leads.phone, `%${filters.search}%`)
      )
    : undefined

  // Build converted filter
  let convertedCond: ReturnType<typeof eq> | ReturnType<typeof or> | undefined = undefined
  if (filters.converted === true) {
    convertedCond = eq(leads.converted, true)
  } else if (filters.converted === false) {
    convertedCond = or(eq(leads.converted, false), isNull(leads.converted)) as ReturnType<typeof or>
  }

  return db.query.leads.findMany({
    where: and(
      eq(leads.orgId, orgId),
      inArray(leads.campaignId, campaignIds),
      filters.temperature ? eq(leads.temperature, filters.temperature) : undefined,
      filters.stage ? eq(leads.stage, filters.stage) : undefined,
      filters.source ? eq(leads.leadSource, filters.source) : undefined,
      convertedCond,
      searchCond,
    ),
    orderBy: (l, { desc }) => [desc(l.createdAt)],
    limit: 500,
  })
}

export async function getLeadsByClientWithActivity(
  clientId: string,
  orgId: string,
  filters: LeadFilters = {}
): Promise<LeadWithActivity[]> {
  const leadRows = await getLeadsByClient(clientId, orgId, filters)
  if (leadRows.length === 0) return []

  const leadIds = leadRows.map((l) => l.id)

  const [convRows, eventRows, capiRows] = await Promise.all([
    db
      .select({
        leadId: conversions.leadId,
        amount: conversions.amount,
        currency: conversions.currency,
        status: conversions.status,
        convertedAt: conversions.convertedAt,
      })
      .from(conversions)
      .where(
        and(
          eq(conversions.orgId, orgId),
          inArray(conversions.leadId, leadIds),
          eq(conversions.status, "confirmed")
        )
      )
      .orderBy(desc(conversions.convertedAt)),

    db
      .select({
        leadId: leadBehaviorEvents.leadId,
        eventType: leadBehaviorEvents.eventType,
        occurredAt: leadBehaviorEvents.occurredAt,
      })
      .from(leadBehaviorEvents)
      .where(
        and(
          eq(leadBehaviorEvents.orgId, orgId),
          isNotNull(leadBehaviorEvents.leadId),
          inArray(leadBehaviorEvents.leadId, leadIds)
        )
      ),

    db
      .select({ leadId: metaEvents.leadId })
      .from(metaEvents)
      .where(
        and(
          eq(metaEvents.orgId, orgId),
          isNotNull(metaEvents.leadId),
          inArray(metaEvents.leadId, leadIds),
          or(eq(metaEvents.status, "pending"), eq(metaEvents.status, "retrying"))
        )
      ),
  ])

  const pendingCapiLeadIds = new Set<string>(
    capiRows.map((r) => r.leadId).filter((id): id is string => id !== null)
  )

  const convsByLead = new Map<string, typeof convRows>()
  for (const c of convRows) {
    if (!convsByLead.has(c.leadId)) convsByLead.set(c.leadId, [])
    convsByLead.get(c.leadId)!.push(c)
  }

  const saleSummary = new Map<string, { count: number; totalAmount: string | null; currency: string | null }>()
  for (const [lid, convs] of convsByLead) {
    const currencies = new Set(convs.map((c) => c.currency))
    if (currencies.size === 1) {
      const total = convs.reduce((acc, c) => acc + parseFloat(c.amount), 0)
      saleSummary.set(lid, { count: convs.length, totalAmount: total.toFixed(2), currency: convs[0].currency })
    } else {
      saleSummary.set(lid, { count: convs.length, totalAmount: null, currency: null })
    }
  }

  const eventMap = new Map<string, LeadActivitySummary>()
  for (const e of eventRows) {
    if (!e.leadId) continue
    if (!eventMap.has(e.leadId)) eventMap.set(e.leadId, emptyActivity())
    const a = eventMap.get(e.leadId)!
    if (e.eventType === "begin_checkout") a.hasCheckout = true
    if (e.eventType === "checkout_abandoned") a.hasAbandonedCart = true
    if (e.eventType === "form_submitted") a.hasFormSubmit = true
    if (e.eventType === "info_requested") a.hasInfoRequest = true
    if (e.eventType === "add_to_cart") a.hasAddToCart = true
    if (!a.lastEventAt || (e.occurredAt && e.occurredAt > a.lastEventAt)) {
      a.lastEventAt = e.occurredAt
    }
  }

  let result: LeadWithActivity[] = leadRows.map((lead) => {
    const sale = saleSummary.get(lead.id) ?? { count: 0, totalAmount: null, currency: null }
    return {
      ...lead,
      saleCount: sale.count,
      saleTotalAmount: sale.totalAmount,
      saleCurrency: sale.currency,
      hasPendingCapi: pendingCapiLeadIds.has(lead.id),
      activity: eventMap.get(lead.id) ?? emptyActivity(),
    }
  })

  if (filters.activity === "has_sale") result = result.filter((l) => l.saleCount > 0)
  else if (filters.activity === "pending_capi") result = result.filter((l) => l.hasPendingCapi)
  else if (filters.activity === "checkout") result = result.filter((l) => l.activity.hasCheckout)
  else if (filters.activity === "cart_abandoned") result = result.filter((l) => l.activity.hasAbandonedCart)
  else if (filters.activity === "form_submitted") result = result.filter((l) => l.activity.hasFormSubmit)
  else if (filters.activity === "info_requested") result = result.filter((l) => l.activity.hasInfoRequest)

  return result
}

export async function getLeadDetail(
  leadId: string,
  orgId: string
): Promise<LeadWithHistory | null> {
  const result = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.orgId, orgId)),
    with: {
      stageHistory: {
        orderBy: (h, { desc }) => [desc(h.changedAt)],
      },
    },
  })
  return result ?? null
}

async function logChange(
  leadId: string,
  orgId: string,
  field: string,
  fromValue: string | null,
  toValue: string | null,
  changedBy: string
) {
  await db.insert(leadStageHistory).values({ leadId, orgId, field, fromValue, toValue, changedBy })
}

export async function updateLeadTemperature(
  leadId: string,
  orgId: string,
  temperature: Temperature,
  changedBy: string
) {
  const current = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.orgId, orgId)),
    columns: { temperature: true },
  })
  if (!current) return
  await Promise.all([
    db.update(leads)
      .set({ temperature, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId))),
    logChange(leadId, orgId, "temperature", current.temperature, temperature, changedBy),
  ])
}

export async function updateLeadStage(
  leadId: string,
  orgId: string,
  stage: LeadStage,
  changedBy: string
) {
  const current = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.orgId, orgId)),
    columns: { stage: true },
  })
  if (!current) return
  await Promise.all([
    db.update(leads)
      .set({ stage, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId))),
    logChange(leadId, orgId, "stage", current.stage, stage, changedBy),
  ])
}

export async function updateLeadNotes(leadId: string, orgId: string, notes: string) {
  await db.update(leads)
    .set({ notes, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
}

export async function updateLeadInfo(
  leadId: string,
  orgId: string,
  data: { name?: string | null; email?: string | null; phone?: string | null; city?: string | null }
) {
  // name is NOT NULL in schema — only update it when a non-empty value is provided
  const set: {
    updatedAt: Date
    name?: string
    email?: string | null
    phone?: string | null
    city?: string | null
  } = { updatedAt: new Date() }
  if (data.name) set.name = data.name
  if ("email" in data) set.email = data.email
  if ("phone" in data) set.phone = data.phone
  if ("city" in data) set.city = data.city
  await db.update(leads)
    .set(set)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
}

export async function assignLead(
  leadId: string,
  orgId: string,
  assignedTo: string | null,
  changedBy: string
) {
  const current = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.orgId, orgId)),
    columns: { assignedTo: true },
  })
  if (!current) return
  await Promise.all([
    db.update(leads)
      .set({ assignedTo, assignedAt: assignedTo ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId))),
    logChange(leadId, orgId, "assignedTo", current.assignedTo ?? null, assignedTo, changedBy),
  ])
}
