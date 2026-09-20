import "server-only"

import { db } from "@/lib/db"
import { auditLogs } from "@/lib/db/schema"

// ─── IP redaction ─────────────────────────────────────────────────────────────

export function redactIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  if (ip.includes(":")) {
    // IPv6 — keep first 3 groups (/48 prefix)
    const groups = ip.split(":")
    return groups.slice(0, 3).join(":") + ":0:0:0:0:0"
  }
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`
}

// ─── Audit log entry ──────────────────────────────────────────────────────────

export interface AuditEntry {
  orgId?: string
  actorId?: string
  actorType?: "user" | "system" | "api"
  action: string
  resourceType: string
  resourceId?: string
  metadata?: Record<string, unknown>
  /** Raw IP — will be redacted before storage */
  ip?: string | null
}

/**
 * Appends an immutable audit log entry. Non-fatal: errors are swallowed so
 * audit failures never interrupt business operations.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    orgId: entry.orgId,
    actorId: entry.actorId,
    actorType: entry.actorType ?? "user",
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata: entry.metadata ?? {},
    ipRedacted: redactIp(entry.ip),
  }).catch(() => undefined)
}
