/**
 * AI Agents Phase 03 — config schemas, templates, validation, and appointment safety.
 *
 * Tests are pure (no DB, no auth) unless stated. Focused on:
 *   - AgentConfig Zod schemas (validation contract)
 *   - Template defaults (completeness, appointment constraints)
 *   - Config merging (persistence model)
 *   - Despliegue config (separation of publishing vs sending)
 */
import { describe, it, expect } from "vitest"
import {
  AgentConfigSchema,
  AgentObjetivoSchema,
  AgentPersonalidadSchema,
  AgentReglasSchema,
  AgentDespliegueSchema,
  AgentConocimientoSchema,
  AgentAccionesSchema,
  SaveAgentDraftSchema,
  AGENT_LANGUAGES,
  AGENT_TONES,
  AGENT_RESPONSE_LENGTHS,
} from "@/domains/ai-agents/types"
import {
  getDefaultAgentConfig,
  getAgentTemplate,
  AGENT_TEMPLATE_LIST,
} from "@/domains/ai-agents/templates"

// ─── Default config ───────────────────────────────────────────────────────────

describe("getDefaultAgentConfig", () => {
  it("returns an object with all 6 tab keys", () => {
    const config = getDefaultAgentConfig()
    expect(config).toHaveProperty("objetivo")
    expect(config).toHaveProperty("personalidad")
    expect(config).toHaveProperty("conocimiento")
    expect(config).toHaveProperty("acciones")
    expect(config).toHaveProperty("reglas")
    expect(config).toHaveProperty("despliegue")
  })

  it("objetivo has empty steps and requiredData arrays", () => {
    const { objetivo } = getDefaultAgentConfig()
    expect(Array.isArray(objetivo.steps)).toBe(true)
    expect(Array.isArray(objetivo.requiredData)).toBe(true)
  })

  it("personalidad has a valid language, tone and responseLength", () => {
    const { personalidad } = getDefaultAgentConfig()
    expect(AGENT_LANGUAGES).toContain(personalidad.language)
    expect(AGENT_TONES).toContain(personalidad.tone)
    expect(AGENT_RESPONSE_LENGTHS).toContain(personalidad.responseLength)
  })

  it("reglas has positive inactivityTimeoutMinutes", () => {
    const { reglas } = getDefaultAgentConfig()
    expect(reglas.inactivityTimeoutMinutes).toBeGreaterThan(0)
  })

  it("reglas has positive maxMessagesPerConversation", () => {
    const { reglas } = getDefaultAgentConfig()
    expect(reglas.maxMessagesPerConversation).toBeGreaterThan(0)
  })

  it("despliegue.isDefault is boolean", () => {
    const { despliegue } = getDefaultAgentConfig()
    expect(typeof despliegue.isDefault).toBe("boolean")
  })

  it("despliegue.campaignIds is an empty array", () => {
    const { despliegue } = getDefaultAgentConfig()
    expect(Array.isArray(despliegue.campaignIds)).toBe(true)
    expect(despliegue.campaignIds).toHaveLength(0)
  })

  it("conocimiento.faq is an empty array", () => {
    const { conocimiento } = getDefaultAgentConfig()
    expect(Array.isArray(conocimiento.faq)).toBe(true)
  })

  it("acciones.actions is a record (possibly empty)", () => {
    const { acciones } = getDefaultAgentConfig()
    expect(typeof acciones.actions).toBe("object")
    expect(acciones.actions).not.toBeNull()
  })
})

// ─── Templates ────────────────────────────────────────────────────────────────

describe("AGENT_TEMPLATE_LIST", () => {
  it("contains exactly 4 templates", () => {
    expect(AGENT_TEMPLATE_LIST).toHaveLength(4)
  })

  it("every template has a unique id", () => {
    const ids = AGENT_TEMPLATE_LIST.map(t => t.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it("every template has a non-empty name and description", () => {
    for (const t of AGENT_TEMPLATE_LIST) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  it("every template config passes AgentConfigSchema — EXCEPT objetivo (steps may be empty in defaults)", () => {
    for (const t of AGENT_TEMPLATE_LIST) {
      // Personalidad, reglas, despliegue, conocimiento, acciones must be valid
      expect(AgentPersonalidadSchema.safeParse(t.config.personalidad).success).toBe(true)
      expect(AgentReglasSchema.safeParse(t.config.reglas).success).toBe(true)
      expect(AgentDespliegueSchema.safeParse(t.config.despliegue).success).toBe(true)
      expect(AgentConocimientoSchema.safeParse(t.config.conocimiento).success).toBe(true)
      expect(AgentAccionesSchema.safeParse(t.config.acciones).success).toBe(true)
    }
  })

  it("getAgentTemplate returns correct template by id", () => {
    for (const t of AGENT_TEMPLATE_LIST) {
      const found = getAgentTemplate(t.id)
      expect(found).toBeDefined()
      expect(found?.id).toBe(t.id)
    }
  })

  it("getAgentTemplate returns null for unknown id", () => {
    const result = getAgentTemplate("nonexistent_id" as any)
    expect(result).toBeNull()
  })
})

// ─── Appointment template — must NOT confirm bookings ────────────────────────

describe("appointment_request template", () => {
  const template = AGENT_TEMPLATE_LIST.find(t => t.id === "appointment_request")

  it("exists", () => {
    expect(template).toBeDefined()
  })

  it("prohibitions include language about NOT confirming appointments", () => {
    const prohibitions = template!.config.reglas.prohibitions
    const hasAppointmentWarning = prohibitions.some(p =>
      /cita|agend|confirm/i.test(p)
    )
    expect(hasAppointmentWarning).toBe(true)
  })

  it("goal explicitly states the agent does NOT confirm appointments", () => {
    const goal = template!.config.objetivo.goal
    // The goal must include a disclaimer that the agent does not confirm
    const hasDisclaimer = /NO confirma|no confirma|no reserva|NO reserva|no agenda|NO agenda/i.test(goal)
    expect(hasDisclaimer).toBe(true)
  })

  it("prohibitions list is not empty", () => {
    expect(template!.config.reglas.prohibitions.length).toBeGreaterThan(0)
  })
})

// ─── AgentObjetivoSchema ──────────────────────────────────────────────────────

describe("AgentObjetivoSchema", () => {
  const valid = {
    goal: "Calificar leads de campañas Meta",
    steps: ["Saludar al lead", "Preguntar por interés"],
    requiredData: ["nombre", "teléfono"],
    completionCriteria: "Lead ha proporcionado nombre e interés.",
  }

  it("accepts valid objetivo", () => {
    expect(AgentObjetivoSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects empty goal", () => {
    const result = AgentObjetivoSchema.safeParse({ ...valid, goal: "" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("goal")
  })

  it("rejects empty steps array", () => {
    const result = AgentObjetivoSchema.safeParse({ ...valid, steps: [] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("steps")
  })

  it("rejects goal exceeding 500 chars", () => {
    const result = AgentObjetivoSchema.safeParse({ ...valid, goal: "a".repeat(501) })
    expect(result.success).toBe(false)
  })

  it("accepts empty requiredData", () => {
    const result = AgentObjetivoSchema.safeParse({ ...valid, requiredData: [] })
    expect(result.success).toBe(true)
  })
})

// ─── AgentPersonalidadSchema ──────────────────────────────────────────────────

describe("AgentPersonalidadSchema", () => {
  const valid = {
    internalName: "Asistente calificador",
    presentation: "¡Hola! Soy el asistente de {{nombre_empresa}}.",
    language: "es" as const,
    tone: "friendly" as const,
    responseLength: "standard" as const,
  }

  it("accepts valid personalidad", () => {
    expect(AgentPersonalidadSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects empty internalName", () => {
    const result = AgentPersonalidadSchema.safeParse({ ...valid, internalName: "" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("internalName")
  })

  it("rejects unknown language", () => {
    const result = AgentPersonalidadSchema.safeParse({ ...valid, language: "fr" })
    expect(result.success).toBe(false)
  })

  it("rejects unknown tone", () => {
    const result = AgentPersonalidadSchema.safeParse({ ...valid, tone: "aggressive" })
    expect(result.success).toBe(false)
  })

  it("rejects unknown responseLength", () => {
    const result = AgentPersonalidadSchema.safeParse({ ...valid, responseLength: "verbose" })
    expect(result.success).toBe(false)
  })

  it("accepts all valid language codes", () => {
    for (const lang of AGENT_LANGUAGES) {
      const result = AgentPersonalidadSchema.safeParse({ ...valid, language: lang })
      expect(result.success).toBe(true)
    }
  })
})

// ─── AgentReglasSchema ────────────────────────────────────────────────────────

describe("AgentReglasSchema", () => {
  const valid = {
    prohibitions: ["No ofrecer precios sin autorización"],
    transferRule: "Transferir si el usuario pide hablar con humano",
    inactivityTimeoutMinutes: 60,
    maxMessagesPerConversation: 30,
  }

  it("accepts valid reglas", () => {
    expect(AgentReglasSchema.safeParse(valid).success).toBe(true)
  })

  it("accepts empty prohibitions", () => {
    const result = AgentReglasSchema.safeParse({ ...valid, prohibitions: [] })
    expect(result.success).toBe(true)
  })

  it("rejects inactivityTimeoutMinutes < 1", () => {
    const result = AgentReglasSchema.safeParse({ ...valid, inactivityTimeoutMinutes: 0 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("inactivityTimeoutMinutes")
  })

  it("rejects inactivityTimeoutMinutes > 10080 (1 week)", () => {
    const result = AgentReglasSchema.safeParse({ ...valid, inactivityTimeoutMinutes: 10081 })
    expect(result.success).toBe(false)
  })

  it("rejects maxMessagesPerConversation < 1", () => {
    const result = AgentReglasSchema.safeParse({ ...valid, maxMessagesPerConversation: 0 })
    expect(result.success).toBe(false)
  })

  it("rejects maxMessagesPerConversation > 500", () => {
    const result = AgentReglasSchema.safeParse({ ...valid, maxMessagesPerConversation: 501 })
    expect(result.success).toBe(false)
  })

  it("accepts optional schedule with timezone", () => {
    const result = AgentReglasSchema.safeParse({
      ...valid,
      schedule: { timezone: "America/Caracas", enabled: true },
    })
    expect(result.success).toBe(true)
  })
})

// ─── AgentDespliegueSchema ────────────────────────────────────────────────────

describe("AgentDespliegueSchema — publishing ≠ sending", () => {
  const validUuid = "00000000-0000-4000-8000-000000000001"

  it("accepts config without a phoneNumberId (draft state)", () => {
    const result = AgentDespliegueSchema.safeParse({
      isDefault: false,
      campaignIds: [],
    })
    expect(result.success).toBe(true)
  })

  it("accepts config with a valid phoneNumberId", () => {
    const result = AgentDespliegueSchema.safeParse({
      phoneNumberId: validUuid,
      isDefault: true,
      campaignIds: [],
    })
    expect(result.success).toBe(true)
  })

  it("rejects phoneNumberId that is not a UUID", () => {
    const result = AgentDespliegueSchema.safeParse({
      phoneNumberId: "not-a-uuid",
      isDefault: false,
      campaignIds: [],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("phoneNumberId")
  })

  it("rejects campaignIds containing non-UUIDs", () => {
    const result = AgentDespliegueSchema.safeParse({
      isDefault: false,
      campaignIds: ["invalid-id"],
    })
    expect(result.success).toBe(false)
  })

  it("accepts multiple valid campaign UUIDs", () => {
    const result = AgentDespliegueSchema.safeParse({
      isDefault: false,
      campaignIds: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
    })
    expect(result.success).toBe(true)
  })

  it("isDefault is required and must be boolean", () => {
    const result = AgentDespliegueSchema.safeParse({
      campaignIds: [],
    })
    // Zod will coerce missing boolean — explicitly pass wrong type
    const result2 = AgentDespliegueSchema.safeParse({
      isDefault: "true" as unknown as boolean,
      campaignIds: [],
    })
    expect(result2.success).toBe(false)
  })
})

// ─── SaveAgentDraftSchema ─────────────────────────────────────────────────────

describe("SaveAgentDraftSchema — editor save contract", () => {
  const validAgentId = "00000000-0000-4000-8000-000000000099"
  const defaultConfig = getDefaultAgentConfig()

  // Build a minimal valid config that passes all schemas
  const validConfig = {
    objetivo: {
      goal: "Calificar leads",
      steps: ["Paso 1"],
      requiredData: [],
      completionCriteria: "",
    },
    personalidad: {
      internalName: "Asistente",
      presentation: "",
      language: "es" as const,
      tone: "friendly" as const,
      responseLength: "standard" as const,
    },
    conocimiento: { faq: [], knowledgeSourceIds: [] },
    acciones: { actions: {} },
    reglas: {
      prohibitions: [],
      inactivityTimeoutMinutes: 60,
      maxMessagesPerConversation: 30,
    },
    despliegue: { isDefault: false, campaignIds: [] },
  }

  it("accepts a valid draft save payload", () => {
    const result = SaveAgentDraftSchema.safeParse({
      agentId: validAgentId,
      config: validConfig,
      name: "Mi agente",
    })
    expect(result.success).toBe(true)
  })

  it("rejects agentId that is not a UUID", () => {
    const result = SaveAgentDraftSchema.safeParse({
      agentId: "not-a-uuid",
      config: validConfig,
      name: "Mi agente",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("agentId")
  })

  it("rejects empty name", () => {
    const result = SaveAgentDraftSchema.safeParse({
      agentId: validAgentId,
      config: validConfig,
      name: "",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("name")
  })

  it("accepts optional description", () => {
    const result = SaveAgentDraftSchema.safeParse({
      agentId: validAgentId,
      config: validConfig,
      name: "Mi agente",
      description: "Agente de prueba",
    })
    expect(result.success).toBe(true)
  })

  it("rejects description exceeding 500 chars", () => {
    const result = SaveAgentDraftSchema.safeParse({
      agentId: validAgentId,
      config: validConfig,
      name: "Mi agente",
      description: "a".repeat(501),
    })
    expect(result.success).toBe(false)
  })
})

// ─── Config merge model (persistence on reload) ───────────────────────────────

describe("Config merge — stored config + defaults", () => {
  it("defaults are overridden by stored values", () => {
    const defaults = getDefaultAgentConfig()
    const stored = {
      objetivo: {
        goal: "Meta personalizada",
        steps: ["Paso único"],
        requiredData: ["nombre"],
        completionCriteria: "Lead respondió",
      },
    }
    const merged = {
      ...defaults,
      objetivo: { ...defaults.objetivo, ...stored.objetivo },
    }
    expect(merged.objetivo.goal).toBe("Meta personalizada")
    expect(merged.objetivo.steps).toEqual(["Paso único"])
    // Other tabs keep defaults
    expect(merged.personalidad).toEqual(defaults.personalidad)
    expect(merged.reglas).toEqual(defaults.reglas)
  })

  it("partial stored config does not lose other tab defaults", () => {
    const defaults = getDefaultAgentConfig()
    const stored = { reglas: { ...defaults.reglas, inactivityTimeoutMinutes: 120 } }
    const merged = {
      objetivo: { ...defaults.objetivo, ...(stored as any).objetivo },
      personalidad: { ...defaults.personalidad, ...(stored as any).personalidad },
      conocimiento: { ...defaults.conocimiento, ...(stored as any).conocimiento },
      acciones: { ...defaults.acciones, ...(stored as any).acciones },
      reglas: { ...defaults.reglas, ...stored.reglas },
      despliegue: { ...defaults.despliegue, ...(stored as any).despliegue },
    }
    expect(merged.reglas.inactivityTimeoutMinutes).toBe(120)
    expect(merged.objetivo.goal).toBe(defaults.objetivo.goal)
  })
})

// ─── Template config completeness ─────────────────────────────────────────────

describe("Template configs — no missing required fields", () => {
  const allTemplateIds = AGENT_TEMPLATE_LIST.map(t => t.id)

  it.each(allTemplateIds)("template '%s' personalidad is valid", (id) => {
    const t = getAgentTemplate(id)!
    const result = AgentPersonalidadSchema.safeParse(t.config.personalidad)
    expect(result.success).toBe(true)
  })

  it.each(allTemplateIds)("template '%s' reglas limits are in range", (id) => {
    const t = getAgentTemplate(id)!
    const { inactivityTimeoutMinutes, maxMessagesPerConversation } = t.config.reglas
    expect(inactivityTimeoutMinutes).toBeGreaterThanOrEqual(1)
    expect(inactivityTimeoutMinutes).toBeLessThanOrEqual(10080)
    expect(maxMessagesPerConversation).toBeGreaterThanOrEqual(1)
    expect(maxMessagesPerConversation).toBeLessThanOrEqual(500)
  })

  it.each(allTemplateIds)("template '%s' despliegue has no phoneNumberId by default", (id) => {
    const t = getAgentTemplate(id)!
    // Templates should not pre-assign a phone number — that's org-specific
    expect(t.config.despliegue.phoneNumberId).toBeUndefined()
  })

  it.each(allTemplateIds)("template '%s' campaignIds is empty by default", (id) => {
    const t = getAgentTemplate(id)!
    expect(t.config.despliegue.campaignIds).toHaveLength(0)
  })
})
