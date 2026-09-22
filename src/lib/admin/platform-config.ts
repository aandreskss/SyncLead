import "server-only"
import { db } from "@/lib/db"
import { platformConfig } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function getPlatformConfig<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const row = await db
      .select({ value: platformConfig.value })
      .from(platformConfig)
      .where(eq(platformConfig.key, key))
      .limit(1)
    if (!row.length) return defaultValue
    return row[0].value as T
  } catch {
    return defaultValue
  }
}

export async function setPlatformConfig(key: string, value: unknown): Promise<void> {
  await db
    .insert(platformConfig)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformConfig.key,
      set: { value, updatedAt: new Date() },
    })
}
