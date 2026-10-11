"use server"

import { requireOrganizationMembership, requireRole } from "@/lib/auth/server"
import { db } from "@/lib/db"
import {
  aiAgents,
  aiAgentVersions,
  aiAgentDeployments,
  waPhoneNumbers,
} from "@/lib/db/schema"
import { eq, and, desc, max, count, ne } from "drizzle-orm"
import { z } from "zod"
import {
  SaveAgentDraftSchema,
  CreateAgentFromTemplateSchema,
  DuplicateAgentSchema,
  ArchiveAgentSchema,
  PublishAgentConfigSchema,
} from "./types"
import { getAgentTemplate, getDefaultAgentConfig } from "./templates"
import type { AgentConfig } from "./types"

// ─── List agents ──────────────────────────────────────────────────────────────

export async function listAgentsAction() {
  const ctx = await requireOrganizationMembership()
  const rows = await db
    .select()
    .from(aiAgents)
    .where(
      and(
        eq(aiAgents.orgId, ctx.orgId),
        ne(aiAgents.status, "archived"),
      )
    )
    .orderBy(desc(aiAgents.updatedAt))
  return { success: true as const, agents: rows }
}

export async function listAllAgentsAction() {
  const ctx = await requireOrganizationMembership()
  const rows = await db
    .select()
    .from(aiAgents)
    .where(eq(aiAgents.orgId, ctx.orgId))
    .orderBy(desc(aiAgents.updatedAt))
  return { success: true as const, agents: rows }
}

// ─── Get agent with associated phone numbers and version info ─────────────────

export async function getAgentDetailAction(agentId: string) {
  const ctx = await requireOrganizationMembership()
  const parsed = z.string().uuid().safeParse(agentId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const [agentRow, publishedVersion, phoneNumbers] = await Promise.allSettled([
    db
      .select()
      .from(aiAgents)
      .where(and(eq(aiAgents.id, agentId), eq(aiAgents.orgId, ctx.orgId)))
      .limit(1),
    db
      .select()
      .from(aiAgentVersions)
      .where(
        and(
          eq(aiAgentVersions.agentId, agentId),
          eq(aiAgentVersions.orgId, ctx.orgId),
          eq(aiAgentVersions.status, "published"),
        )
      )
      .limit(1),
    db
      .select()
      .from(waPhoneNumbers)
      .where(eq(waPhoneNumbers.orgId, ctx.orgId))
      .orderBy(waPhoneNumbers.displayPhoneNumber),
  ])

  const agent = agentRow.status === "fulfilled" ? agentRow.value[0] ?? null : null
  if (!agent) return { success: false as const, error: "Agente no encontrado" }

  const published = publishedVersion.status === "fulfilled" ? publishedVersion.value[0] ?? null : null
  const phones = phoneNumbers.status === "fulfilled" ? phoneNumbers.value : []

  return { success: true as const, agent, publishedVersion: published, phoneNumbers: phones }
}

// ─── Create agent from template ───────────────────────────────────────────────

export async function createAgentFromTemplateAction(formData: FormData) {
  const ctx = await requireRole(["owner", "admin", "manager"])
  const raw = {
    templateId: formData.get("templateId"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  }
  const parsed = CreateAgentFromTemplateSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: "Datos inválidos: " + parsed.error.issues[0]?.message }
  }

  const template = getAgentTemplate(parsed.data.templateId)
  if (!template) return { success: false as const, error: "Plantilla no encontrada" }

  const [created] = await db
    .insert(aiAgents)
    .values({
      orgId: ctx.orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      systemPrompt: "",
      agentConfig: template.config as unknown as Record<string, unknown>,
      status: "draft",
      createdById: ctx.userId,
    })
    .returning()

  if (!created) return { success: false as const, error: "Error al crear el agente" }
  return { success: true as const, agentId: created.id }
}

// ─── Create blank agent ────────────────────────────────────────────────────────

export async function createBlankAgentAction(formData: FormData) {
  const ctx = await requireRole(["owner", "admin", "manager"])
  const name = z.string().min(1).max(100).safeParse(formData.get("name"))
  if (!name.success) return { success: false as const, error: "Nombre inválido" }

  const [created] = await db
    .insert(aiAgents)
    .values({
      orgId: ctx.orgId,
      name: name.data,
      description: null,
      systemPrompt: "",
      agentConfig: getDefaultAgentConfig() as unknown as Record<string, unknown>,
      status: "draft",
      createdById: ctx.userId,
    })
    .returning()

  if (!created) return { success: false as const, error: "Error al crear el agente" }
  return { success: true as const, agentId: created.id }
}

// ─── Save draft (config changes) ─────────────────────────────────────────────

export async function saveAgentDraftAction(input: SaveAgentDraftInput) {
  const ctx = await requireRole(["owner", "admin", "manager"])

  const parsed = SaveAgentDraftSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false as const, error: "Datos inválidos: " + parsed.error.issues[0]?.message }
  }

  // Verify ownership
  const existing = await db
    .select({ id: aiAgents.id, status: aiAgents.status })
    .from(aiAgents)
    .where(and(eq(aiAgents.id, parsed.data.agentId), eq(aiAgents.orgId, ctx.orgId)))
    .limit(1)

  if (!existing[0]) return { success: false as const, error: "Agente no encontrado" }
  if (existing[0].status === "archived") {
    return { success: false as const, error: "No se puede editar un agente archivado" }
  }

  const [updated] = await db
    .update(aiAgents)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      agentConfig: parsed.data.config as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(and(eq(aiAgents.id, parsed.data.agentId), eq(aiAgents.orgId, ctx.orgId)))
    .returning({ id: aiAgents.id })

  if (!updated) return { success: false as const, error: "Error al guardar" }
  return { success: true as const }
}

// We need to import this type
type SaveAgentDraftInput = {
  agentId: string
  config: AgentConfig
  name: string
  description?: string
}

// ─── Duplicate agent ──────────────────────────────────────────────────────────

export async function duplicateAgentAction(formData: FormData) {
  const ctx = await requireRole(["owner", "admin", "manager"])
  const raw = {
    sourceAgentId: formData.get("sourceAgentId"),
    name: formData.get("name"),
  }
  const parsed = DuplicateAgentSchema.safeParse(raw)
  if (!parsed.success) return { success: false as const, error: "Datos inválidos" }

  const source = await db
    .select()
    .from(aiAgents)
    .where(and(eq(aiAgents.id, parsed.data.sourceAgentId), eq(aiAgents.orgId, ctx.orgId)))
    .limit(1)

  if (!source[0]) return { success: false as const, error: "Agente fuente no encontrado" }

  const [created] = await db
    .insert(aiAgents)
    .values({
      orgId: ctx.orgId,
      name: parsed.data.name,
      description: source[0].description,
      systemPrompt: source[0].systemPrompt,
      model: source[0].model,
      aiTemperature: source[0].aiTemperature,
      maxTokens: source[0].maxTokens,
      toolsEnabled: source[0].toolsEnabled,
      handoffTriggers: source[0].handoffTriggers as Record<string, unknown>,
      greetingMessage: source[0].greetingMessage,
      agentConfig: source[0].agentConfig as Record<string, unknown>,
      status: "draft",
      createdById: ctx.userId,
    })
    .returning()

  if (!created) return { success: false as const, error: "Error al duplicar" }
  return { success: true as const, agentId: created.id }
}

// ─── Archive agent ────────────────────────────────────────────────────────────

export async function archiveAgentAction(formData: FormData) {
  const ctx = await requireRole(["owner", "admin"])
  const raw = { agentId: formData.get("agentId") }
  const parsed = ArchiveAgentSchema.safeParse(raw)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  // Check if referenced by active deployments
  const deployments = await db
    .select({ id: aiAgentDeployments.id })
    .from(aiAgentDeployments)
    .where(
      and(
        eq(aiAgentDeployments.agentId, parsed.data.agentId),
        eq(aiAgentDeployments.orgId, ctx.orgId),
        eq(aiAgentDeployments.active, true),
      )
    )
    .limit(1)

  if (deployments[0]) {
    return {
      success: false as const,
      error: "El agente está activo en un despliegue. Desactiva el despliegue antes de archivarlo.",
    }
  }

  const [updated] = await db
    .update(aiAgents)
    .set({ status: "archived", active: false, updatedAt: new Date() })
    .where(and(eq(aiAgents.id, parsed.data.agentId), eq(aiAgents.orgId, ctx.orgId)))
    .returning({ id: aiAgents.id })

  if (!updated) return { success: false as const, error: "Agente no encontrado" }
  return { success: true as const }
}

// ─── Publish agent config ──────────────────────────────────────────────────────
// Publishing = archive current published version → create a new published version
// from the current agentConfig snapshot. Config and deployment are separate operations.

export async function publishAgentConfigAction(formData: FormData) {
  const ctx = await requireRole(["owner", "admin", "manager"])
  const raw = { agentId: formData.get("agentId") }
  const parsed = PublishAgentConfigSchema.safeParse(raw)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const agent = await db
    .select()
    .from(aiAgents)
    .where(and(eq(aiAgents.id, parsed.data.agentId), eq(aiAgents.orgId, ctx.orgId)))
    .limit(1)

  if (!agent[0]) return { success: false as const, error: "Agente no encontrado" }
  if (agent[0].status === "archived") {
    return { success: false as const, error: "No se puede publicar un agente archivado" }
  }

  // Get next version number
  const maxRows = await db
    .select({ maxVer: max(aiAgentVersions.versionNumber) })
    .from(aiAgentVersions)
    .where(and(eq(aiAgentVersions.agentId, parsed.data.agentId), eq(aiAgentVersions.orgId, ctx.orgId)))

  const nextVersion = (maxRows[0]?.maxVer ?? 0) + 1

  // Snapshot the current config
  const snapshot: Record<string, unknown> = {
    name: agent[0].name,
    description: agent[0].description,
    systemPrompt: agent[0].systemPrompt,
    model: agent[0].model,
    agentConfig: agent[0].agentConfig,
    snapshotAt: new Date().toISOString(),
    snapshotBy: ctx.userId,
  }

  // Archive currently published version (non-fatal if none)
  await db
    .update(aiAgentVersions)
    .set({ status: "archived", archivedAt: new Date(), archivedBy: ctx.userId })
    .where(
      and(
        eq(aiAgentVersions.agentId, parsed.data.agentId),
        eq(aiAgentVersions.orgId, ctx.orgId),
        eq(aiAgentVersions.status, "published"),
      )
    )
    .catch(() => undefined)

  // Create new published version
  const [version] = await db
    .insert(aiAgentVersions)
    .values({
      orgId: ctx.orgId,
      agentId: parsed.data.agentId,
      versionNumber: nextVersion,
      snapshot,
      status: "published",
      publishedAt: new Date(),
      publishedBy: ctx.userId,
    })
    .returning()

  if (!version) return { success: false as const, error: "Error al publicar la versión" }

  // Update agent status to active
  await db
    .update(aiAgents)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(aiAgents.id, parsed.data.agentId), eq(aiAgents.orgId, ctx.orgId)))

  return { success: true as const, versionId: version.id, versionNumber: nextVersion }
}

// ─── Revert to previous version (creates a new draft from snapshot) ───────────

export async function revertToVersionAction(formData: FormData) {
  const ctx = await requireRole(["owner", "admin", "manager"])
  const versionId = z.string().uuid().safeParse(formData.get("versionId"))
  if (!versionId.success) return { success: false as const, error: "ID inválido" }

  const version = await db
    .select()
    .from(aiAgentVersions)
    .where(and(eq(aiAgentVersions.id, versionId.data), eq(aiAgentVersions.orgId, ctx.orgId)))
    .limit(1)

  if (!version[0]) return { success: false as const, error: "Versión no encontrada" }

  const snapshot = version[0].snapshot as Record<string, unknown>

  // Apply the snapshot config back to the agent as a new draft save
  const [updated] = await db
    .update(aiAgents)
    .set({
      name: typeof snapshot.name === "string" ? snapshot.name : undefined,
      description: typeof snapshot.description === "string" ? snapshot.description : null,
      systemPrompt: typeof snapshot.systemPrompt === "string" ? snapshot.systemPrompt : "",
      agentConfig: typeof snapshot.agentConfig === "object" && snapshot.agentConfig !== null
        ? snapshot.agentConfig as Record<string, unknown>
        : {},
      status: "draft",
      updatedAt: new Date(),
    })
    .where(and(eq(aiAgents.id, version[0].agentId), eq(aiAgents.orgId, ctx.orgId)))
    .returning({ id: aiAgents.id })

  if (!updated) return { success: false as const, error: "Error al revertir" }
  return { success: true as const, agentId: version[0].agentId }
}

// ─── Get version history ──────────────────────────────────────────────────────

export async function getAgentVersionsAction(agentId: string) {
  const ctx = await requireOrganizationMembership()
  const parsed = z.string().uuid().safeParse(agentId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  // Verify ownership
  const agent = await db
    .select({ id: aiAgents.id })
    .from(aiAgents)
    .where(and(eq(aiAgents.id, agentId), eq(aiAgents.orgId, ctx.orgId)))
    .limit(1)

  if (!agent[0]) return { success: false as const, error: "Agente no encontrado" }

  const versions = await db
    .select()
    .from(aiAgentVersions)
    .where(and(eq(aiAgentVersions.agentId, agentId), eq(aiAgentVersions.orgId, ctx.orgId)))
    .orderBy(desc(aiAgentVersions.versionNumber))
    .limit(20)

  return { success: true as const, versions }
}

// ─── Get agent metrics (placeholder — returns empty until engine is live) ─────

export async function getAgentMetricsAction(agentId: string) {
  const ctx = await requireOrganizationMembership()
  const parsed = z.string().uuid().safeParse(agentId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const agent = await db
    .select({ id: aiAgents.id })
    .from(aiAgents)
    .where(and(eq(aiAgents.id, agentId), eq(aiAgents.orgId, ctx.orgId)))
    .limit(1)

  if (!agent[0]) return { success: false as const, error: "Agente no encontrado" }

  // No metrics yet — engine is Phase 04+
  return {
    success: true as const,
    hasData: false,
    metrics: null,
  }
}

// ─── Get org phone numbers (for deployment tab) ───────────────────────────────

export async function getOrgPhoneNumbersAction() {
  const ctx = await requireOrganizationMembership()
  const rows = await db
    .select()
    .from(waPhoneNumbers)
    .where(eq(waPhoneNumbers.orgId, ctx.orgId))
    .orderBy(waPhoneNumbers.displayPhoneNumber)
  return { success: true as const, phoneNumbers: rows }
}

// ─── Get org WA Business Accounts (for channels page) ────────────────────────

export async function getChannelStatusAction() {
  const ctx = await requireOrganizationMembership()

  // Check if the WA Cloud adapter dependencies are present
  const hasAppSecret = Boolean(process.env.WA_CLOUD_APP_SECRET)

  const phoneNumbers = await db
    .select({
      id: waPhoneNumbers.id,
      displayPhoneNumber: waPhoneNumbers.displayPhoneNumber,
      verifiedName: waPhoneNumbers.verifiedName,
      status: waPhoneNumbers.status,
      qualityRating: waPhoneNumbers.qualityRating,
    })
    .from(waPhoneNumbers)
    .where(eq(waPhoneNumbers.orgId, ctx.orgId))
    .orderBy(waPhoneNumbers.displayPhoneNumber)

  return {
    success: true as const,
    adapter: {
      meta: {
        configured: hasAppSecret,
        // Publishing config ≠ enabling real sends. These are separate operations.
        sendingEnabled: hasAppSecret && phoneNumbers.some(p => p.status === "active"),
      },
    },
    phoneNumbers,
  }
}
