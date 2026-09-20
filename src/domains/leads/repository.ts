import { db } from "@/lib/db"
import { leads, leadStageHistory, campaigns } from "@/lib/db/schema"
import type { Lead, LeadStageHistory, Temperature, LeadStage } from "@/lib/db/schema"
import { and, eq, ilike, inArray, or } from "drizzle-orm"

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
      searchCond,
    ),
    orderBy: (l, { desc }) => [desc(l.createdAt)],
  })
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

  return db.query.leads.findMany({
    where: and(
      eq(leads.orgId, orgId),
      inArray(leads.campaignId, campaignIds),
      filters.temperature ? eq(leads.temperature, filters.temperature) : undefined,
      filters.stage ? eq(leads.stage, filters.stage) : undefined,
      searchCond,
    ),
    orderBy: (l, { desc }) => [desc(l.createdAt)],
    limit: 500,
  })
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
