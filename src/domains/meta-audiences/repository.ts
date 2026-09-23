import "server-only"
import { db } from "@/lib/db"
import { metaCustomAudiences, type MetaCustomAudience } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function getAudiencesByClient(
  clientId: string,
  orgId: string
): Promise<MetaCustomAudience[]> {
  return db
    .select()
    .from(metaCustomAudiences)
    .where(and(eq(metaCustomAudiences.clientId, clientId), eq(metaCustomAudiences.orgId, orgId)))
    .orderBy(metaCustomAudiences.audienceType)
}

export async function getAudienceByType(
  metaConnectionId: string,
  audienceType: string
): Promise<MetaCustomAudience | null> {
  const rows = await db
    .select()
    .from(metaCustomAudiences)
    .where(
      and(
        eq(metaCustomAudiences.metaConnectionId, metaConnectionId),
        eq(metaCustomAudiences.audienceType, audienceType)
      )
    )
    .limit(1)
  return rows[0] ?? null
}

export async function upsertAudience(data: {
  orgId: string
  clientId: string
  metaConnectionId: string
  audienceType: string
  name: string
  metaAudienceId?: string
}): Promise<MetaCustomAudience> {
  const rows = await db
    .insert(metaCustomAudiences)
    .values({
      orgId: data.orgId,
      clientId: data.clientId,
      metaConnectionId: data.metaConnectionId,
      audienceType: data.audienceType,
      name: data.name,
      metaAudienceId: data.metaAudienceId ?? null,
    })
    .onConflictDoUpdate({
      target: [metaCustomAudiences.metaConnectionId, metaCustomAudiences.audienceType],
      set: { name: data.name, updatedAt: new Date() },
    })
    .returning()
  return rows[0]
}

export async function recordSyncResult(
  id: string,
  orgId: string,
  result: { memberCount?: number; metaAudienceId?: string; error?: string }
): Promise<void> {
  await db
    .update(metaCustomAudiences)
    .set({
      ...(result.metaAudienceId !== undefined ? { metaAudienceId: result.metaAudienceId } : {}),
      ...(result.memberCount !== undefined ? { memberCount: result.memberCount } : {}),
      lastError: result.error ?? null,
      lastSyncedAt: result.error ? undefined : new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(metaCustomAudiences.id, id), eq(metaCustomAudiences.orgId, orgId)))
}

export async function getAllSyncEnabledAudiences(): Promise<MetaCustomAudience[]> {
  return db
    .select()
    .from(metaCustomAudiences)
    .where(eq(metaCustomAudiences.syncEnabled, true))
}
