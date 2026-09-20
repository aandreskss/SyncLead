"use server"

import { db } from "@/lib/db"
import { auditLogs } from "@/lib/db/schema"
import { requireClientAccess } from "@/lib/auth/server"
import { encryptTokenVersioned, decryptTokenVersioned } from "@/lib/crypto"
import { verifyMetaConnection, sendTestLeadEvent } from "./verify"
import {
  getMetaConnectionsByClientId,
  getMetaConnectionById,
  createMetaConnection,
  updateMetaConnectionStatus,
  deleteMetaConnection,
} from "./repository"
import type { MetaConnection } from "@/lib/db/schema"

// Shape returned to the browser — never includes accessTokenEnc
export type MetaConnectionPublic = {
  id: string
  pixelId: string | null
  datasetId: string | null
  graphApiVersion: string
  status: "active" | "error" | "expired" | "pending"
  scopes: string[]
  expiresAt: Date | null
  lastVerifiedAt: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}

function toPublic(conn: MetaConnection): MetaConnectionPublic {
  return {
    id: conn.id,
    pixelId: conn.pixelId,
    datasetId: conn.datasetId,
    graphApiVersion: conn.graphApiVersion,
    status: conn.status,
    scopes: conn.scopes,
    expiresAt: conn.expiresAt,
    lastVerifiedAt: conn.lastVerifiedAt,
    lastError: conn.lastError,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  }
}

export async function getMetaConnectionsAction(
  clientId: string
): Promise<MetaConnectionPublic[]> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return [] }
  const conns = await getMetaConnectionsByClientId(clientId, ctx.orgId)
  return conns.map(toPublic)
}

export async function saveMetaConnectionAction(
  clientId: string,
  pixelId: string,
  accessToken: string,
  datasetId?: string
): Promise<{ success: boolean; error?: string; connection?: MetaConnectionPublic }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch {
    return { success: false, error: "No autorizado" }
  }

  if (!pixelId || pixelId.trim().length === 0 || pixelId.length > 30) {
    return { success: false, error: "Pixel ID inválido" }
  }
  if (!accessToken || accessToken.length > 500) {
    return { success: false, error: "Token inválido" }
  }

  const graphApiVersion = process.env.META_GRAPH_API_VERSION ?? "v19.0"

  const verifyResult = await verifyMetaConnection(accessToken, pixelId.trim(), graphApiVersion)
  if (!verifyResult.ok) {
    const messages: Record<string, string> = {
      invalid_token: "Token inválido o revocado",
      expired: "Token expirado",
      no_pixel_access: "El token no tiene acceso a este Pixel",
      network_error: "Error de red al verificar con Meta",
      unknown: "Error de verificación",
    }
    return { success: false, error: messages[verifyResult.reason] ?? "Error desconocido" }
  }

  const { ciphertext, keyVersion } = encryptTokenVersioned(accessToken)

  const conn = await createMetaConnection({
    orgId: ctx.orgId,
    clientId,
    pixelId: pixelId.trim(),
    datasetId: datasetId?.trim() || null,
    accessTokenEnc: ciphertext,
    keyVersion,
    graphApiVersion,
    status: "active",
    scopes: verifyResult.scopes,
    expiresAt: verifyResult.expiresAt,
    lastVerifiedAt: new Date(),
    lastError: null,
  })

  await db.insert(auditLogs).values({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "meta_connection.created",
    resourceType: "meta_connection",
    resourceId: conn.id,
    metadata: { clientId, pixelId: pixelId.trim(), graphApiVersion },
  })

  return { success: true, connection: toPublic(conn) }
}

export async function testMetaConnectionAction(
  connectionId: string,
  clientId: string
): Promise<{ success: boolean; sent: boolean; status: string; error?: string }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch {
    return { success: false, sent: false, status: "unauthorized" }
  }

  const conn = await getMetaConnectionById(connectionId, ctx.orgId)
  if (!conn || conn.clientId !== clientId) {
    return { success: false, sent: false, status: "not_found" }
  }
  if (!conn.accessTokenEnc || !conn.pixelId) {
    return { success: false, sent: false, status: "no_credentials" }
  }

  let accessToken: string
  try {
    accessToken = decryptTokenVersioned(conn.accessTokenEnc)
  } catch {
    return { success: false, sent: false, status: "decrypt_error" }
  }

  const result = await sendTestLeadEvent(accessToken, conn.pixelId, conn.graphApiVersion)

  if (result.sent) {
    await updateMetaConnectionStatus(conn.id, ctx.orgId, "active", {
      lastVerifiedAt: new Date(),
      lastError: null,
    })
  } else {
    await updateMetaConnectionStatus(conn.id, ctx.orgId, "error", {
      lastError: result.status,
    })
  }

  return { success: true, sent: result.sent, status: result.status }
}

export async function disconnectMetaConnectionAction(
  connectionId: string,
  clientId: string
): Promise<{ success: boolean; error?: string }> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch {
    return { success: false, error: "No autorizado" }
  }

  const conn = await getMetaConnectionById(connectionId, ctx.orgId)
  if (!conn || conn.clientId !== clientId) {
    return { success: false, error: "Conexión no encontrada" }
  }

  await deleteMetaConnection(connectionId, ctx.orgId)

  await db.insert(auditLogs).values({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "meta_connection.disconnected",
    resourceType: "meta_connection",
    resourceId: connectionId,
    metadata: { clientId, pixelId: conn.pixelId },
  })

  return { success: true }
}
