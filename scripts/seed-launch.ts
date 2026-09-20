/**
 * Seed de datos para lanzamiento beta — dos organizaciones completas.
 * Crea datos suficientes para validar todas las gráficas, roles y aislamiento.
 *
 * Ejecutar: npx tsx scripts/seed-launch.ts
 * Idempotente: verifica emails antes de crear.
 *
 * Credenciales:
 *   Org A (Savaya): admin@savaya.test / Beta2026!
 *   Org B (Callbell): admin@callbell.test / Beta2026!
 *   Vendedor (Org A): vendedor@savaya.test / Beta2026!
 */
import dotenv from "dotenv"
import path from "path"
dotenv.config({ path: path.join(process.cwd(), ".env.local") })

import { db } from "../src/lib/db"
import {
  users, organizations, orgMembers, clients, campaigns, leads,
  conversions, metaEvents, metaConnections, salesReps,
} from "../src/lib/db/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { encryptTokenVersioned } from "../src/lib/crypto"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MALE_NAMES = ["Carlos", "Luis", "Miguel", "José", "David", "Alejandro", "Fernando", "Andrés"]
const FEMALE_NAMES = ["María", "Ana", "Valentina", "Sofía", "Camila", "Laura", "Daniela", "Gabriela"]
const SURNAMES = ["García", "Rodríguez", "Martínez", "López", "González", "Pérez", "Sánchez", "Ramírez"]
const CAPITAL_CITIES = ["Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay"]
const OTHER_CITIES = ["Mérida", "Barcelona", "Puerto Ordaz", "Cumaná", "Maturín"]

function rnd<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randName() { return `${rnd([...MALE_NAMES,...FEMALE_NAMES])} ${rnd(SURNAMES)}` }
function randPhone() { return `58${rnd(["4121","4141","4161","4242","4143"])}${(1000000+Math.floor(Math.random()*9000000))}` }
function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }
function pastDate(daysAgo: number, hoursOffset = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(8 + hoursOffset + Math.floor(Math.random() * 8))
  return d
}

const HASH = await bcrypt.hash("Beta2026!", 12)
const FAKE_TOKEN = "EAAFakeTokenForBetaLaunchSeedOnly1234567890"

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seedLaunch() {
  console.log("🚀 Seed de lanzamiento beta — dos organizaciones\n")

  // ── Idempotency check ────────────────────────────────────────────────────────
  const existingA = await db.query.users.findFirst({ where: eq(users.email, "admin@savaya.test") })
  if (existingA) {
    console.log("⚠️  Los datos beta ya existen. Nada que hacer.\n")
    process.exit(0)
  }

  // ─── ORG A: Savaya Calzado ────────────────────────────────────────────────

  const [ownerA] = await db.insert(users).values({
    name: "Ana García (Owner)",
    email: "owner@savaya.test",
    emailVerified: new Date(),
    password: HASH,
  }).returning()

  const [adminA] = await db.insert(users).values({
    name: "Carlos Martínez (Admin)",
    email: "admin@savaya.test",
    emailVerified: new Date(),
    password: HASH,
  }).returning()

  const [managerA] = await db.insert(users).values({
    name: "Laura López (Manager)",
    email: "manager@savaya.test",
    emailVerified: new Date(),
    password: HASH,
  }).returning()

  const [agentA] = await db.insert(users).values({
    name: "David González (Agent)",
    email: "agent@savaya.test",
    emailVerified: new Date(),
    password: HASH,
  }).returning()

  const [viewerA] = await db.insert(users).values({
    name: "Sofía Pérez (Viewer)",
    email: "viewer@savaya.test",
    emailVerified: new Date(),
    password: HASH,
  }).returning()

  const [orgA] = await db.insert(organizations).values({
    ownerId: ownerA.id,
    name: "Savaya Calzado",
    slug: "savaya-calzado",
    plan: "pro",
    onboardingCompleted: true,
  }).returning()

  await db.insert(orgMembers).values([
    { orgId: orgA.id, userId: ownerA.id, role: "owner" },
    { orgId: orgA.id, userId: adminA.id, role: "admin" },
    { orgId: orgA.id, userId: managerA.id, role: "manager" },
    { orgId: orgA.id, userId: agentA.id, role: "agent" },
    { orgId: orgA.id, userId: viewerA.id, role: "viewer" },
  ])

  console.log("✅ Org A: Savaya Calzado — 5 usuarios (owner/admin/manager/agent/viewer)")

  // Clients + campaigns Org A
  const [clientSavayaModa] = await db.insert(clients).values({
    orgId: orgA.id, name: "Savaya Moda", industry: "Moda y calzado", active: true,
  }).returning()

  const [clientSavayaEcom] = await db.insert(clients).values({
    orgId: orgA.id, name: "Savaya E-commerce", industry: "E-commerce", active: true,
  }).returning()

  const [campVestidos, campBotas, campZapatos, campEcom] = await db.insert(campaigns).values([
    { orgId: orgA.id, clientId: clientSavayaModa.id, name: "Vestidos Primavera", slug: "vestidos-primavera", apiKey: "slk_seed_vestidos_primavera_2026", active: true },
    { orgId: orgA.id, clientId: clientSavayaModa.id, name: "Botas Invierno",     slug: "botas-invierno",     apiKey: "slk_seed_botas_invierno_2026",   active: true },
    { orgId: orgA.id, clientId: clientSavayaModa.id, name: "Zapatos Ejecutivos", slug: "zapatos-ejecutivos", apiKey: "slk_seed_zapatos_ejecutivos_2026", active: true },
    { orgId: orgA.id, clientId: clientSavayaEcom.id, name: "E-comm Agosto",      slug: "ecomm-agosto",       apiKey: "slk_seed_ecomm_agosto_2026",      active: true },
  ]).returning()

  // Sales reps
  const [repA] = await db.insert(salesReps).values({
    orgId: orgA.id, clientId: clientSavayaModa.id,
    userId: agentA.id, displayName: "David González", whatsappNumber: "+584121234567", active: true,
  }).returning()

  console.log("✅ Org A: 2 clientes, 4 campañas, 1 vendedor")

  // Meta connection for Org A
  const { ciphertext: encryptedToken, keyVersion } = encryptTokenVersioned(FAKE_TOKEN)
  const [connA] = await db.insert(metaConnections).values({
    orgId: orgA.id, clientId: clientSavayaModa.id,
    pixelId: "111111111111111",
    adAccountId: "act_111111111",
    accessTokenEnc: encryptedToken,
    keyVersion,
    graphApiVersion: "v19.0",
    status: "active",
    scopes: ["ads_read", "ads_management"],
    lastVerifiedAt: new Date(),
  }).returning()

  // ── Leads for Org A (50 leads across campaigns, different dates/temperatures) ──

  const orgALeads = []
  const campList = [campVestidos, campBotas, campZapatos, campEcom]

  for (let i = 0; i < 50; i++) {
    const camp = campList[i % campList.length]
    const daysAgo = Math.floor(Math.random() * 90) // spread over 90 days
    const roll = Math.random()
    const temperature: "hot"|"warm"|"cold" = roll < 0.25 ? "hot" : roll < 0.55 ? "warm" : "cold"
    const negocio = temperature !== "cold"
    const city = negocio ? rnd(CAPITAL_CITIES) : rnd([...CAPITAL_CITIES, ...OTHER_CITIES])
    const createdAt = pastDate(daysAgo)

    orgALeads.push({
      orgId: orgA.id,
      campaignId: camp.id,
      name: randName(),
      phone: randPhone(),
      city,
      temperature,
      negocio,
      stage: temperature === "hot" ? "quoted" : temperature === "warm" ? "interested" : "new",
      converted: false,
      createdAt,
      updatedAt: createdAt,
    })
  }

  const insertedLeadsA = await db.insert(leads).values(orgALeads).returning()
  console.log("✅ Org A: 50 leads creados (distribución 25% hot / 30% warm / 45% cold)")

  // ── Conversions for Org A (with dates DIFFERENT from lead creation) ──
  // This validates the "Ventas del periodo" metric using converted_at, not created_at

  const hotLeads = insertedLeadsA.filter(l => l.temperature === "hot").slice(0, 8)
  const conversionRows = hotLeads.map((lead, idx) => ({
    orgId: orgA.id,
    leadId: lead.id,
    campaignId: lead.campaignId,
    orderId: `savaya-${idx + 1001}`,
    amount: (300 + idx * 50).toString(),
    currency: "USD",
    status: "confirmed" as const,
    // convertedAt deliberately different from lead.createdAt by 2-5 days
    convertedAt: pastDate(Math.floor(Math.random() * 15)),
    actorId: adminA.id,
  }))

  const insertedConversions = await db.insert(conversions).values(conversionRows).returning()
  console.log(`✅ Org A: ${insertedConversions.length} conversiones (fechas distintas a creación de lead)`)

  // ── Meta events for Org A (sent / retrying / failed) ──

  const metaEventRows = insertedConversions.map((conv, idx) => {
    const statuses = ["sent", "sent", "sent", "retrying", "failed", "pending", "sent", "sent"] as const
    return {
      orgId: orgA.id,
      leadId: hotLeads[idx]?.id ?? hotLeads[0].id,
      conversionId: conv.id,
      pixelId: connA.pixelId ?? "111111111111111",
      eventName: "Purchase",
      eventId: `purchase_${conv.id}`,
      payloadVersion: 1,
      payload: { currency: "USD", value: parseFloat(conv.amount) },
      status: statuses[idx % statuses.length],
      attemptCount: statuses[idx % statuses.length] === "failed" ? 8 : statuses[idx % statuses.length] === "retrying" ? 3 : 1,
      lastResponse: statuses[idx % statuses.length] === "sent" ? "sent:1" : null,
      lastError: statuses[idx % statuses.length] === "failed" ? "http:400 code:190 fbtrace:none" : null,
    }
  })

  await db.insert(metaEvents).values(metaEventRows)
  console.log("✅ Org A: meta_events (sent/retrying/failed) creados")

  // ─── ORG B: Callbell Media ────────────────────────────────────────────────

  const [ownerB] = await db.insert(users).values({
    name: "Roberto Silva (Owner B)",
    email: "owner@callbell.test",
    emailVerified: new Date(),
    password: HASH,
  }).returning()

  const [adminB] = await db.insert(users).values({
    name: "Paula Torres (Admin B)",
    email: "admin@callbell.test",
    emailVerified: new Date(),
    password: HASH,
  }).returning()

  const [orgB] = await db.insert(organizations).values({
    ownerId: ownerB.id,
    name: "Callbell Media",
    slug: "callbell-media",
    plan: "free",
    onboardingCompleted: true,
  }).returning()

  await db.insert(orgMembers).values([
    { orgId: orgB.id, userId: ownerB.id, role: "owner" },
    { orgId: orgB.id, userId: adminB.id, role: "admin" },
  ])

  const [clientCallbell] = await db.insert(clients).values({
    orgId: orgB.id, name: "Callbell SaaS", industry: "Software", active: true,
  }).returning()

  const [campCallbell1, campCallbell2] = await db.insert(campaigns).values([
    { orgId: orgB.id, clientId: clientCallbell.id, name: "WhatsApp Business Q3", slug: "wa-business-q3", apiKey: "slk_seed_wa_business_q3_2026",   active: true },
    { orgId: orgB.id, clientId: clientCallbell.id, name: "Enterprise Demo",      slug: "enterprise-demo", apiKey: "slk_seed_enterprise_demo_2026", active: true },
  ]).returning()

  // Leads Org B (completely separate data — validates tenant isolation)
  const orgBLeads = Array.from({ length: 30 }, (_, i) => {
    const camp = i % 2 === 0 ? campCallbell1 : campCallbell2
    const createdAt = pastDate(Math.floor(Math.random() * 60))
    return {
      orgId: orgB.id,
      campaignId: camp.id,
      name: randName(),
      phone: randPhone(),
      city: rnd(CAPITAL_CITIES),
      temperature: "warm" as const,
      negocio: true,
      stage: "new",
      converted: false,
      createdAt,
      updatedAt: createdAt,
    }
  })

  await db.insert(leads).values(orgBLeads)
  console.log("✅ Org B: Callbell Media — 2 usuarios, 1 cliente, 2 campañas, 30 leads")
  console.log("   (datos completamente aislados de Org A)")

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Seed de lanzamiento completado

ORG A — Savaya Calzado
  Login (owner):   owner@savaya.test / Beta2026!
  Login (admin):   admin@savaya.test / Beta2026!
  Login (manager): manager@savaya.test / Beta2026!
  Login (agent):   agent@savaya.test / Beta2026!
  Login (viewer):  viewer@savaya.test / Beta2026!
  Clientes: 2 | Campañas: 4 | Leads: 50 | Conversiones: ${insertedConversions.length}

ORG B — Callbell Media (aislamiento)
  Login (owner):   owner@callbell.test / Beta2026!
  Login (admin):   admin@callbell.test / Beta2026!
  Clientes: 1 | Campañas: 2 | Leads: 30

INVARIANTE: Org A NO ve datos de Org B y viceversa.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

seedLaunch().catch(err => {
  console.error("❌ Error en seed-launch:", err)
  process.exit(1)
})
