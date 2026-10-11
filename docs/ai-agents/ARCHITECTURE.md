# AI WhatsApp Agents — Architecture

> Fase 00 completada: inspección real del repositorio.
> Este documento refleja decisiones verificadas con código existente; nada es supuesto.

---

## 1. Estado del repositorio relevante

### 1.1 Auth, tenants y roles

| Mecanismo | Archivo | Estado |
|-----------|---------|--------|
| JWT session (Auth.js v5) | `src/auth.ts` | ✅ Activo |
| `requireOrganizationMembership()` | `src/lib/auth/server.ts` | ✅ Activo |
| `requireRole(roles[])` | `src/lib/auth/server.ts` | ✅ Activo |
| `requireClientAccess(clientId)` | `src/lib/auth/server.ts` | ✅ Activo |
| `requireCampaignAccess(campaignId)` | `src/lib/auth/server.ts` | ✅ Activo |

**Regla de oro verificada**: `orgId` siempre se resuelve desde `org_members` en DB, nunca del body ni de query params. El módulo AI debe seguir el mismo patrón — en rutas webhook el tenant se resuelve desde `wa_business_accounts.org_id` via `phone_number_id`.

Roles existentes (enum `member_role`): `owner > admin > manager > agent > viewer`

### 1.2 Infraestructura de DB y cola

| Componente | Detalle | Estado |
|-----------|---------|--------|
| Neon Postgres (neon-http) | PgBouncer transaction mode; `src/lib/db/index.ts` | ✅ Activo |
| Drizzle ORM | `drizzle-orm ^0.45.2`; schema centralizado en `src/lib/db/schema.ts` | ✅ Activo |
| Aislamiento multi-tenant | `WHERE org_id = ?` en todas las queries; sin RLS | ✅ Activo |
| Outbox DB (meta_events) | Tabla + cron cada 10 min; `withJobRun()` wrapper | ✅ Activo |
| Cron Vercel | 6 rutas en `src/app/api/cron/`; `Bearer CRON_SECRET`; `maxDuration=60` | ✅ Activo |
| Vercel Queues | Durable streaming, beta pública (2025) | ❌ No integrado |
| Redis/Upstash | Solo rate limiting; opcional (`getRedis() → null` si no está) | ✅ Opcional |

### 1.3 Cifrado

`src/lib/crypto.ts` (`import "server-only"`):
- `encryptTokenVersioned(plain): { ciphertext: string; keyVersion: number }` — síncrono, AES-256-GCM
- `decryptTokenVersioned(ciphertext): string`
- Formato en DB: ciphertext = `v{n}:iv:tag:data`; `key_version` en columna separada

### 1.4 IWhatsAppProvider y mensajería existente

```
src/domains/whatsapp/
  types.ts        ← IWhatsAppProvider interface (DEFINE, no implementa)
  repository.ts   ← wa.me link generation + provider webhook processing
  actions.ts      ← prepareWaLinkAction, confirmWaSentAction, handleProviderWebhookAction
```

**Importante**: `IWhatsAppProvider` existe como interfaz (sendMessage, parseWebhook, verifySignature, normalizeStatus) pero **no hay ninguna implementación concreta**. El sistema actual es link-based (wa.me URLs + confirmación manual). Las tablas `wa_messages` / `wa_provider_events` son para ese flujo, **no para conversaciones bidireccionales**.

El módulo AI usa Meta Cloud API directamente (nuevo dominio `src/domains/wa-cloud/`), sin depender de `IWhatsAppProvider`.

### 1.5 Leads y CRM

Reutilizable directamente desde el módulo AI:

| Función | Archivo | Uso en AI |
|---------|---------|-----------|
| `autoQualifyLeadInternal(leadId)` | `src/domains/qualification/actions.ts` | Tool: qualify_lead |
| `createLeadManuallyAction(campaignId, input)` | `src/domains/leads/actions.ts` | Tool: create_lead |
| `updateLeadInfoAction(leadId, input)` | `src/domains/leads/actions.ts` | Tool: update_lead |
| `db.insert(leadNotes)` | directo via repository | Tool: create_note |
| `db.insert(leadActivities)` | patrón existente | Auditoría eventos AI |
| `db.insert(leadAssignments)` | patrón existente | Tool: assign_lead |

---

## 2. Módulos propuestos

```
src/
  domains/
    wa-cloud/            ← Conexión Meta Cloud API (NUEVO)
      types.ts           ← Schemas Zod para payload webhook Meta
      client.ts          ← CloudApiClient: sendText, sendTemplate, sendMedia
      webhook.ts         ← verifyHmac(), parseIncomingMessage()
      repository.ts      ← CRUD wa_business_accounts, wa_phone_numbers
      actions.ts         ← Server Actions: conectar WABA, registrar número

    ai-agents/           ← Ya creado (Phase 01)
      types.ts           ← Input schemas, status enums
      repository.ts      ← CRUD 7 tablas Phase 01

    ai-engine/           ← Motor de conversación (NUEVO, Phase 03)
      types.ts           ← ILLMProvider, LLMMessage, LLMResponse, LLMTool
      providers/
        anthropic.ts     ← AnthropicProvider implements ILLMProvider
        openai.ts        ← OpenAIProvider implements ILLMProvider
        google.ts        ← GoogleProvider implements ILLMProvider
        registry.ts      ← selectProvider(model: string) → ILLMProvider
      episode.ts         ← runEpisode(): orquestación del loop AI
      context-builder.ts ← buildConversationContext(): history + lead info
      message-queue.ts   ← AI message outbox (ai_message_queue table)

    ai-tools/            ← CRM tools disponibles para agentes (NUEVO, Phase 05)
      registry.ts        ← AiToolRegistry: name → { schema, execute }
      tool-context.ts    ← AiToolContext: { orgId, conversationId, leadId }
      tools/
        qualify-lead.ts
        create-note.ts
        create-lead.ts
        update-lead.ts
        assign-lead.ts
        get-lead-info.ts
        send-template.ts

    ai-knowledge/        ← RAG / base de conocimiento (FUTURO, Phase 07)
      types.ts
      repository.ts
      embedding.ts

    ai-inbox/            ← Bandeja humana (NUEVO, Phase 04)
      repository.ts      ← getInboxConversations, markHandoff
      actions.ts         ← takeoverAction, releaseAction, sendHumanMessageAction

  app/
    dashboard/
      ai-agents/         ← UI gestión de agentes (Phase 06)
        page.tsx
        [id]/
          page.tsx
      inbox/             ← Bandeja humana (Phase 04)
        page.tsx
        _components/

    api/
      webhook/
        wa-cloud/
          [wabaId]/
            route.ts     ← GET: hub verification; POST: HMAC + dispatch (Phase 02)
      cron/
        ai-message-queue/
          route.ts       ← Procesa ai_message_queue pendientes (Phase 03)
```

---

## 3. Proveedor LLM multi-modelo

### Interface `ILLMProvider`

```typescript
// src/domains/ai-engine/types.ts
interface ILLMProvider {
  readonly name: "anthropic" | "openai" | "google"
  complete(params: LLMCompleteParams): Promise<LLMResponse>
}

interface LLMCompleteParams {
  model: string          // e.g., "claude-sonnet-4-6"
  systemPrompt: string
  messages: LLMMessage[]
  tools?: LLMToolDef[]
  maxTokens: number
  temperature: number    // 0.0–1.0
}

interface LLMMessage {
  role: "user" | "assistant"
  content: string
  // Para resultados de herramientas el content se serializa como texto
}

interface LLMResponse {
  content: string | null
  toolCalls: LLMToolCall[] | null
  inputTokens: number
  outputTokens: number
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "error"
  rawResponse?: unknown  // Para logging interno, nunca expuesto al cliente
}

interface LLMToolCall {
  callId: string
  toolName: string
  input: Record<string, unknown>
}
```

### Convención de modelo en `ai_agents.model`

Formato `provider/model-name`:

| Valor en DB | Proveedor | Variable de entorno |
|-------------|-----------|---------------------|
| `anthropic/claude-sonnet-4-6` | Anthropic | `ANTHROPIC_API_KEY` |
| `anthropic/claude-haiku-4-5-20251001` | Anthropic | `ANTHROPIC_API_KEY` |
| `openai/gpt-4o` | OpenAI | `OPENAI_API_KEY` |
| `openai/gpt-4o-mini` | OpenAI | `OPENAI_API_KEY` |
| `google/gemini-2.0-flash` | Google | `GOOGLE_AI_API_KEY` |
| `google/gemini-1.5-pro` | Google | `GOOGLE_AI_API_KEY` |

`registry.ts` selecciona el provider según el prefijo: `model.split("/")[0]`.

### SDKs a instalar (Phase 03)

```bash
npm install @anthropic-ai/sdk openai @google/generative-ai
```

Todos se importan solo en `src/domains/ai-engine/providers/` (server-side). Nunca en bundles del cliente.

---

## 4. Estrategia de cola

### Problema

El webhook de Meta Cloud API debe responder con `200 OK` en < 5 segundos. El ciclo completo AI (contextualización + LLM + herramientas + envío) puede tardar 5–30 segundos.

### Comparación

| Criterio | Opción A: DB Outbox (same as meta_events) | Opción B: Vercel Queues |
|---------|------------------------------------------|------------------------|
| **Infraestructura** | Ya existe (Neon + cron) | Beta pública; nuevo servicio |
| **Latencia** | 0–60 segundos (próximo tick de cron) | Segundos (event-driven) |
| **Reintentos** | Configurable (mismo patrón que meta_events) | At-least-once built-in |
| **Orden** | Por claim_at; no garantizado estricto | Por defecto FIFO por sujeto |
| **Operación** | Simple; un solo punto de fallo (cron) | Más complejo; beta = riesgos |
| **Coste** | Solo compute de cron (ya pagado) | Adicional por invocación y mensaje |
| **Sustitución** | Contrato limpio via `IMessageQueue` | Mismo contrato |

### Recomendación: Opción A (DB Outbox) con disparo inmediato

**Razón**: El patrón ya está probado en producción con meta_events. Vercel Queues es beta pública y añade dependencia externa no crítica para el piloto.

**Mejora de latencia**: El webhook dispara un intento inmediato fire-and-forget (similar a `sendMetaEventDirect` en conversions). Si falla o supera 4s, el item queda en `ai_message_queue` para el cron. Esto da respuesta en segundos en el happy path.

```
Webhook POST → acknowledge 200
             → fire-and-forget: processAiMessage(messageId) [< 4s]
               ✓ ok → message sent, queue item marked complete
               ✗ timeout → cron picks it up in ≤ 60s
```

### Contrato `IMessageQueue` (sustituible)

```typescript
// src/domains/ai-engine/message-queue.ts
interface IMessageQueue {
  enqueue(item: AiMessageQueueItem): Promise<void>
  claim(batchSize: number): Promise<AiMessageQueueItem[]>
  complete(id: string): Promise<void>
  fail(id: string, error: string, retryAt?: Date): Promise<void>
}
```

La implementación de Phase 03 será `DbMessageQueue` (tabla `ai_message_queue`). Se puede cambiar a `VercelQueues` sin modificar `episode.ts`.

---

## 5. Máquinas de estado

### 5.1 Conversación (`wa_conversations.status`)

```
         nuevo mensaje entrante
              │
              ▼
         ┌─────────┐
         │  active  │ ◄──────────────────────────────┐
         └────┬────┘                                  │
              │                                       │
    handoff_triggered       handoff_released          │
              │                                       │
              ▼                                       │
    ┌──────────────────┐                             │
    │  human_takeover  │──────────────────────────────┘
    └────────┬─────────┘
             │ closed (resuelto por humano o AI)
             ▼
         ┌────────┐
         │ closed │
         └────────┘
```

Transiciones:
- `active → human_takeover`: usuario toma control (`takeoverAction`)
- `human_takeover → active`: usuario libera (`releaseAction`)
- `active → closed`: AI detecta cierre o usuario cierra
- `human_takeover → closed`: humano cierra

### 5.2 Episodio AI (`ai_episodes.status`)

```
  conversación activa + mensaje entrante
              │
              ▼
         ┌──────────┐
         │  active  │ ← LLM procesando o esperando respuesta
         └────┬─────┘
              │
      ┌───────┼───────────┐
      │       │           │
      ▼       ▼           ▼
  ┌──────┐ ┌─────────┐ ┌───────────┐
  │ended │ │handed_  │ │  failed   │
  │      │ │ off     │ │           │
  └──────┘ └─────────┘ └───────────┘
```

### 5.3 Mensaje de cola (`ai_message_queue.status`)

```
enqueued → processing → done
              │
              └─► failed → (retry) → processing
                             │
                             └─► dead_letter (max_attempts reached)
```

### 5.4 Mensaje individual (`wa_conversation_messages.status`)

```
(outbound)  pending → sent → delivered → read
                  └─► failed

(inbound)   received (siempre inmediato)
```

---

## 6. Relación contacto + número + tenant

```
organizations (tenant)
  └── wa_business_accounts  (una WABA por org; access_token_enc server-only)
        └── wa_phone_numbers  (un número por phone_number_id de Meta)
              └── ai_agent_deployments  (agente activo para ese número)
                    └── ai_agents (config reutilizable)
              └── wa_conversations  (una por customer_phone; UNIQUE (org, phone_number, customer))
                    └── ai_episodes  (episodio acotado; snapshot inmutable del agente)
                    └── wa_conversation_messages
                    └── wa_agent_events

leads (existente)
  └── wa_conversations.lead_id (nullable FK; se vincula cuando se identifica el lead)
```

**Aislamiento**: el campo `org_id` en `wa_business_accounts` determina el tenant. El webhook resuelve `org_id` desde `wa_phone_numbers.org_id` → siempre del lado servidor, nunca del payload de Meta.

**Contacto único**: si el mismo número de cliente escribe desde dos números nuestros de la misma org, son dos conversaciones separadas. Esto es correcto — el contexto de atención es por número receptor.

---

## 7. Roles y permisos

Reutilizando los roles existentes de SyncLead:

| Acción | owner | admin | manager | agent | viewer |
|--------|:-----:|:-----:|:-------:|:-----:|:------:|
| Conectar WABA / número | ✅ | ✅ | ❌ | ❌ | ❌ |
| Crear / editar agente | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publicar agente (snapshot) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Activar deployment | ✅ | ✅ | ❌ | ❌ | ❌ |
| Atender inbox (tomar/liberar) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Enviar mensajes como humano | ✅ | ✅ | ✅ | ✅ | ❌ |
| Ver conversaciones | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver analytics consumo | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ver analytics conversaciones | ✅ | ✅ | ✅ | ✅ | ✅ |

Implementado via `requireRole()` existente en Server Actions. No se añaden roles nuevos.

---

## 8. Seguridad — contratos no negociables

Verificados contra el código existente y heredados al nuevo módulo:

1. **Tenant por identidad**: `org_id` siempre de sesión autenticada o de `wa_business_accounts` vía `phone_number_id` en webhook. Nunca del body de Meta ni del modelo LLM.

2. **Secretos server-only**:
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` → solo en Server Actions y rutas API
   - `wa_business_accounts.access_token_enc` → cifrado AES-256-GCM; `decryptTokenVersioned()` solo al momento de llamar la API
   - Ningún secret en `NEXT_PUBLIC_*`, props de cliente, logs ni respuestas API

3. **AI tools → domain services únicamente**: `execute()` de cada tool llama funciones de dominio existentes con `orgId` propio del contexto. Nunca SQL directo, nunca URLs arbitrarias del modelo.

4. **Validación de entrada**: payload de webhook de Meta validado con Zod + HMAC-SHA256 antes de cualquier procesamiento. Si la firma no coincide → `403`, sin procesamiento.

5. **Sin PII en logs**: mismo patrón de `redactForLog()` / `safeErrorSummary()` de `src/lib/redact.ts`.

6. **Migraciones aditivas**: las tablas de Phase 02+ usan `IF NOT EXISTS`. Sin DROP TABLE, DROP COLUMN ni ADD UNIQUE en tabla con datos sin mitigación.

---

## 9. Límites del piloto y dependencias externas

### Para activar Meta Cloud API
- Cuenta de Meta Business verificada
- WABA aprobado (puede tardar 1–3 días)
- Número de teléfono verificado y registrado en Meta
- App de Meta en modo Live (no Development)
- URL pública del webhook (Vercel preview URL sirve para desarrollo)
- Variables: `WA_CLOUD_API_VERSION=v19.0` (Phase 02)

### Para activar LLM
- Anthropic: `ANTHROPIC_API_KEY` — disponible inmediatamente en console.anthropic.com
- OpenAI: `OPENAI_API_KEY` — disponible en platform.openai.com
- Google: `GOOGLE_AI_API_KEY` — disponible en ai.google.dev / Google Cloud

### Rate limits clave
- Meta Cloud API: 1000 msg/sec por WABA (más que suficiente para piloto)
- Anthropic claude-sonnet-4-6: 50 RPM / 40K TPM (tier 1); escala con uso
- OpenAI gpt-4o: 3 RPM / 200K TPM (tier free); 3500 RPM en tier 1
- Vercel función cron: `maxDuration=60`, mínimo cada 60s en Hobby, cada minuto en Pro

### Limitaciones de neon-http
- Sin transacciones interactivas (PgBouncer transaction mode)
- Operaciones no-fatales con `.catch(() => undefined)` cuando corresponde
- El outbox de AI usa el mismo patrón: claim atómico con UPDATE subquery

---

## 10. Qué reutilizar, extender y crear

### Reutilizar sin cambios
- `src/lib/auth/server.ts` — toda la capa de auth
- `src/lib/crypto.ts` — cifrado de tokens
- `src/lib/audit.ts` — writeAuditLog
- `src/lib/redact.ts` — sanitización de logs
- `src/lib/jobs/runner.ts` — withJobRun para crons
- `src/domains/leads/*` — todos los repositorios y acciones de leads
- `src/domains/qualification/*` — motor de calificación
- `src/domains/team/*` — sales reps y asignaciones
- `src/domains/whatsapp/repository.ts` — templates existentes (reutilizables para respuestas AI)
- `src/components/app/*` — design system ops-*

### Extender
- `src/lib/db/schema.ts` — Phase 02: `ai_episodes`, `ai_message_queue`; Phase 04+: otras tablas
- `src/lib/jobs/registry.ts` — añadir `ai-message-queue` job
- `src/app/dashboard/layout.tsx` y `DashboardNav.tsx` — añadir "Agentes AI" e "Inbox" al nav
- `src/domains/leads/repository.ts` — añadir `getLeadByPhoneForOrg()` para auto-match

### Crear (sin duplicar)
- `src/domains/wa-cloud/` — cliente Meta Cloud API (no duplica wa_messages ni IWhatsAppProvider)
- `src/domains/ai-engine/` — motor LLM multi-proveedor
- `src/domains/ai-tools/` — herramientas CRM para el agente
- `src/domains/ai-inbox/` — bandeja humana
- `src/app/dashboard/ai-agents/` — UI configuración
- `src/app/dashboard/inbox/` — UI bandeja
- `src/app/api/webhook/wa-cloud/[wabaId]/route.ts` — endpoint webhook
- `src/app/api/cron/ai-message-queue/route.ts` — procesador de cola
