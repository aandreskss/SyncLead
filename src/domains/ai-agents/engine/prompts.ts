import "server-only"

import type { AgentConfig } from "../types"

// ─── Lead context (optional, from conversation/lead record) ───────────────────

export interface LeadContext {
  name?: string
  phone?: string
  email?: string
  city?: string
  campaignName?: string
  leadSource?: string
  temperature?: string
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildSystemPrompt(
  config: AgentConfig,
  leadContext?: LeadContext,
  conversationSummary?: string
): string {
  const sections: string[] = []

  // ── Section 1: Identidad ──────────────────────────────────────────────────
  const { personalidad } = config

  const languageInstruction =
    personalidad.language === "es"
      ? "Responde siempre en español."
      : personalidad.language === "en"
      ? "Always respond in English."
      : "Responda sempre em português."

  const toneInstruction =
    personalidad.tone === "formal"
      ? "Usa un tono formal y profesional en todo momento."
      : personalidad.tone === "friendly"
      ? "Usa un tono amigable y cercano."
      : personalidad.tone === "neutral"
      ? "Usa un tono neutral y objetivo."
      : "Usa un tono empático y comprensivo."

  const lengthInstruction =
    personalidad.responseLength === "brief"
      ? "Sé conciso y directo en tus respuestas."
      : personalidad.responseLength === "standard"
      ? "Respuestas equilibradas, ni demasiado cortas ni demasiado largas."
      : "Puedes ser detallado cuando el tema lo requiere."

  const identidadLines = [
    `Eres ${personalidad.internalName}.`,
  ]
  if (personalidad.presentation) {
    identidadLines.push(personalidad.presentation)
  }
  identidadLines.push(languageInstruction)
  identidadLines.push(toneInstruction)
  identidadLines.push(lengthInstruction)

  sections.push(`## Identidad\n${identidadLines.join("\n")}`)

  // ── Section 2: Objetivo ───────────────────────────────────────────────────
  const { objetivo } = config
  const objetivoLines = [`**Objetivo principal:** ${objetivo.goal}`]

  if (objetivo.steps.length > 0) {
    objetivoLines.push("\n**Pasos a seguir:**")
    objetivo.steps.forEach((step, i) => {
      objetivoLines.push(`${i + 1}. ${step}`)
    })
  }

  if (objetivo.requiredData.length > 0) {
    objetivoLines.push("\n**Datos a recopilar:**")
    objetivo.requiredData.forEach((datum) => {
      objetivoLines.push(`- ${datum}`)
    })
  }

  if (objetivo.completionCriteria) {
    objetivoLines.push(`\n**Criterio de finalización:** ${objetivo.completionCriteria}`)
  }

  sections.push(`## Objetivo\n${objetivoLines.join("\n")}`)

  // ── Section 3: Conocimiento (FAQ) ─────────────────────────────────────────
  const { faq } = config.conocimiento
  if (faq.length > 0) {
    const faqLines = faq.map((item) => `P: ${item.question}\nR: ${item.answer}`)
    sections.push(`## Conocimiento (FAQ)\n${faqLines.join("\n\n")}`)
  }

  // ── Section 4: Reglas ─────────────────────────────────────────────────────
  const { reglas } = config
  const reglasLines: string[] = []

  if (reglas.prohibitions.length > 0) {
    reglasLines.push("**Prohibiciones:**")
    reglas.prohibitions.forEach((p, i) => {
      reglasLines.push(`${i + 1}. PROHIBIDO: ${p}`)
    })
  }

  if (reglas.transferRule) {
    reglasLines.push(`\n**Regla de transferencia:** ${reglas.transferRule}`)
  }

  reglasLines.push(`\n**Inactividad:** Si el contacto no responde en ${reglas.inactivityTimeoutMinutes} minutos, cierra la conversación cortésmente.`)
  reglasLines.push(`**Límite de mensajes:** Máximo ${reglas.maxMessagesPerConversation} mensajes por conversación.`)

  sections.push(`## Reglas\n${reglasLines.join("\n")}`)

  // ── Section 5: Resumen de conversación anterior (if summary exists) ──────
  // Injected before lead context so the agent knows confirmed facts and pending
  // decisions from earlier in a long conversation without loading full history.
  if (conversationSummary) {
    sections.push(
      `## Resumen de conversación anterior\n` +
      `Los siguientes datos fueron confirmados o acordados antes en esta conversación. ` +
      `No los repitas ni los preguntes de nuevo:\n\n${conversationSummary}`
    )
  }

  // ── Section 6: Contexto del lead (if provided) ────────────────────────────
  if (leadContext) {
    const contextLines: string[] = []
    if (leadContext.name) contextLines.push(`- Nombre: ${leadContext.name}`)
    if (leadContext.phone) contextLines.push(`- Teléfono: ${leadContext.phone}`)
    if (leadContext.email) contextLines.push(`- Email: ${leadContext.email}`)
    if (leadContext.campaignName) contextLines.push(`- Campaña: ${leadContext.campaignName}`)

    if (leadContext.city) contextLines.push(`- Ciudad: ${leadContext.city}`)
    if (leadContext.temperature) contextLines.push(`- Temperatura: ${leadContext.temperature}`)

    if (contextLines.length > 0) {
      sections.push(`## Contexto del lead\n${contextLines.join("\n")}`)
    }
  }

  // ── Section 6: Instrucciones de herramientas ──────────────────────────────
  sections.push(
    `## Instrucciones de herramientas\nTienes acceso a herramientas del CRM. Úsalas para registrar información importante de la conversación, actualizar el estado del lead y notificar al equipo cuando sea necesario. Siempre usa las herramientas para mantener el CRM actualizado — no asumas que el equipo recordará los detalles de la conversación.`
  )

  return sections.join("\n\n---\n\n")
}
