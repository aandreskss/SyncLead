"use server"
import { requireClientAccess } from "@/lib/auth/server"
import { getAudiencesByClient } from "./repository"
import { syncClientAudiences } from "./sync"
import { getCapiSignalQuality } from "@/domains/meta/signal-quality"
import { getActiveMetaConnectionByClientId } from "@/domains/meta/repository"
import { decryptTokenVersioned } from "@/lib/crypto"
import { db } from "@/lib/db"
import { clients } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import type { MetaCustomAudience } from "@/lib/db/schema"
import type { SignalQualityResult } from "@/domains/meta/signal-quality"

export type AudiencePublic = Pick<
  MetaCustomAudience,
  "id" | "audienceType" | "name" | "memberCount" | "lastSyncedAt" | "lastError" | "syncEnabled" | "metaAudienceId"
>

export async function getAudiencesAction(
  clientId: string
): Promise<{ data?: AudiencePublic[]; error?: string }> {
  try {
    const ctx = await requireClientAccess(clientId)
    const rows = await getAudiencesByClient(clientId, ctx.orgId)
    return {
      data: rows.map((r) => ({
        id: r.id,
        audienceType: r.audienceType,
        name: r.name,
        memberCount: r.memberCount,
        lastSyncedAt: r.lastSyncedAt,
        lastError: r.lastError,
        syncEnabled: r.syncEnabled,
        metaAudienceId: r.metaAudienceId,
      })),
    }
  } catch {
    return { error: "forbidden" }
  }
}

export async function triggerAudienceSyncAction(
  clientId: string
): Promise<{ synced?: number; errors?: number; error?: string }> {
  try {
    const ctx = await requireClientAccess(clientId)

    const clientRow = await db.query.clients.findFirst({
      where: and(eq(clients.id, clientId), eq(clients.orgId, ctx.orgId)),
      columns: { name: true },
    })
    if (!clientRow) return { error: "not_found" }

    const result = await syncClientAudiences(clientId, clientRow.name, ctx.orgId)
    return result
  } catch {
    return { error: "sync_failed" }
  }
}

export async function getSignalQualityAction(
  clientId: string
): Promise<SignalQualityResult> {
  try {
    const ctx = await requireClientAccess(clientId)
    const conn = await getActiveMetaConnectionByClientId(clientId, ctx.orgId)
    if (!conn?.pixelId || !conn.accessTokenEnc) return { error: "no_connection" }

    const token = decryptTokenVersioned(conn.accessTokenEnc)
    return getCapiSignalQuality(conn.pixelId, token)
  } catch {
    return { error: "forbidden" }
  }
}
