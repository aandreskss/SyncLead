import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

// neon() stores the URL but does NOT connect at this point — it only
// makes HTTP requests when a query is actually executed.
// The fallback URL allows the module to initialize during build time
// without a real DATABASE_URL; queries at runtime will use the real value.
const url = process.env.DATABASE_URL ?? "postgres://build:build@build-placeholder.neon.tech/build"

export const db = drizzle(neon(url), { schema })
