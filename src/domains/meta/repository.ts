import { db } from "@/lib/db"
import { metaConnections } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import type { MetaConnection, NewMetaConnection } from "@/lib/db/schema"

export async function getMetaConnectionsByClientId(
  clientId: string,
  orgId: string
): Promise<MetaConnection[]> {
  return db.query.metaConnections.findMany({
    where: and(eq(metaConnections.clientId, clientId), eq(metaConnections.orgId, orgId)),
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  })
}

export async function getActiveMetaConnectionByClientId(
  clientId: string,
  orgId: string
): Promise<MetaConnection | undefined> {
  return db.query.metaConnections.findFirst({
    where: and(
      eq(metaConnections.clientId, clientId),
      eq(metaConnections.orgId, orgId),
      eq(metaConnections.status, "active"),
    ),
  })
}

export async function getActiveMetaConnectionByPixelId(
  pixelId: string,
  orgId: string
): Promise<MetaConnection | undefined> {
  return db.query.metaConnections.findFirst({
    where: and(
      eq(metaConnections.pixelId, pixelId),
      eq(metaConnections.orgId, orgId),
      eq(metaConnections.status, "active"),
    ),
  })
}

export async function getMetaConnectionById(
  id: string,
  orgId: string
): Promise<MetaConnection | undefined> {
  return db.query.metaConnections.findFirst({
    where: and(eq(metaConnections.id, id), eq(metaConnections.orgId, orgId)),
  })
}

export async function createMetaConnection(
  data: NewMetaConnection
): Promise<MetaConnection> {
  const [row] = await db.insert(metaConnections).values(data).returning()
  return row
}

export async function updateMetaConnectionStatus(
  id: string,
  orgId: string,
  status: "active" | "error" | "expired" | "pending",
  extra?: { lastVerifiedAt?: Date; lastError?: string | null }
): Promise<void> {
  await db
    .update(metaConnections)
    .set({ status, updatedAt: new Date(), ...(extra ?? {}) })
    .where(and(eq(metaConnections.id, id), eq(metaConnections.orgId, orgId)))
}

export async function deleteMetaConnection(id: string, orgId: string): Promise<void> {
  await db
    .delete(metaConnections)
    .where(and(eq(metaConnections.id, id), eq(metaConnections.orgId, orgId)))
}
