import "server-only"

import { db } from "@/lib/db"
import { metaLeadAdSources } from "@/lib/db/schema"
import { and, eq, or, isNull } from "drizzle-orm"
import type { NewMetaLeadAdSource } from "@/lib/db/schema"

export async function getLeadAdSourceByCampaign(campaignId: string, orgId: string) {
  return db.query.metaLeadAdSources.findFirst({
    where: and(
      eq(metaLeadAdSources.campaignId, campaignId),
      eq(metaLeadAdSources.orgId, orgId),
    ),
  })
}

/** Lookup by pageId + optional formId for webhook routing. */
export async function getLeadAdSourceByPage(pageId: string, formId?: string | null) {
  return db.query.metaLeadAdSources.findFirst({
    where: and(
      eq(metaLeadAdSources.pageId, pageId),
      eq(metaLeadAdSources.active, true),
      formId
        ? or(eq(metaLeadAdSources.formId, formId), isNull(metaLeadAdSources.formId))
        : isNull(metaLeadAdSources.formId),
    ),
  })
}

export async function upsertLeadAdSource(data: NewMetaLeadAdSource) {
  const [row] = await db
    .insert(metaLeadAdSources)
    .values(data)
    .onConflictDoUpdate({
      target: [metaLeadAdSources.pageId, metaLeadAdSources.formId],
      set: {
        campaignId: data.campaignId,
        orgId: data.orgId,
        pageAccessTokenEnc: data.pageAccessTokenEnc,
        keyVersion: data.keyVersion,
        active: true,
      },
    })
    .returning()
  return row
}

export async function deleteLeadAdSource(id: string, orgId: string) {
  await db
    .delete(metaLeadAdSources)
    .where(and(eq(metaLeadAdSources.id, id), eq(metaLeadAdSources.orgId, orgId)))
}
