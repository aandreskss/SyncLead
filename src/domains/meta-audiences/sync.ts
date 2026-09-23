import "server-only"
import { db } from "@/lib/db"
import { leads, conversions, leadBehaviorEvents } from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { decryptTokenVersioned } from "@/lib/crypto"
import {
  createCustomAudience,
  syncUsersToAudience,
  type AudienceUser,
} from "@/lib/meta-audiences"
import {
  getAudienceByType,
  upsertAudience,
  recordSyncResult,
} from "./repository"
import { getActiveMetaConnectionByClientId } from "@/domains/meta/repository"

const AUDIENCE_DEFS = [
  {
    type: "buyers",
    name: (clientName: string) => `SyncLead: Compradores — ${clientName}`,
    description: "Leads que completaron una compra. Sincronizado automáticamente por SyncLead.",
  },
  {
    type: "cart_abandoners",
    name: (clientName: string) => `SyncLead: Carrito abandonado — ${clientName}`,
    description: "Leads que iniciaron checkout pero no compraron. Para retargeting.",
  },
  {
    type: "exclusion",
    name: (clientName: string) => `SyncLead: Descartados — ${clientName}`,
    description: "Leads no calificados. Excluir de prospección para ahorrar presupuesto.",
  },
]

async function resolveLeadUsers(leadIds: string[], orgId: string): Promise<AudienceUser[]> {
  if (leadIds.length === 0) return []
  const rows = await db
    .select({ email: leads.email, phone: leads.phone })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), inArray(leads.id, leadIds)))
  return rows.filter((r) => r.email || r.phone)
}

export async function syncClientAudiences(
  clientId: string,
  clientName: string,
  orgId: string
): Promise<{ synced: number; errors: number }> {
  const conn = await getActiveMetaConnectionByClientId(clientId, orgId)
  if (!conn || !conn.adAccountId || !conn.accessTokenEnc || !conn.pixelId) {
    return { synced: 0, errors: 0 }
  }

  let accessToken: string
  try {
    accessToken = decryptTokenVersioned(conn.accessTokenEnc)
  } catch {
    return { synced: 0, errors: 1 }
  }

  // ── Fetch leads for each audience type ───────────────────────────────────
  const allLeads = await db
    .select({ id: leads.id, temperature: leads.temperature })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), eq(leads.campaignId, clientId)))

  // buyers: leads with confirmed conversions
  const buyerLeadIds = (
    await db
      .selectDistinct({ leadId: conversions.leadId })
      .from(conversions)
      .where(and(eq(conversions.orgId, orgId), eq(conversions.status, "confirmed")))
  ).map((r) => r.leadId).filter(Boolean) as string[]

  // cart_abandoners: leads with begin_checkout but no confirmed conversion
  const buyerSet = new Set(buyerLeadIds)
  const checkoutLeadIds = (
    await db
      .selectDistinct({ leadId: leadBehaviorEvents.leadId })
      .from(leadBehaviorEvents)
      .where(and(eq(leadBehaviorEvents.orgId, orgId), eq(leadBehaviorEvents.eventType, "begin_checkout")))
  ).map((r) => r.leadId).filter((id): id is string => !!id && !buyerSet.has(id))

  // exclusion: cold + not in buyers
  const coldLeadIds = allLeads
    .filter((l) => l.temperature === "cold" && !buyerSet.has(l.id))
    .map((l) => l.id)

  const audienceData: Record<string, AudienceUser[]> = {
    buyers: await resolveLeadUsers(buyerLeadIds, orgId),
    cart_abandoners: await resolveLeadUsers(checkoutLeadIds, orgId),
    exclusion: await resolveLeadUsers(coldLeadIds, orgId),
  }

  let synced = 0
  let errors = 0

  for (const def of AUDIENCE_DEFS) {
    // Ensure audience record exists
    let record = await getAudienceByType(conn.id, def.type)
    if (!record) {
      record = await upsertAudience({
        orgId,
        clientId,
        metaConnectionId: conn.id,
        audienceType: def.type,
        name: def.name(clientName),
      })
    }

    // Create Meta audience if needed
    if (!record.metaAudienceId) {
      const createResult = await createCustomAudience(
        conn.adAccountId,
        accessToken,
        def.name(clientName),
        def.description
      )
      if ("error" in createResult) {
        await recordSyncResult(record.id, orgId, { error: createResult.error })
        errors++
        continue
      }
      await recordSyncResult(record.id, orgId, { metaAudienceId: createResult.audienceId })
      record = { ...record, metaAudienceId: createResult.audienceId }
    }

    // Sync users
    const users = audienceData[def.type] ?? []
    const syncResult = await syncUsersToAudience(record.metaAudienceId!, accessToken, users)
    if ("error" in syncResult) {
      await recordSyncResult(record.id, orgId, { error: syncResult.error })
      errors++
    } else {
      await recordSyncResult(record.id, orgId, { memberCount: syncResult.memberCount })
      synced++
    }
  }

  return { synced, errors }
}
