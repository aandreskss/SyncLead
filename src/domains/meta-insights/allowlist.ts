import "server-only"

import { db } from "@/lib/db"
import { metaAdAccountAllowlist } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import type { AllowlistEntry } from "./types"

function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`
}

// Env-based allowlist: META_ALLOWED_AD_ACCOUNTS=act_111,act_222
// Lets beta testers be authorized without a DB row.
function getEnvAllowlist(): Set<string> {
  const raw = process.env.META_ALLOWED_AD_ACCOUNTS ?? ""
  return new Set(
    raw.split(",")
      .map((s) => normalizeAccountId(s.trim()))
      .filter(Boolean)
  )
}

export async function isAdAccountAllowed(adAccountId: string, orgId: string): Promise<boolean> {
  const normalized = normalizeAccountId(adAccountId)

  if (getEnvAllowlist().has(normalized)) return true

  const row = await db.query.metaAdAccountAllowlist.findFirst({
    where: and(
      eq(metaAdAccountAllowlist.orgId, orgId),
      eq(metaAdAccountAllowlist.adAccountId, normalized),
      eq(metaAdAccountAllowlist.active, true),
    ),
  })
  return !!row
}

export async function getAllowedAdAccounts(orgId: string): Promise<AllowlistEntry[]> {
  const rows = await db.query.metaAdAccountAllowlist.findMany({
    where: eq(metaAdAccountAllowlist.orgId, orgId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })
  return rows.map((r) => ({
    id: r.id,
    adAccountId: r.adAccountId,
    notes: r.notes,
    active: r.active,
    createdAt: r.createdAt,
  }))
}

export async function addToAllowlist(
  orgId: string,
  adAccountId: string,
  addedById: string | undefined,
  notes?: string
): Promise<void> {
  const normalized = normalizeAccountId(adAccountId)
  await db
    .insert(metaAdAccountAllowlist)
    .values({
      orgId,
      adAccountId: normalized,
      addedById: addedById ?? null,
      notes: notes ?? null,
      active: true,
    })
    .onConflictDoUpdate({
      target: [metaAdAccountAllowlist.orgId, metaAdAccountAllowlist.adAccountId],
      set: { active: true, notes: notes ?? null, updatedAt: new Date() },
    })
}

export async function removeFromAllowlist(
  orgId: string,
  adAccountId: string
): Promise<void> {
  const normalized = normalizeAccountId(adAccountId)
  await db
    .update(metaAdAccountAllowlist)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(metaAdAccountAllowlist.orgId, orgId),
        eq(metaAdAccountAllowlist.adAccountId, normalized),
      )
    )
}
