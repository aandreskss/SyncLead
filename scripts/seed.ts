/**
 * Seed de datos demo — ejecutar con: npm run seed
 * Crea 3 clientes, 5 campañas y 200 leads con distribución realista.
 * Es idempotente: si el usuario demo ya existe, termina sin duplicar.
 */
import dotenv from "dotenv"
import path from "path"
dotenv.config({ path: path.join(process.cwd(), ".env.local") })

import { db } from "../src/lib/db"
import { users, organizations, clients, campaigns, leads } from "../src/lib/db/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { encryptToken } from "../src/lib/crypto"
import type { NewFunnel } from "../src/lib/db/schema"

function slugify(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

// ─── Config ──────────────────────────────────────────────────────────────────

const DEMO_EMAIL = "demo@synclead.app"
const DEMO_PASSWORD = "Demo1234!"
const DEMO_ORG_SLUG = "synclead-demo"

// ─── Data fixtures ───────────────────────────────────────────────────────────

const MALE_NAMES = ["Carlos", "Luis", "Miguel", "José", "David", "Alejandro", "Fernando", "Andrés", "Rafael", "Pablo"]
const FEMALE_NAMES = ["María", "Ana", "Valentina", "Sofía", "Camila", "Laura", "Daniela", "Gabriela", "Isabella", "Luisa"]
const SURNAMES = ["García", "Rodríguez", "Martínez", "López", "González", "Pérez", "Sánchez", "Ramírez", "Flores", "Torres", "Díaz", "Morales"]

const CAPITAL_CITIES = ["Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay"]
const OTHER_CITIES = ["Mérida", "Barinas", "Puerto Ordaz", "El Tigre", "San Carlos", "Coro", "Porlamar", "Cumaná", "Maturín", "Maturín"]

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randName(): string {
  const names = [...MALE_NAMES, ...FEMALE_NAMES]
  return `${rnd(names)} ${rnd(SURNAMES)}`
}

function randPhone(): string {
  const prefixes = ["4121", "4141", "4161", "4242", "4143"]
  const suffix = Math.floor(1000000 + Math.random() * 9000000).toString()
  return `58${rnd(prefixes)}${suffix}`
}

function pastDate(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(Math.floor(Math.random() * 14) + 8)
  d.setMinutes(Math.floor(Math.random() * 60))
  return d
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Iniciando seed de datos demo...\n")

  // ── 1. Check idempotency ────────────────────────────────────────────────────
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, DEMO_EMAIL),
  })
  if (existingUser) {
    console.log("⚠️  El usuario demo ya existe. Ejecuta TRUNCATE en la DB para re-seeding.")
    process.exit(0)
  }

  // ── 2. Create demo user ─────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const [user] = await db.insert(users).values({
    name: "Usuario Demo",
    email: DEMO_EMAIL,
    emailVerified: new Date(),
    password: passwordHash,
  }).returning()
  console.log(`✅ Usuario creado: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)

  // ── 3. Create organization ──────────────────────────────────────────────────
  const [org] = await db.insert(organizations).values({
    ownerId: user.id,
    name: "SyncLead Demo",
    slug: DEMO_ORG_SLUG,
    plan: "free",
    onboardingCompleted: true,
  }).returning()
  console.log(`✅ Organización: ${org.name}`)

  // ── 4. Create clients ───────────────────────────────────────────────────────
  const fakePixelId = "123456789012345"
  const fakeToken = encryptToken("EAAFakeAccessTokenForDemoOnly123456789")

  const clientRows = [
    { orgId: org.id, name: "Moda Venezolana", industry: "Moda y ropa", metaPixelId: fakePixelId as string | null, metaAccessTokenEnc: fakeToken as string | null, active: true },
    { orgId: org.id, name: "Inmobiliaria Carabobo", industry: "Inmobiliaria", metaPixelId: fakePixelId as string | null, metaAccessTokenEnc: fakeToken as string | null, active: true },
    { orgId: org.id, name: "Panadería La Esquina", industry: "Alimentos", metaPixelId: null as string | null, metaAccessTokenEnc: null as string | null, active: true },
  ]
  const [clientModa, clientInmob, clientBakery] = await db.insert(clients).values(clientRows).returning()
  console.log("✅ 3 clientes creados")

  // ── 5. Create campaigns ─────────────────────────────────────────────────────
  function apiKey(n: number): string {
    return `slk_demo${n.toString().padStart(4, "0")}${Math.random().toString(36).slice(2, 14)}`
  }

  const campNames = ["Vestidos Primavera 2026", "Jeans Collection", "Apartamentos Valencia", "Casas Maracay", "Pan Artesanal WhatsApp"]
  const [campModaVestidos, campModaJeans, campInmobApart, campInmobCasas, campPanaderia] =
    await db.insert(campaigns).values([
      { orgId: org.id, clientId: clientModa.id, name: campNames[0], slug: slugify(campNames[0]), apiKey: apiKey(1), active: true },
      { orgId: org.id, clientId: clientModa.id, name: campNames[1], slug: slugify(campNames[1]), apiKey: apiKey(2), active: true },
      { orgId: org.id, clientId: clientInmob.id, name: campNames[2], slug: slugify(campNames[2]), apiKey: apiKey(3), active: true },
      { orgId: org.id, clientId: clientInmob.id, name: campNames[3], slug: slugify(campNames[3]), apiKey: apiKey(4), active: true },
      { orgId: org.id, clientId: clientBakery.id, name: campNames[4], slug: slugify(campNames[4]), apiKey: apiKey(5), active: true },
    ]).returning()
  console.log("✅ 5 campañas creadas")

  // ── 6. Create 200 leads ─────────────────────────────────────────────────────
  const campList = [campModaVestidos, campModaJeans, campInmobApart, campInmobCasas, campPanaderia]
  const stages = ["new", "contacted", "interested", "quoted", "won", "lost"] as const
  const leadsData = []

  for (let i = 0; i < 200; i++) {
    const camp = campList[i % campList.length]
    const daysAgo = Math.floor(Math.random() * 60)

    // Temperature distribution: 25% hot, 35% warm, 40% cold
    const roll = Math.random()
    let temperature: "hot" | "warm" | "cold"
    let negocio: boolean
    let city: string

    if (roll < 0.25) {
      temperature = "hot"
      negocio = true
      city = rnd(CAPITAL_CITIES)
    } else if (roll < 0.60) {
      temperature = "warm"
      negocio = true
      city = rnd(OTHER_CITIES)
    } else {
      temperature = "cold"
      negocio = false
      city = rnd([...CAPITAL_CITIES, ...OTHER_CITIES])
    }

    // Stage distribution weighted by temperature
    let stage: typeof stages[number]
    const stageRoll = Math.random()
    if (temperature === "hot") {
      stage = stageRoll < 0.30 ? "won" : stageRoll < 0.40 ? "quoted" : stageRoll < 0.60 ? "interested" : stageRoll < 0.80 ? "contacted" : "new"
    } else if (temperature === "warm") {
      stage = stageRoll < 0.08 ? "won" : stageRoll < 0.20 ? "quoted" : stageRoll < 0.40 ? "interested" : stageRoll < 0.60 ? "contacted" : "new"
    } else {
      stage = stageRoll < 0.02 ? "won" : stageRoll < 0.10 ? "contacted" : "new"
    }

    const isConverted = stage === "won"
    const createdAt = pastDate(daysAgo)

    leadsData.push({
      orgId: org.id,
      campaignId: camp.id,
      name: randName(),
      phone: randPhone(),
      email: null as string | null,
      city,
      temperature,
      stage,
      negocio,
      converted: isConverted,
      conversionAmount: isConverted ? (Math.floor(Math.random() * 900 + 100)).toString() : null,
      conversionCurrency: isConverted ? "USD" : null,
      conversionDate: isConverted ? createdAt : null,
      createdAt,
      updatedAt: createdAt,
    })
  }

  await db.insert(leads).values(leadsData)
  const hotCount = leadsData.filter(l => l.temperature === "hot").length
  const warmCount = leadsData.filter(l => l.temperature === "warm").length
  const coldCount = leadsData.filter(l => l.temperature === "cold").length
  const wonCount = leadsData.filter(l => l.converted).length
  console.log(`✅ 200 leads creados: ${hotCount} hot, ${warmCount} warm, ${coldCount} cold`)
  console.log(`   ${wonCount} convertidos`)

  console.log(`
─────────────────────────────────────────
✅ Seed completado.

  Email:    ${DEMO_EMAIL}
  Password: ${DEMO_PASSWORD}

  Clientes: 3 | Campañas: 5 | Leads: 200
─────────────────────────────────────────
`)
}

seed().catch(err => {
  console.error("❌ Error en seed:", err)
  process.exit(1)
})
