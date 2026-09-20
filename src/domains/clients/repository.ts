import { db } from "@/lib/db"
import { clients } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import type { Client, NewClient } from "@/lib/db/schema"

export async function getClientsByOrgId(orgId: string): Promise<Client[]> {
  return db.query.clients.findMany({
    where: eq(clients.orgId, orgId),
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  })
}

export async function getClientById(
  clientId: string,
  orgId: string
): Promise<Client | undefined> {
  return db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.orgId, orgId)),
  })
}

export async function createClient(data: NewClient): Promise<Client> {
  const [client] = await db.insert(clients).values(data).returning()
  return client
}

export async function updateClient(
  clientId: string,
  orgId: string,
  data: Partial<NewClient>
): Promise<Client | undefined> {
  const [updated] = await db
    .update(clients)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    .returning()
  return updated
}

export async function deleteClient(clientId: string, orgId: string): Promise<void> {
  await db
    .delete(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
}
