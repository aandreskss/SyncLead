import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import type { NeonHttpDatabase } from "drizzle-orm/neon-http"
import * as schema from "./schema"

type Db = NeonHttpDatabase<typeof schema>

let _db: Db | undefined

function getInstance(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is required")
    _db = drizzle(neon(url), { schema })
  }
  return _db
}

// Proxy para lazy init: neon() no se llama hasta la primera query,
// lo que permite que el módulo se importe durante el build sin DATABASE_URL.
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    return Reflect.get(getInstance(), prop)
  },
})
