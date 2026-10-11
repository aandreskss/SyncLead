import "server-only"
import { db } from "@/lib/db"
import {
  waOauthStates,
  waBusinessAccounts,
  waPhoneNumbers,
} from "@/lib/db/schema"
import { eq, and, lt } from "drizzle-orm"
import { encryptTokenVersioned } from "@/lib/crypto"
import type { WaConnectionMode, WaConnectionStatus } from "./types"

// ─── Status normalization ─────────────────────────────────────────────────────

// Meta returns uppercase status values (CONNECTED, DISCONNECTED, PENDING, etc.)
// We normalize to our internal lowercase values.
function normalizeMetaPhoneStatus(s?: string | null): string {
  const up = (s ?? "").toUpperCase()
  if (up === "CONNECTED" || up === "ACTIVE") return "active"
  if (up === "PENDING" || up === "PENDING_DELETION") return "pending"
  return "active" // default to active — if Meta sent us the phone, it works
}

// ─── OAuth state ──────────────────────────────────────────────────────────────

export async function createOauthState(
  orgId: string,
  returnPath = "/dashboard/settings/channels",
  wabaIdHint?: string
): Promise<string> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  const [row] = await db
    .insert(waOauthStates)
    .values({ orgId, returnPath, wabaIdHint: wabaIdHint ?? null, expiresAt })
    .returning({ id: waOauthStates.id })
  return row!.id
}

export type StateValidationResult =
  | { ok: true; orgId: string; returnPath: string; wabaIdHint: string | null }
  | { ok: false; reason: "not_found" | "expired" | "consumed" }

export async function consumeOauthState(stateId: string): Promise<StateValidationResult> {
  const rows = await db
    .select()
    .from(waOauthStates)
    .where(eq(waOauthStates.id, stateId))
    .limit(1)

  const state = rows[0]
  if (!state) return { ok: false, reason: "not_found" }
  if (state.expiresAt < new Date()) return { ok: false, reason: "expired" }
  if (state.consumedAt) return { ok: false, reason: "consumed" }

  // Mark consumed (one-time use)
  await db
    .update(waOauthStates)
    .set({ consumedAt: new Date() })
    .where(eq(waOauthStates.id, stateId))

  return { ok: true, orgId: state.orgId, returnPath: state.returnPath, wabaIdHint: state.wabaIdHint }
}

export async function cleanExpiredStates(): Promise<void> {
  await db
    .delete(waOauthStates)
    .where(lt(waOauthStates.expiresAt, new Date()))
    .catch(() => undefined) // best-effort
}

// ─── WABA + phone number persistence ─────────────────────────────────────────

export type StoreConnectionParams = {
  orgId: string
  wabaId: string
  wabaName: string
  accessToken: string
  scopes: string[]
  tokenExpiresAt?: Date
  connectionMode: WaConnectionMode
  connectionStatus: WaConnectionStatus
  webhookVerifyToken?: string
  phoneNumbers: Array<{
    phoneNumberId: string
    displayPhoneNumber: string
    verifiedName?: string
    qualityRating?: string
    status?: string
  }>
}

export type StoreConnectionResult =
  | { ok: true; wabaRecordId: string }
  | { ok: false; reason: "number_conflict"; conflictingPhoneId: string }

export async function storeOrUpdateConnection(params: StoreConnectionParams): Promise<StoreConnectionResult> {
  // Check if any phone_number_id belongs to a DIFFERENT org (global conflict)
  for (const phone of params.phoneNumbers) {
    const existing = await db
      .select({ id: waPhoneNumbers.id, orgId: waPhoneNumbers.orgId })
      .from(waPhoneNumbers)
      .where(eq(waPhoneNumbers.phoneNumberId, phone.phoneNumberId))
      .limit(1)

    const row = existing[0]
    if (row && row.orgId !== params.orgId) {
      return { ok: false, reason: "number_conflict", conflictingPhoneId: phone.phoneNumberId }
    }
  }

  const { ciphertext: accessTokenEnc } = encryptTokenVersioned(params.accessToken)
  const verifyToken = params.webhookVerifyToken ?? crypto.randomUUID()

  // Upsert WABA record
  const [wabaRow] = await db
    .insert(waBusinessAccounts)
    .values({
      orgId: params.orgId,
      wabaId: params.wabaId,
      displayName: params.wabaName,
      accessTokenEnc,
      keyVersion: 1,
      status: params.connectionStatus === "active" ? "active" : params.connectionStatus,
      webhookVerifyToken: verifyToken,
      connectionMode: params.connectionMode,
      connectionStatus: params.connectionStatus,
      oauthScopes: params.scopes,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
      connectedAt: new Date(),
      lastError: null,
      lastErrorCode: null,
    })
    .onConflictDoUpdate({
      target: waBusinessAccounts.wabaId,
      set: {
        displayName: params.wabaName,
        accessTokenEnc,
        keyVersion: 1,
        status: params.connectionStatus === "active" ? "active" : params.connectionStatus,
        connectionMode: params.connectionMode,
        connectionStatus: params.connectionStatus,
        oauthScopes: params.scopes,
        tokenExpiresAt: params.tokenExpiresAt ?? null,
        connectedAt: new Date(),
        lastError: null,
        lastErrorCode: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: waBusinessAccounts.id })

  const wabaRecordId = wabaRow!.id

  // Upsert phone numbers
  for (const phone of params.phoneNumbers) {
    await db
      .insert(waPhoneNumbers)
      .values({
        orgId: params.orgId,
        wabaAccountId: wabaRecordId,
        phoneNumberId: phone.phoneNumberId,
        displayPhoneNumber: phone.displayPhoneNumber,
        verifiedName: phone.verifiedName ?? null,
        qualityRating: phone.qualityRating ?? null,
        status: normalizeMetaPhoneStatus(phone.status),
      })
      .onConflictDoUpdate({
        target: waPhoneNumbers.phoneNumberId,
        set: {
          displayPhoneNumber: phone.displayPhoneNumber,
          verifiedName: phone.verifiedName ?? null,
          qualityRating: phone.qualityRating ?? null,
          status: normalizeMetaPhoneStatus(phone.status),
          updatedAt: new Date(),
        },
      })
      .catch(() => undefined) // cross-tenant conflicts blocked earlier
  }

  return { ok: true, wabaRecordId }
}

export async function markWabaDisconnected(wabaId: string, orgId: string): Promise<void> {
  await db
    .update(waBusinessAccounts)
    .set({
      connectionStatus: "disconnected",
      status: "disconnected",
      lastError: null,
      lastErrorCode: null,
      updatedAt: new Date(),
    })
    .where(and(eq(waBusinessAccounts.wabaId, wabaId), eq(waBusinessAccounts.orgId, orgId)))

  // Mark phone numbers inactive
  const waba = await db
    .select({ id: waBusinessAccounts.id })
    .from(waBusinessAccounts)
    .where(and(eq(waBusinessAccounts.wabaId, wabaId), eq(waBusinessAccounts.orgId, orgId)))
    .limit(1)

  if (waba[0]) {
    await db
      .update(waPhoneNumbers)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(waPhoneNumbers.wabaAccountId, waba[0].id))
  }
}

export async function markWabaError(wabaId: string, orgId: string, error: string, code?: string): Promise<void> {
  await db
    .update(waBusinessAccounts)
    .set({
      connectionStatus: "error",
      status: "error",
      lastError: error,
      lastErrorCode: code ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(waBusinessAccounts.wabaId, wabaId), eq(waBusinessAccounts.orgId, orgId)))
}

export async function getWabaWithToken(wabaId: string, orgId: string) {
  const rows = await db
    .select()
    .from(waBusinessAccounts)
    .where(and(eq(waBusinessAccounts.wabaId, wabaId), eq(waBusinessAccounts.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}
