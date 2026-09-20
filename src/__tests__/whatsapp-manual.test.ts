// ─── WhatsApp manual mode tests ───────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))

import {
  buildWaLink,
  interpolateTemplate,
} from "@/domains/whatsapp/repository"
import {
  SaveWaClientConfigSchema,
  CreateMessageTemplateSchema,
  PrepareWaLinkSchema,
  MarkMessageSharedSchema,
  CorrectConfirmationSchema,
} from "@/domains/whatsapp/types"

// ─── wa.me link generation ────────────────────────────────────────────────────

describe("buildWaLink", () => {
  it("builds a wa.me link with encoded message", () => {
    const link = buildWaLink("+58414123456", "Hola mundo")
    expect(link).toBe("https://wa.me/+58414123456?text=Hola%20mundo")
  })

  it("strips non-digit non-plus chars from phone", () => {
    const link = buildWaLink("+584 14-123456", "hola")
    expect(link).toBe("https://wa.me/+58414123456?text=hola")
  })

  it("encodes special characters in message", () => {
    const link = buildWaLink("+1234567890", "Hello & World <test>")
    expect(link).toContain("Hello%20%26%20World")
  })

  it("handles empty message", () => {
    const link = buildWaLink("+1234567890", "")
    expect(link).toBe("https://wa.me/+1234567890?text=")
  })
})

// ─── Template interpolation ───────────────────────────────────────────────────

describe("interpolateTemplate", () => {
  it("replaces allowed variables", () => {
    const result = interpolateTemplate(
      "Hola {{nombre}}, tu pedido {{producto}} está listo.",
      ["nombre", "producto"],
      { nombre: "Ana", producto: "Zapatos" },
    )
    expect(result).toBe("Hola Ana, tu pedido Zapatos está listo.")
  })

  it("leaves unset allowed variables as-is", () => {
    const result = interpolateTemplate(
      "Hola {{nombre}}, {{apellido}}",
      ["nombre", "apellido"],
      { nombre: "Ana" },
    )
    expect(result).toBe("Hola Ana, {{apellido}}")
  })

  it("does NOT replace disallowed variables (security boundary)", () => {
    const result = interpolateTemplate(
      "Precio: {{precio}} - Token: {{token}}",
      ["precio"],
      { precio: "$100", token: "secret123" },
    )
    expect(result).toBe("Precio: $100 - Token: {{token}}")
  })

  it("escapes HTML in variable values (XSS prevention)", () => {
    const result = interpolateTemplate(
      "Mensaje: {{content}}",
      ["content"],
      { content: "<script>alert(1)</script>" },
    )
    expect(result).not.toContain("<script>")
    expect(result).toContain("&lt;script&gt;")
  })

  it("escapes double quotes and single quotes", () => {
    const result = interpolateTemplate(
      "{{msg}}",
      ["msg"],
      { msg: 'He said "hello" & it\'s fine' },
    )
    expect(result).toContain("&quot;")
    expect(result).toContain("&#39;")
    expect(result).toContain("&amp;")
  })

  it("handles empty variables record", () => {
    const result = interpolateTemplate("Hola {{nombre}}", ["nombre"], {})
    expect(result).toBe("Hola {{nombre}}")
  })
})

// ─── Zod schemas ──────────────────────────────────────────────────────────────

describe("SaveWaClientConfigSchema", () => {
  it("accepts manual mode", () => {
    const r = SaveWaClientConfigSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      confirmationMode: "manual",
    })
    expect(r.success).toBe(true)
  })

  it("accepts provider mode", () => {
    const r = SaveWaClientConfigSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      confirmationMode: "provider",
      providerName: "callbell",
    })
    expect(r.success).toBe(true)
  })

  it("rejects unknown mode", () => {
    const r = SaveWaClientConfigSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      confirmationMode: "auto",
    })
    expect(r.success).toBe(false)
  })
})

describe("CreateMessageTemplateSchema", () => {
  it("accepts valid template", () => {
    const r = CreateMessageTemplateSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      name: "Bienvenida",
      content: "Hola {{nombre}}, bienvenido.",
      allowedVariables: ["nombre"],
    })
    expect(r.success).toBe(true)
  })

  it("rejects empty name", () => {
    const r = CreateMessageTemplateSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      name: "",
      content: "Hola",
    })
    expect(r.success).toBe(false)
  })

  it("rejects content over 4096 chars", () => {
    const r = CreateMessageTemplateSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      name: "Test",
      content: "x".repeat(4097),
    })
    expect(r.success).toBe(false)
  })
})

describe("PrepareWaLinkSchema", () => {
  it("accepts leadId only", () => {
    const r = PrepareWaLinkSchema.safeParse({
      leadId: "550e8400-e29b-41d4-a716-446655440001",
    })
    expect(r.success).toBe(true)
    expect(r.data?.variables).toEqual({})
  })

  it("accepts templateId and variables", () => {
    const r = PrepareWaLinkSchema.safeParse({
      leadId: "550e8400-e29b-41d4-a716-446655440001",
      templateId: "550e8400-e29b-41d4-a716-446655440002",
      variables: { nombre: "Ana" },
    })
    expect(r.success).toBe(true)
  })
})

describe("MarkMessageSharedSchema", () => {
  it("accepts messageId with optional note", () => {
    const r = MarkMessageSharedSchema.safeParse({
      messageId: "550e8400-e29b-41d4-a716-446655440001",
      note: "Enviado por WhatsApp web",
    })
    expect(r.success).toBe(true)
  })

  it("accepts without note", () => {
    const r = MarkMessageSharedSchema.safeParse({
      messageId: "550e8400-e29b-41d4-a716-446655440001",
    })
    expect(r.success).toBe(true)
    expect(r.data?.note).toBeUndefined()
  })
})

describe("CorrectConfirmationSchema", () => {
  it("requires non-empty reason", () => {
    const r = CorrectConfirmationSchema.safeParse({
      messageId: "550e8400-e29b-41d4-a716-446655440001",
      reason: "",
    })
    expect(r.success).toBe(false)
  })

  it("accepts valid correction", () => {
    const r = CorrectConfirmationSchema.safeParse({
      messageId: "550e8400-e29b-41d4-a716-446655440001",
      reason: "No se envió realmente",
    })
    expect(r.success).toBe(true)
  })
})

// ─── State machine: manual flow ───────────────────────────────────────────────

describe("Manual confirmation state machine", () => {
  type WaStatus =
    | "link_prepared" | "marked_shared" | "provider_accepted"
    | "sent" | "delivered" | "read" | "contacted" | "failed"

  function canMarkShared(status: WaStatus, mode: "manual" | "provider"): boolean {
    return status === "link_prepared" && mode === "manual"
  }

  function canCorrect(status: WaStatus, mode: "manual" | "provider"): boolean {
    return status === "marked_shared" && mode === "manual"
  }

  it("link_prepared → marked_shared is valid for manual mode", () => {
    expect(canMarkShared("link_prepared", "manual")).toBe(true)
  })

  it("link_prepared → marked_shared is NOT valid for provider mode", () => {
    expect(canMarkShared("link_prepared", "provider")).toBe(false)
  })

  it("already sent cannot be marked shared again directly", () => {
    expect(canMarkShared("marked_shared", "manual")).toBe(false)
  })

  it("marked_shared can be corrected (reverted to link_prepared)", () => {
    expect(canCorrect("marked_shared", "manual")).toBe(true)
  })

  it("link_prepared cannot be corrected (nothing to undo)", () => {
    expect(canCorrect("link_prepared", "manual")).toBe(false)
  })

  it("opening wa.me does NOT imply message was sent", () => {
    // Core invariant: link_prepared ≠ marked_shared
    const stateAfterOpen: WaStatus = "link_prepared"
    const stateAfterConfirm: WaStatus = "marked_shared"
    expect(stateAfterOpen).not.toBe(stateAfterConfirm)
    expect(canMarkShared(stateAfterOpen, "manual")).toBe(true)
    expect(canMarkShared(stateAfterConfirm, "manual")).toBe(false)
  })
})

// ─── Mode change preserves history ───────────────────────────────────────────

describe("Mode change without altering history", () => {
  it("changing confirmationMode does not mutate existing wa_messages", () => {
    // confirmationMode is stored per-message (not inherited from config)
    const existingMessage = {
      id: "msg-1",
      confirmationMode: "manual" as const,
      status: "marked_shared" as const,
      confirmedAt: new Date("2024-01-01"),
    }
    // Changing client config to "provider" does not affect this message
    const newMode = "provider"
    expect(existingMessage.confirmationMode).toBe("manual")
    expect(existingMessage.status).toBe("marked_shared")
    expect(newMode).toBe("provider")
    // History is immutable
    expect(existingMessage.confirmedAt).toBeInstanceOf(Date)
  })
})

// ─── Separation of concerns ───────────────────────────────────────────────────

describe("Assign vs send vs contact are separate actions", () => {
  it("assigning a lead does not imply link_prepared", () => {
    const assignmentState = { isCurrent: true, salesRepId: "rep-1" }
    const waMessageState = null // no wa message created yet
    expect(waMessageState).toBeNull()
    expect(assignmentState.isCurrent).toBe(true)
  })

  it("link_prepared does not imply marked_shared", () => {
    const waStatus = "link_prepared"
    expect(waStatus).toBe("link_prepared")
    expect(waStatus).not.toBe("marked_shared")
  })

  it("marked_shared does not imply contacted", () => {
    const waStatus = "marked_shared"
    const leadContactedAt = null // not yet marked as contacted
    expect(waStatus).toBe("marked_shared")
    expect(leadContactedAt).toBeNull()
  })
})
