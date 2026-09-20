/**
 * MODO B — Servidor a Servidor (Node.js)
 * =======================================
 * Credencial: SERVER SECRET (slk_xxx...)
 * Endpoint:   POST /api/ingest/server
 * Header:     Authorization: Bearer <server_secret>
 *
 * ⚠️  NUNCA incluyas esta credencial en código de navegador (HTML/JS del cliente).
 *     Guárdala en variables de entorno del servidor.
 *
 * La API key se almacena SOLO como hash SHA-256 en la DB.
 * Si sospechas que fue comprometida: rota en el dashboard, el antiguo deja de funcionar.
 */

const API_KEY = process.env.SYNCLEAD_API_KEY!        // slk_... desde variable de entorno
const INGEST_URL = "https://app.tudominio.com/api/ingest/server"

interface IngestPayload {
  name: string
  email?: string | null
  phone?: string | null
  city?: string
  negocio?: boolean
  event_id?: string       // UUID único por lead — habilita idempotencia
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  fbclid?: string | null
  fbc?: string | null
  fbp?: string | null
  meta_campaign_id?: string | null
  meta_adset_id?: string | null
  meta_ad_id?: string | null
  meta_campaign_name?: string | null
  meta_adset_name?: string | null
  meta_ad_name?: string | null
  landing_url?: string | null
  referrer_url?: string | null
  platform?: string | null
  device?: string | null
}

async function ingestLead(lead: IngestPayload): Promise<void> {
  // Genera event_id si no se proporciona — garantiza idempotencia en reenvíos
  const payload: IngestPayload = {
    ...lead,
    event_id: lead.event_id ?? crypto.randomUUID(),
  }

  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,      // ← Credencial de servidor
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok && res.status !== 200) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Ingest failed: ${res.status} — correlationId: ${body.correlationId}`)
  }

  const data = await res.json()
  if (data.duplicate) {
    console.log("Lead duplicado (event_id ya procesado):", payload.event_id)
  } else {
    console.log("Lead creado:", data.leadId)
  }
}

export {} // mark as ESM module

// ─── Ejemplo de uso ───────────────────────────────────────────────────────────

await ingestLead({
  name: "Carlos García",
  email: "carlos@empresa.com",
  phone: "+584121234567",
  city: "Caracas",
  negocio: true,
  utm_source: "facebook",
  utm_medium: "paid",
  utm_campaign: "agosto-2026",
  meta_campaign_name: "Campaña Agosto 2026",
  landing_url: "https://mitienda.com/oferta",
})
