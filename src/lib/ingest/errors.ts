import "server-only"

import { db } from "@/lib/db"
import { ingestErrors } from "@/lib/db/schema"
import type { ZodError } from "zod"

interface LogIngestErrorArgs {
  orgId: string
  campaignId?: string | null
  clientId?: string | null
  source: "form" | "server" | "legacy"
  errorType: string
  zodError?: ZodError
}

/**
 * Fire-and-forget: logs a validation failure to ingest_errors.
 * Only stores field names from the Zod error — never field values (no PII).
 */
export function logIngestError(args: LogIngestErrorArgs): void {
  const failedFields = args.zodError
    ? args.zodError.issues
        .map((i) => i.path.join("."))
        .filter(Boolean)
        .join(", ")
    : null

  db.insert(ingestErrors)
    .values({
      orgId: args.orgId,
      campaignId: args.campaignId ?? null,
      clientId: args.clientId ?? null,
      errorType: args.errorType,
      errorDetail: failedFields ? `Fields: ${failedFields}` : null,
      source: args.source,
    })
    .catch(() => undefined)
}
