import "server-only"

import { db } from "@/lib/db"
import { aiProviderKeys } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { encryptTokenVersioned, decryptTokenVersioned } from "@/lib/crypto"

export type ProviderName = "anthropic" | "openai" | "google"

export async function getProviderApiKey(
  orgId: string,
  provider: ProviderName
): Promise<string | null> {
  const rows = await db
    .select({ keyEnc: aiProviderKeys.keyEnc })
    .from(aiProviderKeys)
    .where(and(eq(aiProviderKeys.orgId, orgId), eq(aiProviderKeys.provider, provider)))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  try {
    return decryptTokenVersioned(row.keyEnc)
  } catch {
    return null
  }
}

export async function upsertProviderApiKey(
  orgId: string,
  provider: ProviderName,
  plainKey: string
): Promise<void> {
  const { ciphertext, keyVersion } = encryptTokenVersioned(plainKey)

  await db
    .insert(aiProviderKeys)
    .values({ orgId, provider, keyEnc: ciphertext, keyVersion })
    .onConflictDoUpdate({
      target: [aiProviderKeys.orgId, aiProviderKeys.provider],
      set: { keyEnc: ciphertext, keyVersion, updatedAt: new Date() },
    })
}

export async function deleteProviderApiKey(
  orgId: string,
  provider: ProviderName
): Promise<void> {
  await db
    .delete(aiProviderKeys)
    .where(and(eq(aiProviderKeys.orgId, orgId), eq(aiProviderKeys.provider, provider)))
}

export async function listConfiguredProviders(orgId: string): Promise<ProviderName[]> {
  const rows = await db
    .select({ provider: aiProviderKeys.provider })
    .from(aiProviderKeys)
    .where(eq(aiProviderKeys.orgId, orgId))

  return rows.map(r => r.provider as ProviderName)
}
