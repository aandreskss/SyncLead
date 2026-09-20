/**
 * Crea el primer usuario administrador + organización.
 * Uso: npm run create-admin -- admin@example.com "Mi Empresa" "Password123!"
 *
 * O con variables de entorno:
 *   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_ORG=... ADMIN_PASS=... npm run create-admin
 */
import dotenv from "dotenv"
import path from "path"
dotenv.config({ path: path.join(process.cwd(), ".env.local") })

import { db } from "../src/lib/db"
import { users, organizations } from "../src/lib/db/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

async function main() {
  const args = process.argv.slice(2)

  const email = args[0] ?? process.env.ADMIN_EMAIL
  const orgName = args[1] ?? process.env.ADMIN_ORG ?? "Mi Empresa"
  const password = args[2] ?? process.env.ADMIN_PASS
  const name = process.env.ADMIN_NAME ?? "Administrador"

  if (!email || !password) {
    console.error("Uso: npm run create-admin -- <email> <org> <password>")
    console.error("O: ADMIN_EMAIL=... ADMIN_PASS=... npm run create-admin")
    process.exit(1)
  }

  // Check if user already exists
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existing) {
    console.error(`❌ Ya existe un usuario con email: ${email}`)
    process.exit(1)
  }

  // Create user
  const passwordHash = await bcrypt.hash(password, 12)
  const [user] = await db.insert(users).values({
    name,
    email,
    emailVerified: new Date(),
    password: passwordHash,
  }).returning()

  // Create org
  let orgSlug = slug(orgName)
  const existingOrg = await db.query.organizations.findFirst({ where: eq(organizations.slug, orgSlug) })
  if (existingOrg) orgSlug = `${orgSlug}-${Date.now()}`

  const [org] = await db.insert(organizations).values({
    ownerId: user.id,
    name: orgName,
    slug: orgSlug,
    plan: "free",
    onboardingCompleted: true,
  }).returning()

  console.log(`
✅ Administrador creado exitosamente.

  Usuario ID:   ${user.id}
  Email:        ${email}
  Organización: ${org.name} (${org.slug})

Inicia sesión en /login con las credenciales proporcionadas.
`)
}

main().catch(err => {
  console.error("❌ Error:", err.message)
  process.exit(1)
})
