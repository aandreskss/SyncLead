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

// Proxy totalmente transparente: delega get, has, prototype, ownKeys y
// getOwnPropertyDescriptor al singleton real para que DrizzleAdapter y
// cualquier inspector de tipos reciba la instancia correcta.
// neon() solo se llama en la primera query, no al importar el módulo.
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    return Reflect.get(getInstance(), prop)
  },
  has(_, prop) {
    return Reflect.has(getInstance(), prop)
  },
  getPrototypeOf(_) {
    return Reflect.getPrototypeOf(getInstance())
  },
  ownKeys(_) {
    return Reflect.ownKeys(getInstance())
  },
  getOwnPropertyDescriptor(_, prop) {
    return Reflect.getOwnPropertyDescriptor(getInstance(), prop)
  },
})
