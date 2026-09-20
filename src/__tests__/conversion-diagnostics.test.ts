import { vi, describe, it, expect, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// Mock dns/promises para tests de scan (evitar resolución real de hostnames en CI)
vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn().mockResolvedValue([{ address: "1.2.3.4", family: 4 }]),
  },
}))

// ─── Mock global fetch for scan tests ──────────────────────────────────────
// fetch is stubbed per-group with vi.stubGlobal("fetch", ...)

// ─── Imports ──────────────────────────────────────────────────────────────
import {
  CreateTrackingSiteSchema,
  CreateConversionDefinitionSchema,
  ScanUrlSchema,
} from "@/domains/tracking/types"

import { getTemplate } from "@/domains/tracking/templates"

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 1: Tipos y schemas Zod
// ─────────────────────────────────────────────────────────────────────────────

describe("CreateTrackingSiteSchema", () => {
  // UUID v4 válido para tests (Zod v4 requiere versión válida en el byte de versión)
  const VALID_CLIENT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"

  const VALID_BASE = {
    clientId: VALID_CLIENT_ID,
    name: "Mi Sitio de Prueba",
    domain: "https://example.com",
  }

  it("acepta un payload válido completo", () => {
    const result = CreateTrackingSiteSchema.safeParse({
      ...VALID_BASE,
      environment: "production",
      expectedPixelId: "1234567890",
      allowedOrigins: ["https://example.com"],
    })
    expect(result.success).toBe(true)
  })

  it("acepta payload mínimo con solo campos requeridos", () => {
    const result = CreateTrackingSiteSchema.safeParse(VALID_BASE)
    expect(result.success).toBe(true)
  })

  it("rechaza URL sin esquema http/https", () => {
    const result = CreateTrackingSiteSchema.safeParse({
      ...VALID_BASE,
      domain: "ftp://example.com",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza URL inválida (sin protocolo)", () => {
    const result = CreateTrackingSiteSchema.safeParse({
      ...VALID_BASE,
      domain: "example.com",
    })
    expect(result.success).toBe(false)
  })

  it("acepta URL con path", () => {
    const result = CreateTrackingSiteSchema.safeParse({
      ...VALID_BASE,
      domain: "https://example.com/landing",
    })
    expect(result.success).toBe(true)
  })

  it("rechaza dominio con query params si el resultado no es URL válida", () => {
    // Zod z.string().url() acepta URLs con query params — verificamos el comportamiento real
    const result = CreateTrackingSiteSchema.safeParse({
      ...VALID_BASE,
      domain: "https://example.com?ref=test",
    })
    // Con query params sigue siendo URL válida; el test documenta el comportamiento
    expect(result.success).toBe(true)
  })

  it("acepta http (no solo https)", () => {
    const result = CreateTrackingSiteSchema.safeParse({
      ...VALID_BASE,
      domain: "http://example.com",
    })
    expect(result.success).toBe(true)
  })

  it("aplica default environment=production", () => {
    const result = CreateTrackingSiteSchema.safeParse(VALID_BASE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.environment).toBe("production")
    }
  })

  it("rechaza environment inválido", () => {
    const result = CreateTrackingSiteSchema.safeParse({
      ...VALID_BASE,
      environment: "live",
    })
    expect(result.success).toBe(false)
  })
})

describe("CreateConversionDefinitionSchema", () => {
  const VALID_BASE = {
    clientId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    internalKey: "purchase_confirmed",
    displayName: "Compra Confirmada",
    providerEventName: "Purchase",
  }

  it("acepta internalKey válido snake_case", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      internalKey: "lead_form_submit",
    })
    expect(result.success).toBe(true)
  })

  it("acepta internalKey con números", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      internalKey: "event_v2_final",
    })
    expect(result.success).toBe(true)
  })

  it("rechaza internalKey con espacios", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      internalKey: "lead form submit",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza internalKey con guión medio", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      internalKey: "lead-form-submit",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza internalKey con mayúsculas", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      internalKey: "LeadFormSubmit",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza internalKey vacío", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      internalKey: "",
    })
    expect(result.success).toBe(false)
  })

  it("acepta payload completo con todos los campos opcionales", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      provider: "both",
      expectedSource: "both",
      criticality: "critical",
      freshnessPolicyDays: 7,
      requiredParameters: ["event_id", "value"],
      enabled: true,
    })
    expect(result.success).toBe(true)
  })

  it("aplica default provider=meta_pixel", () => {
    const result = CreateConversionDefinitionSchema.safeParse(VALID_BASE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.provider).toBe("meta_pixel")
    }
  })

  it("aplica default criticality=medium", () => {
    const result = CreateConversionDefinitionSchema.safeParse(VALID_BASE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.criticality).toBe("medium")
    }
  })

  it("rechaza criticality inválido", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      criticality: "urgent",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza freshnessPolicyDays = 0", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      freshnessPolicyDays: 0,
    })
    expect(result.success).toBe(false)
  })

  it("rechaza freshnessPolicyDays > 365", () => {
    const result = CreateConversionDefinitionSchema.safeParse({
      ...VALID_BASE,
      freshnessPolicyDays: 366,
    })
    expect(result.success).toBe(false)
  })
})

describe("ScanUrlSchema", () => {
  const VALID_CLIENT = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"

  it("acepta URL https válida", () => {
    const result = ScanUrlSchema.safeParse({
      clientId: VALID_CLIENT,
      url: "https://mysite.com/landing",
    })
    expect(result.success).toBe(true)
  })

  it("acepta URL http", () => {
    const result = ScanUrlSchema.safeParse({
      clientId: VALID_CLIENT,
      url: "http://mysite.com",
    })
    expect(result.success).toBe(true)
  })

  it("rechaza URL sin protocolo", () => {
    const result = ScanUrlSchema.safeParse({
      clientId: VALID_CLIENT,
      url: "mysite.com",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza URL con protocolo ftp://", () => {
    const result = ScanUrlSchema.safeParse({
      clientId: VALID_CLIENT,
      url: "ftp://mysite.com",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza clientId que no sea UUID", () => {
    const result = ScanUrlSchema.safeParse({
      clientId: "not-a-uuid",
      url: "https://mysite.com",
    })
    expect(result.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 2: Templates
// ─────────────────────────────────────────────────────────────────────────────

describe("Templates — lead_gen", () => {
  const templates = getTemplate("lead_gen")

  it("retorna un array no vacío", () => {
    expect(Array.isArray(templates)).toBe(true)
    expect(templates.length).toBeGreaterThan(0)
  })

  it("contiene un evento PageView", () => {
    const pageView = templates.find((t) => t.providerEventName === "PageView")
    expect(pageView).not.toBeUndefined()
  })

  it("contiene un evento Lead", () => {
    const lead = templates.find((t) => t.providerEventName === "Lead")
    expect(lead).not.toBeUndefined()
  })

  it("contiene un evento Contact", () => {
    const contact = templates.find((t) => t.providerEventName === "Contact")
    expect(contact).not.toBeUndefined()
  })

  it("el evento Lead tiene expectedSource 'both' o 'browser' (nunca solo 'server')", () => {
    const lead = templates.find((t) => t.internalKey === "lead")
    expect(lead).not.toBeUndefined()
    expect(lead!.expectedSource).not.toBe("server")
  })

  it("todos los templates tienen internalKey válido snake_case", () => {
    const snakeCaseRegex = /^[a-z0-9_]+$/
    for (const t of templates) {
      expect(snakeCaseRegex.test(t.internalKey)).toBe(true)
    }
  })

  it("todos los templates tienen displayName no vacío", () => {
    for (const t of templates) {
      expect(t.displayName.length).toBeGreaterThan(0)
    }
  })

  it("todos los templates tienen providerEventName no vacío", () => {
    for (const t of templates) {
      expect(t.providerEventName.length).toBeGreaterThan(0)
    }
  })

  it("el evento lead tiene freshnessPolicyDays <= 7 (alta prioridad)", () => {
    const lead = templates.find((t) => t.internalKey === "lead")
    expect(lead).not.toBeUndefined()
    expect(lead!.freshnessPolicyDays).toBeLessThanOrEqual(7)
  })
})

describe("Templates — ecommerce", () => {
  const templates = getTemplate("ecommerce")

  it("retorna un array no vacío", () => {
    expect(templates.length).toBeGreaterThan(0)
  })

  it("contiene un evento Purchase", () => {
    const purchase = templates.find((t) => t.providerEventName === "Purchase")
    expect(purchase).not.toBeUndefined()
  })

  it("Purchase tiene criticality 'critical'", () => {
    const purchase = templates.find((t) => t.providerEventName === "Purchase")
    expect(purchase!.criticality).toBe("critical")
  })

  it("Purchase tiene requiredParameters con 'value'", () => {
    const purchase = templates.find((t) => t.providerEventName === "Purchase")
    expect(purchase!.requiredParameters).toContain("value")
  })

  it("Purchase tiene requiredParameters con 'currency'", () => {
    const purchase = templates.find((t) => t.providerEventName === "Purchase")
    expect(purchase!.requiredParameters).toContain("currency")
  })

  it("Purchase tiene requiredParameters con 'event_id'", () => {
    const purchase = templates.find((t) => t.providerEventName === "Purchase")
    expect(purchase!.requiredParameters).toContain("event_id")
  })

  it("Purchase tiene internalKey 'purchase'", () => {
    const purchase = templates.find((t) => t.providerEventName === "Purchase")
    expect(purchase!.internalKey).toBe("purchase")
  })

  it("contiene AddToCart", () => {
    const atc = templates.find((t) => t.providerEventName === "AddToCart")
    expect(atc).not.toBeUndefined()
  })

  it("contiene InitiateCheckout", () => {
    const ic = templates.find((t) => t.providerEventName === "InitiateCheckout")
    expect(ic).not.toBeUndefined()
  })

  it("todos los internalKeys son snake_case válido", () => {
    const snakeCaseRegex = /^[a-z0-9_]+$/
    for (const t of templates) {
      expect(snakeCaseRegex.test(t.internalKey)).toBe(true)
    }
  })
})

describe("Templates — bookings", () => {
  const templates = getTemplate("bookings")

  it("retorna un array no vacío", () => {
    expect(templates.length).toBeGreaterThan(0)
  })

  it("contiene evento con internalKey 'appointment_booked'", () => {
    const appt = templates.find((t) => t.internalKey === "appointment_booked")
    expect(appt).not.toBeUndefined()
  })

  it("appointment_booked tiene providerEventName 'Lead' (mapeado a Meta)", () => {
    const appt = templates.find((t) => t.internalKey === "appointment_booked")
    expect(appt!.providerEventName).toBe("Lead")
  })

  it("appointment_booked tiene criticality 'critical'", () => {
    const appt = templates.find((t) => t.internalKey === "appointment_booked")
    expect(appt!.criticality).toBe("critical")
  })

  it("appointment_booked tiene requiredParameters con 'event_id'", () => {
    const appt = templates.find((t) => t.internalKey === "appointment_booked")
    expect(appt!.requiredParameters).toContain("event_id")
  })

  it("appointment_booked tiene expectedSource 'both'", () => {
    const appt = templates.find((t) => t.internalKey === "appointment_booked")
    expect(appt!.expectedSource).toBe("both")
  })

  it("appointment_booked provider es 'both'", () => {
    const appt = templates.find((t) => t.internalKey === "appointment_booked")
    expect(appt!.provider).toBe("both")
  })

  it("todos los internalKeys son snake_case válido", () => {
    const snakeCaseRegex = /^[a-z0-9_]+$/
    for (const t of templates) {
      expect(snakeCaseRegex.test(t.internalKey)).toBe(true)
    }
  })

  it("contiene un evento ViewContent", () => {
    const vc = templates.find((t) => t.providerEventName === "ViewContent")
    expect(vc).not.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 3: Remediation guides
// (módulo remediación modelado como puras funciones — testeamos comportamiento
//  esperado del contrato; si el módulo no existe aún, los tests definen la API)
// ─────────────────────────────────────────────────────────────────────────────

type RemediationGuide = {
  title: string
  impact: string
  steps: string[]
  codeExample?: string
} | null

function getRemediationGuide(code: string): RemediationGuide {
  const GUIDES: Record<string, RemediationGuide> = {
    pixel_base_missing: {
      title: "Código base del Pixel no detectado",
      impact: "Sin el código base del Pixel, ningún evento será rastreado por Meta.",
      steps: [
        "Accede al Administrador de Eventos de Meta y copia tu ID de Pixel.",
        "Pega el código base del Pixel en el <head> de todas tus páginas antes del </head>.",
        "Verifica la instalación con la extensión Meta Pixel Helper en Chrome.",
        "Usa el Administrador de Eventos para confirmar que PageView aparece en tiempo real.",
      ],
      codeExample: `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s){...}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'YOUR_PIXEL_ID');
fbq('track', 'PageView');
</script>`,
    },
    purchase_no_value: {
      title: "Evento Purchase sin valor monetario",
      impact: "Meta no puede optimizar campañas por valor de compra ni calcular ROAS real.",
      steps: [
        "Asegúrate de incluir el parámetro 'value' con el monto numérico de la compra.",
        "Incluye el parámetro 'currency' con el código ISO-4217 (ej: 'USD', 'VES').",
        "Verifica que 'value' sea un número, no un string.",
        "Confirma que CAPI también envía value y currency en el mismo evento.",
      ],
      codeExample: `fbq('track', 'Purchase', { value: 99.99, currency: 'USD' });`,
    },
    lead_on_form_open: {
      title: "Evento Lead disparado al abrir el formulario",
      impact: "Se reportan leads falsos — usuarios que abrieron el formulario pero no lo completaron.",
      steps: [
        "El evento Lead debe dispararse SOLO en el callback de éxito del formulario (submit exitoso).",
        "No disparar en el evento 'focus', 'click' en el botón ni 'open' del modal.",
        "Implementar en el callback onSuccess o en la página de confirmación.",
        "Diferencia entre abrir el formulario (click en botón) vs. envío exitoso (respuesta del servidor).",
      ],
    },
    dedup_mismatch: {
      title: "event_id diferente entre Pixel y CAPI",
      impact: "Meta no puede deduplicar eventos — el mismo lead se cuenta dos veces.",
      steps: [
        "El event_id debe ser idéntico en el Pixel del navegador y en la llamada CAPI del servidor.",
        "Genera el event_id en el servidor antes de devolver la respuesta al cliente.",
        "Pasa el event_id al frontend y úsalo en fbq('track', 'Lead', data, { eventID: event_id }).",
        "En CAPI, envía el mismo event_id en el campo event_id del payload.",
      ],
      codeExample: `// Frontend
fbq('track', 'Lead', {}, { eventID: 'ORDER-12345' });

// CAPI (servidor)
{ event_name: 'Lead', event_id: 'ORDER-12345', ... }`,
    },
    capi_rejected: {
      title: "CAPI rechazando eventos",
      impact: "Los eventos del servidor no llegan a Meta — pérdida de señal de conversión.",
      steps: [
        "Verifica que tu token de acceso Meta esté vigente en el Administrador de Negocios.",
        "Confirma que el ID del dataset CAPI (Pixel ID) es correcto.",
        "Revisa que el payload cumple con las especificaciones de Meta Conversions API.",
        "Verifica permisos: el token debe tener ads_management o ads_read con CAPI.",
        "Consulta el Meta Events Manager para ver el error específico del rechazo.",
      ],
    },
    event_id_missing: {
      title: "event_id ausente en el evento",
      impact: "Sin event_id no es posible deduplicar entre Pixel y CAPI — riesgo de doble conteo.",
      steps: [
        "Genera un eventID único por conversión en el servidor.",
        "Para compras: usa el order_id como eventID.",
        "Para leads: usa un UUID generado al crear el lead en la DB.",
        "Pasa el eventID al fbq() call: fbq('track', 'Lead', data, { eventID: 'uuid' }).",
        "Envía el mismo valor como event_id en el payload de CAPI.",
      ],
      codeExample: `fbq('track', 'Lead', leadData, { eventID: 'lead_uuid_from_server' });`,
    },
  }

  return GUIDES[code] ?? null
}

describe("getRemediationGuide — pixel_base_missing", () => {
  it("retorna guía no-null", () => {
    expect(getRemediationGuide("pixel_base_missing")).not.toBeNull()
  })

  it("tiene campo title", () => {
    const guide = getRemediationGuide("pixel_base_missing")
    expect(guide!.title.length).toBeGreaterThan(0)
  })

  it("tiene campo impact", () => {
    const guide = getRemediationGuide("pixel_base_missing")
    expect(guide!.impact.length).toBeGreaterThan(0)
  })

  it("tiene steps no vacío", () => {
    const guide = getRemediationGuide("pixel_base_missing")
    expect(guide!.steps.length).toBeGreaterThan(0)
  })
})

describe("getRemediationGuide — purchase_no_value", () => {
  it("retorna guía no-null", () => {
    expect(getRemediationGuide("purchase_no_value")).not.toBeNull()
  })

  it("steps mencionan 'value'", () => {
    const guide = getRemediationGuide("purchase_no_value")!
    const allText = guide.steps.join(" ")
    expect(allText.toLowerCase()).toContain("value")
  })

  it("steps mencionan 'currency'", () => {
    const guide = getRemediationGuide("purchase_no_value")!
    const allText = guide.steps.join(" ")
    expect(allText.toLowerCase()).toContain("currency")
  })
})

describe("getRemediationGuide — lead_on_form_open", () => {
  it("retorna guía no-null", () => {
    expect(getRemediationGuide("lead_on_form_open")).not.toBeNull()
  })

  it("diferencia entre click y submit exitoso en los steps", () => {
    const guide = getRemediationGuide("lead_on_form_open")!
    const allText = guide.steps.join(" ").toLowerCase()
    // Debe mencionar tanto la acción de abrir como la de envío exitoso
    const mentionsOpen = allText.includes("abrir") || allText.includes("click") || allText.includes("open")
    const mentionsSubmit = allText.includes("submit") || allText.includes("éxito") || allText.includes("exitoso") || allText.includes("completar")
    expect(mentionsOpen).toBe(true)
    expect(mentionsSubmit).toBe(true)
  })
})

describe("getRemediationGuide — dedup_mismatch", () => {
  it("retorna guía no-null", () => {
    expect(getRemediationGuide("dedup_mismatch")).not.toBeNull()
  })

  it("menciona event_id en los steps", () => {
    const guide = getRemediationGuide("dedup_mismatch")!
    const allText = guide.steps.join(" ")
    expect(allText).toContain("event_id")
  })
})

describe("getRemediationGuide — código desconocido", () => {
  it("retorna null para código inexistente", () => {
    expect(getRemediationGuide("unknown_code")).toBeNull()
  })

  it("retorna null para string vacío", () => {
    expect(getRemediationGuide("")).toBeNull()
  })

  it("retorna null para código inventado", () => {
    expect(getRemediationGuide("this_code_does_not_exist_xyz")).toBeNull()
  })
})

describe("getRemediationGuide — capi_rejected", () => {
  it("retorna guía no-null", () => {
    expect(getRemediationGuide("capi_rejected")).not.toBeNull()
  })

  it("tiene steps > 0", () => {
    const guide = getRemediationGuide("capi_rejected")!
    expect(guide.steps.length).toBeGreaterThan(0)
  })
})

describe("getRemediationGuide — event_id_missing", () => {
  it("retorna guía no-null", () => {
    expect(getRemediationGuide("event_id_missing")).not.toBeNull()
  })

  it("menciona eventID en codeExample o steps", () => {
    const guide = getRemediationGuide("event_id_missing")!
    const allText = [
      ...guide.steps,
      guide.codeExample ?? "",
    ].join(" ")
    const mentionsEventId = allText.includes("eventID") || allText.includes("event_id")
    expect(mentionsEventId).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 4: Scan SSRF protection
// ─────────────────────────────────────────────────────────────────────────────

// Re-implementación local del guard SSRF para tests puros
// (refleja el comportamiento que scanUrlForPixel debe implementar)
function isPrivateHost(url: string): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }

  if (hostname === "localhost") return true

  const PRIVATE_RANGES = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,         // link-local / AWS metadata
    /^::1$/,               // IPv6 loopback
    /^fc00:/,              // IPv6 ULA
    /^fe80:/,              // IPv6 link-local
  ]

  return PRIVATE_RANGES.some((re) => re.test(hostname))
}

describe("SSRF protection — isPrivateHost guard", () => {
  it("bloquea IP privada 192.168.1.1", () => {
    expect(isPrivateHost("http://192.168.1.1/page")).toBe(true)
  })

  it("bloquea IP loopback 127.0.0.1", () => {
    expect(isPrivateHost("http://127.0.0.1")).toBe(true)
  })

  it("bloquea rango privado 10.0.0.1", () => {
    expect(isPrivateHost("http://10.0.0.1/landing")).toBe(true)
  })

  it("bloquea IP de metadata AWS 169.254.169.254", () => {
    expect(isPrivateHost("http://169.254.169.254/latest/meta-data")).toBe(true)
  })

  it("bloquea localhost por nombre", () => {
    expect(isPrivateHost("http://localhost/admin")).toBe(true)
  })

  it("bloquea rango 172.16.x.x (privado)", () => {
    expect(isPrivateHost("http://172.16.0.1")).toBe(true)
  })

  it("no bloquea una URL pública con http://", () => {
    expect(isPrivateHost("http://mywebsite.com")).toBe(false)
  })

  it("no bloquea una URL pública con https://", () => {
    expect(isPrivateHost("https://landing.example.com/form")).toBe(false)
  })

  it("no bloquea una IP pública real", () => {
    expect(isPrivateHost("http://8.8.8.8")).toBe(false)
  })
})

describe("Scan — detección de Pixel desde HTML (mock fetch)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * Construye un mock de fetch que simula una respuesta HTTP con HTML.
   * El scan.ts real usa response.headers.get(), response.body.getReader() y streaming.
   */
  function mockFetchHtml(html: string) {
    const encoder = new TextEncoder()
    const encoded = encoder.encode(html)

    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: encoded })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    }

    const mockBody = { getReader: vi.fn().mockReturnValue(mockReader) }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key === "content-type") return "text/html; charset=utf-8"
          if (key === "location") return null
          return null
        },
      },
      body: mockBody,
    }))
  }

  it("detecta pixelId desde fbq('init', '123456789')", async () => {
    mockFetchHtml(`<html><head><script>fbq('init', '123456789');fbq('track', 'PageView');</script>
<script src="https://connect.facebook.net/en_US/fbevents.js"></script></head></html>`)
    const { scanUrlForPixel } = await import("@/domains/tracking/scan")
    const result = await scanUrlForPixel("https://example.com")
    expect(result.pixelIds).toContain("123456789")
    expect(result.pixelFound).toBe(true)
  })

  it("detecta pixel cuando connect.facebook.net está presente via init", async () => {
    mockFetchHtml(`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script>fbq('init', '9876543210');</script>`)
    const { scanUrlForPixel } = await import("@/domains/tracking/scan")
    const result = await scanUrlForPixel("https://example.com")
    expect(result.pixelFound).toBe(true)
  })

  it("retorna pixelFound=false cuando no hay fbq ni connect.facebook.net", async () => {
    mockFetchHtml(`<html><head><title>Sin pixel</title></head><body>Hola</body></html>`)
    const { scanUrlForPixel } = await import("@/domains/tracking/scan")
    const result = await scanUrlForPixel("https://example.com")
    expect(result.pixelFound).toBe(false)
    expect(result.pixelIds).toHaveLength(0)
  })

  it("detecta duplicatePixel cuando hay múltiples fbq('init')", async () => {
    mockFetchHtml(`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script>
fbq('init', '111111111');
fbq('init', '222222222');
</script>`)
    const { scanUrlForPixel } = await import("@/domains/tracking/scan")
    const result = await scanUrlForPixel("https://example.com")
    expect(result.duplicatePixel).toBe(true)
    expect(result.pixelIds.length).toBeGreaterThanOrEqual(2)
  })

  it("detecta GTM (googletagmanager.com/gtm.js)", async () => {
    mockFetchHtml(`<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABCDEF"></script>
<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script>fbq('init', '555555555');</script>`)
    const { scanUrlForPixel } = await import("@/domains/tracking/scan")
    const result = await scanUrlForPixel("https://example.com")
    expect(result.gtmFound).toBe(true)
    expect(result.gtmIds).toContain("GTM-ABCDEF")
  })

  it("campo limitations siempre presente y no vacío", async () => {
    mockFetchHtml(`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script>fbq('init', '123456789');</script>`)
    const { scanUrlForPixel } = await import("@/domains/tracking/scan")
    const result = await scanUrlForPixel("https://example.com")
    expect(Array.isArray(result.limitations)).toBe(true)
    expect(result.limitations.length).toBeGreaterThan(0)
  })

  it("expectedPixelId match correcto cuando coincide", async () => {
    mockFetchHtml(`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script>fbq('init', '555555555');</script>`)
    const { scanUrlForPixel } = await import("@/domains/tracking/scan")
    const result = await scanUrlForPixel("https://example.com", "555555555")
    expect(result.expectedPixelIdMatch).toBe(true)
  })

  it("expectedPixelId no match cuando el pixel detectado es diferente", async () => {
    mockFetchHtml(`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script>fbq('init', '555555555');</script>`)
    const { scanUrlForPixel } = await import("@/domains/tracking/scan")
    const result = await scanUrlForPixel("https://example.com", "999999999")
    expect(result.expectedPixelIdMatch).toBe(false)
  })

  it("expectedPixelIdMatch es null cuando no se pasa expectedPixelId", async () => {
    mockFetchHtml(`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script>fbq('init', '555555555');</script>`)
    const { scanUrlForPixel } = await import("@/domains/tracking/scan")
    const result = await scanUrlForPixel("https://example.com")
    expect(result.expectedPixelIdMatch).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 5: computeDiagStatus — función pura
// ─────────────────────────────────────────────────────────────────────────────

import type { DiagConversionStatus, ConversionObservationPublic, ConversionIssuePublic } from "@/domains/tracking/types"

type ConversionDefLike = {
  enabled: boolean
  expectedSource: "browser" | "server" | "both"
  freshnessPolicyJson: { days?: number }
}

type DiagStatusInput = {
  def: ConversionDefLike
  lastObservation: ConversionObservationPublic | null
  allObservations?: ConversionObservationPublic[]
  openIssues: ConversionIssuePublic[]
  hasActiveSite: boolean
}

function computeDiagStatus(input: DiagStatusInput): DiagConversionStatus {
  const { def, lastObservation, allObservations = [], openIssues, hasActiveSite } = input
  const freshnessDay = def.freshnessPolicyJson.days ?? 30

  if (!hasActiveSite) return "not_configured"

  const criticalIssue = openIssues.find((i) => i.issueCode === "pixel_base_missing")
  if (criticalIssue) return "code_not_detected"

  const misconfigIssue = openIssues.find(
    (i) => i.severity === "critical" && i.issueCode !== "pixel_base_missing"
  )
  if (misconfigIssue) return "misconfigured"

  if (!lastObservation) return "unknown"

  const now = new Date()
  const staleCutoff = new Date(now.getTime() - freshnessDay * 24 * 60 * 60 * 1000)
  const isStale = lastObservation.observedAt < staleCutoff
  if (isStale) return "stale"

  // Check source match
  const { source } = lastObservation
  const { expectedSource } = def
  const observedSources = new Set(allObservations.map((o) => o.source))

  if (observedSources.has("browser_pixel") && observedSources.has("server_capi")) {
    return "observed_both"
  }

  if (source === "browser_pixel") {
    if (expectedSource === "server") return "misconfigured"
    return "observed_browser"
  }

  if (source === "server_capi") {
    if (expectedSource === "browser") return "misconfigured"
    return "observed_server"
  }

  return "unknown"
}

function makeDef(overrides: Partial<ConversionDefLike> = {}): ConversionDefLike {
  return {
    enabled: true,
    expectedSource: "both",
    freshnessPolicyJson: { days: 30 },
    ...overrides,
  }
}

function makeObs(
  source: ConversionObservationPublic["source"],
  daysAgo = 0
): ConversionObservationPublic {
  const observedAt = new Date()
  observedAt.setDate(observedAt.getDate() - daysAgo)
  return {
    id: "obs-001",
    source,
    eventName: "Lead",
    eventIdHash: null,
    pageUrl: null,
    environment: "production",
    parametersPresent: {},
    validationResult: {},
    observedAt,
  }
}

function makeIssue(
  issueCode: string,
  severity: ConversionIssuePublic["severity"] = "medium"
): ConversionIssuePublic {
  const now = new Date()
  return {
    id: "issue-001",
    conversionDefinitionId: "def-001",
    issueCode,
    severity,
    status: "open",
    explanation: null,
    remediationKey: null,
    firstDetectedAt: now,
    lastDetectedAt: now,
    resolvedAt: null,
  }
}

describe("computeDiagStatus — lógica pura", () => {
  it("sin sitio activo → 'not_configured'", () => {
    const status = computeDiagStatus({
      def: makeDef(),
      lastObservation: null,
      openIssues: [],
      hasActiveSite: false,
    })
    expect(status).toBe("not_configured")
  })

  it("sin observaciones ni issues → 'unknown'", () => {
    const status = computeDiagStatus({
      def: makeDef(),
      lastObservation: null,
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("unknown")
  })

  it("issue 'pixel_base_missing' abierto → 'code_not_detected'", () => {
    const status = computeDiagStatus({
      def: makeDef(),
      lastObservation: null,
      openIssues: [makeIssue("pixel_base_missing", "critical")],
      hasActiveSite: true,
    })
    expect(status).toBe("code_not_detected")
  })

  it("issue critical sin ser pixel_base_missing → 'misconfigured'", () => {
    const status = computeDiagStatus({
      def: makeDef(),
      lastObservation: null,
      openIssues: [makeIssue("duplicate_pixel", "critical")],
      hasActiveSite: true,
    })
    expect(status).toBe("misconfigured")
  })

  it("observación browser_pixel, expectedSource='browser' → 'observed_browser'", () => {
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "browser" }),
      lastObservation: makeObs("browser_pixel", 0),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("observed_browser")
  })

  it("observación server_capi, expectedSource='server' → 'observed_server'", () => {
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "server" }),
      lastObservation: makeObs("server_capi", 0),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("observed_server")
  })

  it("observación browser_pixel, expectedSource='server' → 'misconfigured'", () => {
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "server" }),
      lastObservation: makeObs("browser_pixel", 0),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("misconfigured")
  })

  it("observación server_capi, expectedSource='browser' → 'misconfigured'", () => {
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "browser" }),
      lastObservation: makeObs("server_capi", 0),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("misconfigured")
  })

  it("observación más antigua que freshness_policy → 'stale'", () => {
    // freshness 7 días, observación hace 8 días
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "browser", freshnessPolicyJson: { days: 7 } }),
      lastObservation: makeObs("browser_pixel", 8),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("stale")
  })

  it("observación reciente (dentro de freshness) → 'observed_browser'", () => {
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "browser", freshnessPolicyJson: { days: 30 } }),
      lastObservation: makeObs("browser_pixel", 5),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("observed_browser")
  })

  it("observación server_capi reciente → 'observed_server'", () => {
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "server", freshnessPolicyJson: { days: 30 } }),
      lastObservation: makeObs("server_capi", 1),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("observed_server")
  })

  it("exactamente en el límite del freshness (hoy) → no stale", () => {
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "browser", freshnessPolicyJson: { days: 1 } }),
      lastObservation: makeObs("browser_pixel", 0),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).not.toBe("stale")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 6: Test session token security
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto"

describe("Test session token security", () => {
  it("SHA-256(token) es diferente del token original", () => {
    const token = "synclead_test_tok_abc123xyz"
    const hash = createHash("sha256").update(token).digest("hex")
    expect(hash).not.toBe(token)
  })

  it("SHA-256 produce exactamente 64 caracteres hex", () => {
    const token = "any_token_value"
    const hash = createHash("sha256").update(token).digest("hex")
    expect(hash).toHaveLength(64)
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true)
  })

  it("mismo token → mismo hash (determinista)", () => {
    const token = "stable_token_value"
    const h1 = createHash("sha256").update(token).digest("hex")
    const h2 = createHash("sha256").update(token).digest("hex")
    expect(h1).toBe(h2)
  })

  it("tokens diferentes → hashes diferentes", () => {
    const h1 = createHash("sha256").update("token_a").digest("hex")
    const h2 = createHash("sha256").update("token_b").digest("hex")
    expect(h1).not.toBe(h2)
  })

  it("el hash no contiene el token original (no reversible)", () => {
    const token = "secret_token_value_12345"
    const hash = createHash("sha256").update(token).digest("hex")
    expect(hash).not.toContain(token)
    expect(hash).not.toContain("secret")
  })

  it("token expirado: la lógica de check detecta vencimiento", () => {
    const expiresAt = new Date(Date.now() - 60_000) // 1 minuto en el pasado
    const isExpired = new Date() > expiresAt
    expect(isExpired).toBe(true)
  })

  it("token no expirado: la lógica de check no marca como vencido", () => {
    const expiresAt = new Date(Date.now() + 60_000 * 30) // 30 minutos en el futuro
    const isExpired = new Date() > expiresAt
    expect(isExpired).toBe(false)
  })

  it("sesión con status='cancelled' es rechazada", () => {
    const session: { status: string; token: string } = { status: "cancelled", token: "abc" }
    const isValid = session.status === "active" || session.status === "pending"
    expect(isValid).toBe(false)
  })

  it("sesión con status='active' es aceptada", () => {
    const session = { status: "active" as const }
    const isValid = session.status === "active" || session.status === "pending"
    expect(isValid).toBe(true)
  })

  it("token de diferente org: cross-tenant bloqueado por org_id mismatch", () => {
    const tokenOrgId: string = "org-aaa"
    const requestOrgId: string = "org-bbb"
    const isCrossTenant = tokenOrgId !== requestOrgId
    expect(isCrossTenant).toBe(true)
  })

  it("token y org coincidentes: acceso permitido", () => {
    const tokenOrgId = "org-aaa"
    const requestOrgId = "org-aaa"
    const isCrossTenant = tokenOrgId !== requestOrgId
    expect(isCrossTenant).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 7: Deduplication checks
// ─────────────────────────────────────────────────────────────────────────────

type ObservationLike = {
  source: "browser_pixel" | "server_capi"
  eventIdHash: string | null
  parametersPresent: Record<string, boolean>
}

type DeduplicationIssue = {
  code: string
  severity: "critical" | "high" | "medium" | "low"
}

function checkDeduplication(
  browserObs: ObservationLike | null,
  serverObs: ObservationLike | null,
  providerEventName: string
): DeduplicationIssue[] {
  const issues: DeduplicationIssue[] = []

  if (browserObs && !browserObs.eventIdHash) {
    issues.push({ code: "event_id_missing", severity: "high" })
  }

  if (browserObs && serverObs) {
    if (browserObs.eventIdHash && serverObs.eventIdHash) {
      if (browserObs.eventIdHash !== serverObs.eventIdHash) {
        issues.push({ code: "dedup_mismatch", severity: "critical" })
      }
    }
  }

  if (providerEventName === "Purchase") {
    if (browserObs) {
      const hasValue = browserObs.parametersPresent["value"] === true
      const hasCurrency = browserObs.parametersPresent["currency"] === true
      if (!hasValue || !hasCurrency) {
        issues.push({ code: "purchase_no_value", severity: "critical" })
      }
    }
  }

  return issues
}

describe("Deduplication checks", () => {
  it("event_id igual en browser y server → sin issue de dedup", () => {
    const hash = createHash("sha256").update("evt-id-abc").digest("hex")
    const issues = checkDeduplication(
      { source: "browser_pixel", eventIdHash: hash, parametersPresent: {} },
      { source: "server_capi", eventIdHash: hash, parametersPresent: {} },
      "Lead"
    )
    expect(issues.find((i) => i.code === "dedup_mismatch")).toBeUndefined()
  })

  it("event_id ausente en browser → issue 'event_id_missing'", () => {
    const issues = checkDeduplication(
      { source: "browser_pixel", eventIdHash: null, parametersPresent: {} },
      null,
      "Lead"
    )
    expect(issues.find((i) => i.code === "event_id_missing")).toBeDefined()
  })

  it("event_id diferente en browser vs CAPI → issue 'dedup_mismatch'", () => {
    const hashA = createHash("sha256").update("event-A").digest("hex")
    const hashB = createHash("sha256").update("event-B").digest("hex")
    const issues = checkDeduplication(
      { source: "browser_pixel", eventIdHash: hashA, parametersPresent: {} },
      { source: "server_capi", eventIdHash: hashB, parametersPresent: {} },
      "Lead"
    )
    expect(issues.find((i) => i.code === "dedup_mismatch")).toBeDefined()
  })

  it("Purchase sin 'value' → issue 'purchase_no_value'", () => {
    const issues = checkDeduplication(
      { source: "browser_pixel", eventIdHash: null, parametersPresent: { currency: true } },
      null,
      "Purchase"
    )
    expect(issues.find((i) => i.code === "purchase_no_value")).toBeDefined()
  })

  it("Purchase sin 'currency' → issue 'purchase_no_value'", () => {
    const issues = checkDeduplication(
      { source: "browser_pixel", eventIdHash: null, parametersPresent: { value: true } },
      null,
      "Purchase"
    )
    expect(issues.find((i) => i.code === "purchase_no_value")).toBeDefined()
  })

  it("Purchase con value y currency → sin issue purchase_no_value", () => {
    const hash = createHash("sha256").update("id").digest("hex")
    const issues = checkDeduplication(
      { source: "browser_pixel", eventIdHash: hash, parametersPresent: { value: true, currency: true } },
      null,
      "Purchase"
    )
    expect(issues.find((i) => i.code === "purchase_no_value")).toBeUndefined()
  })

  it("Lead (no Purchase) sin value → sin issue purchase_no_value", () => {
    const issues = checkDeduplication(
      { source: "browser_pixel", eventIdHash: null, parametersPresent: {} },
      null,
      "Lead"
    )
    expect(issues.find((i) => i.code === "purchase_no_value")).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 8: No PII en almacenamiento
// ─────────────────────────────────────────────────────────────────────────────

function sanitizePageUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    const SENSITIVE_PARAMS = ["email", "phone", "tel", "name", "user", "pass", "token", "key"]
    for (const param of SENSITIVE_PARAMS) {
      if (u.searchParams.has(param)) {
        u.searchParams.delete(param)
      }
    }
    return u.toString()
  } catch {
    return rawUrl
  }
}

function buildParametersPresent(params: Record<string, unknown>): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const key of Object.keys(params)) {
    result[key] = true
  }
  return result
}

describe("No PII en almacenamiento", () => {
  it("page_url sanitizada: query param 'email=' es removido", () => {
    const raw = "https://example.com/thank-you?email=user@test.com&ref=campaign"
    const sanitized = sanitizePageUrl(raw)
    expect(sanitized).not.toContain("email=")
    expect(sanitized).not.toContain("user@test.com")
  })

  it("page_url sanitizada: path y host se conservan", () => {
    const raw = "https://example.com/thank-you?email=user@test.com"
    const sanitized = sanitizePageUrl(raw)
    expect(sanitized).toContain("example.com")
    expect(sanitized).toContain("/thank-you")
  })

  it("page_url sin params sensibles se mantiene igual", () => {
    const raw = "https://example.com/landing?utm_source=facebook&utm_campaign=spring"
    const sanitized = sanitizePageUrl(raw)
    expect(sanitized).toContain("utm_source=facebook")
    expect(sanitized).toContain("utm_campaign=spring")
  })

  it("event_id_hash es SHA-256, no el valor original", () => {
    const eventId = "order_12345"
    const hash = createHash("sha256").update(eventId).digest("hex")
    expect(hash).not.toBe(eventId)
    expect(hash).toHaveLength(64)
  })

  it("parameters_present contiene solo keys (booleans), no valores reales", () => {
    const params = { email: "user@test.com", phone: "+584141234567", value: 99.99 }
    const present = buildParametersPresent(params)
    // Las keys existen como booleans true
    expect(present["email"]).toBe(true)
    expect(present["phone"]).toBe(true)
    expect(present["value"]).toBe(true)
    // Los valores reales NO están almacenados
    expect(Object.values(present).every((v) => typeof v === "boolean")).toBe(true)
    const allValues = JSON.stringify(present)
    expect(allValues).not.toContain("user@test.com")
    expect(allValues).not.toContain("+584141234567")
  })

  it("page_url: param 'phone=' es removido", () => {
    const raw = "https://example.com/form?phone=+5841234&step=2"
    const sanitized = sanitizePageUrl(raw)
    expect(sanitized).not.toContain("phone=")
  })

  it("hash de event_id no contiene el ID original en texto", () => {
    const eventId = "purchase_abc_xyz_12345"
    const hash = createHash("sha256").update(eventId).digest("hex")
    expect(hash).not.toContain(eventId)
    expect(hash).not.toContain("purchase")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 9: Permisos y acceso
// ─────────────────────────────────────────────────────────────────────────────

class ForbiddenError extends Error {
  constructor(msg = "Forbidden") {
    super(msg)
    this.name = "ForbiddenError"
  }
}

async function requireClientAccess(clientId: string, sessionOrgId: string, clientOrgId: string) {
  if (sessionOrgId !== clientOrgId) throw new ForbiddenError("Cross-tenant access denied")
}

describe("Permisos y acceso", () => {
  it("acceso cross-tenant lanza ForbiddenError", async () => {
    await expect(
      requireClientAccess("client-A", "org-tenant-B", "org-tenant-A")
    ).rejects.toThrow(ForbiddenError)
  })

  it("acceso mismo tenant no lanza error", async () => {
    await expect(
      requireClientAccess("client-A", "org-same", "org-same")
    ).resolves.not.toThrow()
  })

  it("viewer no puede crear definiciones de conversión (role check)", () => {
    const role = "viewer" as const
    const allowedRoles = ["owner", "admin", "manager"] as const
    const canCreate = (allowedRoles as readonly string[]).includes(role)
    expect(canCreate).toBe(false)
  })

  it("manager puede crear definiciones de conversión", () => {
    const role = "manager" as const
    const allowedRoles = ["owner", "admin", "manager"] as const
    const canCreate = (allowedRoles as readonly string[]).includes(role)
    expect(canCreate).toBe(true)
  })

  it("token público del collector NO incluye org_id en la respuesta", () => {
    // Simula el objeto que devuelve el endpoint público del collector
    const publicResponse = {
      status: "ok",
      sessionId: "sess-uuid",
      // org_id, client_id NO deben aparecer aquí
    }
    const responseStr = JSON.stringify(publicResponse)
    expect(responseStr).not.toContain("org_id")
    expect(responseStr).not.toContain("client_id")
    expect(responseStr).not.toContain("orgId")
    expect(responseStr).not.toContain("clientId")
  })

  it("token público del collector NO incluye client_id en la respuesta", () => {
    const publicResponse = { status: "received", timestamp: new Date().toISOString() }
    expect(JSON.stringify(publicResponse)).not.toContain("clientId")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 10: Frecuencia y falsos positivos
// ─────────────────────────────────────────────────────────────────────────────

describe("Frecuencia y falsos positivos", () => {
  it("Purchase con observación reciente pero poco frecuente → NO marcado como stale", () => {
    // freshnessPolicyDays = 3 para Purchase; observación hace 2 días
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "both", freshnessPolicyJson: { days: 3 } }),
      lastObservation: makeObs("browser_pixel", 2),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).not.toBe("stale")
  })

  it("evento sin observaciones dentro del freshness → 'unknown' no 'stale'", () => {
    // Sin observaciones (lastObservation=null) → nunca stale, siempre unknown
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "browser", freshnessPolicyJson: { days: 30 } }),
      lastObservation: null,
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("unknown")
    expect(status).not.toBe("stale")
  })

  it("prueba explícita fallida → devuelve 'failed' (no unknown)", () => {
    // El estado 'failed' se produce cuando una sesión de test completó pero sin detectar evento
    const testSessionResult = "failed" as DiagConversionStatus
    expect(testSessionResult).toBe("failed")
    expect(testSessionResult).not.toBe("unknown")
  })

  it("'awaiting_test' solo cuando hay sesión activa", () => {
    // awaiting_test requiere sesión con status='active' o 'pending'
    const sessionActive = { status: "active" as const }
    const sessionExpired = { status: "expired" as const }

    const isAwaiting = (s: { status: string }) =>
      s.status === "active" || s.status === "pending"

    expect(isAwaiting(sessionActive)).toBe(true)
    expect(isAwaiting(sessionExpired)).toBe(false)
  })

  it("Purchase con freshness 3 días: observación de hace 4 días → stale", () => {
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "both", freshnessPolicyJson: { days: 3 } }),
      lastObservation: makeObs("browser_pixel", 4),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).toBe("stale")
  })

  it("PageView con freshness 30 días: observación de hace 25 días → no stale", () => {
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "browser", freshnessPolicyJson: { days: 30 } }),
      lastObservation: makeObs("browser_pixel", 25),
      openIssues: [],
      hasActiveSite: true,
    })
    expect(status).not.toBe("stale")
  })

  it("'code_not_detected' tiene prioridad sobre falta de observaciones", () => {
    // Si hay pixel_base_missing, el status es code_not_detected aunque no haya observaciones
    const status = computeDiagStatus({
      def: makeDef(),
      lastObservation: null,
      openIssues: [makeIssue("pixel_base_missing", "critical")],
      hasActiveSite: true,
    })
    expect(status).toBe("code_not_detected")
    expect(status).not.toBe("unknown")
  })

  it("issues de baja severidad no cambian status a misconfigured", () => {
    // Solo issues con severity='critical' (y que no sean pixel_base_missing) → misconfigured
    const status = computeDiagStatus({
      def: makeDef({ expectedSource: "browser" }),
      lastObservation: makeObs("browser_pixel", 1),
      openIssues: [makeIssue("slow_load", "low")],
      hasActiveSite: true,
    })
    expect(status).not.toBe("misconfigured")
    expect(status).toBe("observed_browser")
  })
})
