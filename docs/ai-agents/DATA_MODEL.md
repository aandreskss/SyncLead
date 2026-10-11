# AI WhatsApp Agents — Data Model

> Documento generado tras inspección real del repositorio (Fase 00 completa).
> Refleja tablas existentes en `src/lib/db/schema.ts` y migración `drizzle/0015_ai_agents_foundation.sql`.

---

## 1. Diagrama entidad-relación

```
organizations (existente)
│  id uuid PK
│  name text
│
├── wa_business_accounts  [FASE 01]
│   │  id uuid PK
│   │  org_id → organizations
│   │  waba_id text (UNIQUE por org)
│   │  display_name text
│   │  access_token_enc text          ← AES-256-GCM, server-only
│   │  key_version integer
│   │  status text
│   │  webhook_verify_token text
│   │
│   └── wa_phone_numbers  [FASE 01]
│       │  id uuid PK
│       │  org_id → organizations
│       │  waba_account_id → wa_business_accounts
│       │  phone_number_id text (UNIQUE por org)
│       │  display_phone_number text
│       │  verified_name text
│       │  quality_rating text
│       │  status text
│       │
│       ├── ai_agent_deployments  [FASE 01]
│       │   │  id uuid PK
│       │   │  org_id → organizations
│       │   │  agent_id → ai_agents
│       │   │  phone_number_id → wa_phone_numbers (UNIQUE por org)
│       │   │  active boolean
│       │   │
│       │   └── (referenciado por wa_conversations.deployment_id)
│       │
│       └── wa_conversations  [FASE 01]
│           │  id uuid PK
│           │  org_id → organizations
│           │  phone_number_id → wa_phone_numbers
│           │  customer_phone text  (UNIQUE: org+phone_number+customer_phone)
│           │  customer_name text
│           │  lead_id → leads (nullable SET NULL)
│           │  deployment_id → ai_agent_deployments (nullable SET NULL)
│           │  status text
│           │  assigned_to → "user" (nullable SET NULL)
│           │  last_message_at timestamptz
│           │
│           ├── wa_conversation_messages  [FASE 01]
│           │      id uuid PK
│           │      org_id → organizations
│           │      conversation_id → wa_conversations
│           │      direction text
│           │      role text
│           │      content text
│           │      content_type text
│           │      media_url text
│           │      external_message_id text (UNIQUE WHERE NOT NULL)
│           │      status text
│           │      token_count integer
│           │      is_ai boolean
│           │
│           ├── wa_agent_events  [FASE 01]
│           │      id uuid PK
│           │      org_id → organizations
│           │      conversation_id → wa_conversations
│           │      event_type text
│           │      payload jsonb
│           │
│           ├── ai_episodes  [FASE 02 — pendiente]
│           │      id uuid PK
│           │      org_id → organizations
│           │      conversation_id → wa_conversations
│           │      agent_id → ai_agents
│           │      agent_snapshot jsonb    ← copia inmutable de la config al inicio
│           │      trigger_message_id → wa_conversation_messages
│           │      status text
│           │      started_at timestamptz
│           │      ended_at timestamptz
│           │      token_count_in integer
│           │      token_count_out integer
│           │      handoff_reason text
│           │
│           └── ai_message_queue  [FASE 02 — pendiente]
│                  id uuid PK
│                  org_id → organizations
│                  conversation_id → wa_conversations
│                  incoming_message_id → wa_conversation_messages
│                  status text
│                  attempt_count integer
│                  claim_at timestamptz
│                  claimed_at timestamptz
│                  claimed_by text
│                  error_last text
│                  dead_lettered_at timestamptz
│                  created_at timestamptz
│                  updated_at timestamptz

ai_agents  [FASE 01]
│  id uuid PK
│  org_id → organizations
│  name text
│  description text
│  system_prompt text
│  model text                 ← formato "provider/model-name"
│  ai_temperature numeric(3,2)
│  max_tokens integer
│  tools_enabled text[]
│  handoff_triggers jsonb
│  greeting_message text
│  active boolean
│  created_by_id → "user" (nullable SET NULL)
│
└── ai_agent_deployments (a través de deployments)

leads (existente)
│  id uuid PK
│  org_id → organizations
│  ...demás columnas existentes...
│
└── wa_conversations.lead_id (nullable)
```

---

## 2. Catálogo de tablas — Fase 01

### `wa_business_accounts`

| Columna | Tipo | Nulo | Default | Notas |
|---------|------|------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `org_id` | uuid | NO | — | FK → organizations(id) ON DELETE CASCADE |
| `waba_id` | text | NO | — | ID de Meta WABA (externo) |
| `display_name` | text | NO | — | Nombre visible |
| `access_token_enc` | text | SÍ | — | Token Meta cifrado AES-256-GCM |
| `key_version` | integer | NO | 1 | Versión de clave de cifrado |
| `status` | text | NO | `'active'` | Enum lógico: active/inactive/error/disconnected |
| `webhook_verify_token` | text | SÍ | — | Token de verificación de webhook Meta |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Índices**:
- `wa_business_accounts_org_id_idx` — `(org_id)`
- `wa_business_accounts_org_waba_idx` — `UNIQUE (org_id, waba_id)`

---

### `wa_phone_numbers`

| Columna | Tipo | Nulo | Default | Notas |
|---------|------|------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `org_id` | uuid | NO | — | FK → organizations ON DELETE CASCADE |
| `waba_account_id` | uuid | NO | — | FK → wa_business_accounts ON DELETE CASCADE |
| `phone_number_id` | text | NO | — | phone_number_id de Meta (externo) |
| `display_phone_number` | text | NO | — | Ej. "+58 412-555-1234" |
| `verified_name` | text | SÍ | — | Nombre verificado de negocio |
| `quality_rating` | text | SÍ | — | GREEN/YELLOW/RED (de Meta) |
| `status` | text | NO | `'active'` | active/inactive/pending/deleted |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Índices**:
- `wa_phone_numbers_org_id_idx` — `(org_id)`
- `wa_phone_numbers_waba_id_idx` — `(waba_account_id)`
- `wa_phone_numbers_org_phone_id_idx` — `UNIQUE (org_id, phone_number_id)`

---

### `ai_agents`

| Columna | Tipo | Nulo | Default | Notas |
|---------|------|------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `org_id` | uuid | NO | — | FK → organizations ON DELETE CASCADE |
| `name` | text | NO | — | Nombre del agente |
| `description` | text | SÍ | — | Descripción interna |
| `system_prompt` | text | NO | `''` | Prompt de sistema |
| `model` | text | NO | `'claude-sonnet-4-6'` | Formato: `provider/model-name` |
| `ai_temperature` | numeric(3,2) | NO | `0.70` | 0.00–1.00 |
| `max_tokens` | integer | NO | `1024` | Tokens máximos de respuesta |
| `tools_enabled` | text[] | NO | `{}` | Lista de nombres de tools habilitadas |
| `handoff_triggers` | jsonb | NO | `{}` | Config de triggers de handoff |
| `greeting_message` | text | SÍ | — | Mensaje de bienvenida automático |
| `active` | boolean | NO | `true` | Soft delete / pausa |
| `created_by_id` | text | SÍ | — | FK → "user"(id) ON DELETE SET NULL |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Índices**:
- `ai_agents_org_id_idx` — `(org_id)`

**Notas de diseño**:
- `model` usa formato `provider/model-name` (ej. `anthropic/claude-sonnet-4-6`). El prefijo determina el provider SDK a usar.
- `created_by_id` es `text` (no uuid) porque referencia la tabla `"user"` de Auth.js que usa IDs de texto.
- Las configuraciones publicadas son inmutables via snapshot en `ai_episodes.agent_snapshot` (Fase 02).

---

### `ai_agent_deployments`

| Columna | Tipo | Nulo | Default | Notas |
|---------|------|------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `org_id` | uuid | NO | — | FK → organizations ON DELETE CASCADE |
| `agent_id` | uuid | NO | — | FK → ai_agents ON DELETE CASCADE |
| `phone_number_id` | uuid | NO | — | FK → wa_phone_numbers ON DELETE CASCADE |
| `active` | boolean | NO | `true` | Solo un deployment activo por número |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Índices**:
- `ai_agent_deployments_org_id_idx` — `(org_id)`
- `ai_agent_deployments_agent_id_idx` — `(agent_id)`
- `ai_agent_deployments_phone_org_idx` — `UNIQUE (phone_number_id, org_id)`

**Invariante**: para desplegar un agente nuevo en un número, el deployment anterior debe desactivarse primero (`active = false`). El UNIQUE constraint no previene múltiples filas históricas, solo una activa.

---

### `wa_conversations`

| Columna | Tipo | Nulo | Default | Notas |
|---------|------|------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `org_id` | uuid | NO | — | FK → organizations ON DELETE CASCADE |
| `phone_number_id` | uuid | NO | — | FK → wa_phone_numbers ON DELETE CASCADE |
| `customer_phone` | text | NO | — | Número del cliente (E.164 o formato Meta) |
| `customer_name` | text | SÍ | — | Nombre si Meta lo provee |
| `lead_id` | uuid | SÍ | — | FK → leads ON DELETE SET NULL |
| `deployment_id` | uuid | SÍ | — | FK → ai_agent_deployments ON DELETE SET NULL |
| `status` | text | NO | `'active'` | FSM: active/human_takeover/closed |
| `assigned_to` | text | SÍ | — | FK → "user"(id) ON DELETE SET NULL |
| `last_message_at` | timestamptz | NO | now() | Para ordenar inbox |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Índices**:
- `wa_conversations_org_id_idx` — `(org_id)`
- `wa_conversations_phone_number_id_idx` — `(phone_number_id)`
- `wa_conversations_lead_id_idx` — `(lead_id)`
- `wa_conversations_last_msg_idx` — `(last_message_at)`
- `wa_conversations_org_phone_customer_idx` — `UNIQUE (org_id, phone_number_id, customer_phone)`

**Semántica**: un hilo permanente por triplete (org, número receptor, número cliente). No se recrea al reabrirse — se reutiliza la misma fila y se cambia `status` de vuelta a `active`.

---

### `wa_conversation_messages`

| Columna | Tipo | Nulo | Default | Notas |
|---------|------|------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `org_id` | uuid | NO | — | FK → organizations ON DELETE CASCADE |
| `conversation_id` | uuid | NO | — | FK → wa_conversations ON DELETE CASCADE |
| `direction` | text | NO | `'inbound'` | inbound/outbound |
| `role` | text | NO | `'user'` | user/assistant/system |
| `content` | text | NO | `''` | Texto del mensaje |
| `content_type` | text | NO | `'text'` | text/image/audio/document/template/sticker/reaction |
| `media_url` | text | SÍ | — | URL de media (si aplica) |
| `external_message_id` | text | SÍ | — | wamid de Meta (para deduplicación) |
| `status` | text | NO | `'sent'` | sent/delivered/read/failed |
| `token_count` | integer | SÍ | — | Tokens usados por el LLM (solo mensajes AI) |
| `is_ai` | boolean | NO | `false` | true = generado por el agente AI |
| `created_at` | timestamptz | NO | now() | Inmutable; no tiene `updated_at` |

**Índices**:
- `wa_conv_messages_conversation_id_idx` — `(conversation_id)`
- `wa_conv_messages_org_id_idx` — `(org_id)`
- `wa_conv_messages_created_at_idx` — `(created_at)`
- `wa_conv_messages_external_id_idx` — `UNIQUE (external_message_id) WHERE external_message_id IS NOT NULL`

**Deduplicación**: el índice parcial sobre `external_message_id` garantiza que el mismo mensaje de Meta no se ingrese dos veces. Webhooks duplicados de Meta retornan silenciosamente sin crear filas.

---

### `wa_agent_events`

| Columna | Tipo | Nulo | Default | Notas |
|---------|------|------|---------|-------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `org_id` | uuid | NO | — | FK → organizations ON DELETE CASCADE |
| `conversation_id` | uuid | NO | — | FK → wa_conversations ON DELETE CASCADE |
| `event_type` | text | NO | — | Enum lógico (ver sección 4) |
| `payload` | jsonb | NO | `{}` | Datos del evento (tool call, error, etc.) |
| `created_at` | timestamptz | NO | now() | Inmutable |

**Índices**:
- `wa_agent_events_org_id_idx` — `(org_id)`
- `wa_agent_events_conversation_id_idx` — `(conversation_id)`
- `wa_agent_events_created_at_idx` — `(created_at)`

---

## 3. Tablas planificadas — Fase 02+

### `ai_episodes` — Fase 02

Unidad de trabajo acotada de un agente AI. Una conversación puede tener múltiples episodios (uno por sesión de intercambio AI consecutivo).

| Columna | Tipo | Nulo | Notas |
|---------|------|------|-------|
| `id` | uuid | NO | PK |
| `org_id` | uuid | NO | FK → organizations |
| `conversation_id` | uuid | NO | FK → wa_conversations |
| `agent_id` | uuid | NO | FK → ai_agents (referencia histórica) |
| `agent_snapshot` | jsonb | NO | Copia inmutable de la config del agente al inicio del episodio |
| `trigger_message_id` | uuid | NO | FK → wa_conversation_messages (mensaje que inició el episodio) |
| `status` | text | NO | FSM: active/ended/handed_off/failed |
| `started_at` | timestamptz | NO | |
| `ended_at` | timestamptz | SÍ | |
| `token_count_in` | integer | SÍ | Total tokens de entrada consumidos |
| `token_count_out` | integer | SÍ | Total tokens de salida generados |
| `handoff_reason` | text | SÍ | Razón del handoff si status = handed_off |

**Propósito del snapshot**: las modificaciones a `ai_agents` no afectan episodios históricos ni en curso. El snapshot hace los episodios auditables e inmutables.

---

### `ai_message_queue` — Fase 02

Outbox para procesamiento asíncrono de mensajes entrantes (mismo patrón que `meta_events`).

| Columna | Tipo | Nulo | Notas |
|---------|------|------|-------|
| `id` | uuid | NO | PK |
| `org_id` | uuid | NO | FK → organizations |
| `conversation_id` | uuid | NO | FK → wa_conversations |
| `incoming_message_id` | uuid | NO | FK → wa_conversation_messages (el mensaje que disparó el ciclo) |
| `status` | text | NO | FSM: enqueued/processing/done/failed/dead_letter |
| `attempt_count` | integer | NO | Default 0 |
| `claim_at` | timestamptz | NO | Cuándo puede reclamarse (backoff exponencial) |
| `claimed_at` | timestamptz | SÍ | Cuándo fue reclamado por un worker |
| `claimed_by` | text | SÍ | Identificador del worker (correlation ID) |
| `error_last` | text | SÍ | Último mensaje de error sanitizado |
| `dead_lettered_at` | timestamptz | SÍ | |
| `created_at` | timestamptz | NO | |
| `updated_at` | timestamptz | NO | |

**Claim atómico** (mismo patrón que `processOneMetaEvent`):
```sql
UPDATE ai_message_queue
SET status = 'processing', claimed_at = now(), claimed_by = $correlationId
WHERE id = (
  SELECT id FROM ai_message_queue
  WHERE status IN ('enqueued', 'failed') AND claim_at <= now() AND org_id IS NOT NULL
  ORDER BY claim_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *
```

---

## 4. Enumeraciones de estado

### `wa_business_accounts.status`
```
active       — WABA conectada y operativa
inactive     — desactivada manualmente
error        — error en la última operación (token inválido, etc.)
disconnected — desconectada por el usuario
```

### `wa_phone_numbers.status`
```
active   — número operativo y registrado
inactive — desactivado manualmente
pending  — verificación pendiente en Meta
deleted  — eliminado en Meta (mantenido históricamente)
```

### `wa_conversations.status` (FSM)
```
         nuevo mensaje entrante
              │
              ▼
         ┌─────────┐
         │  active  │ ◄──────────────────────┐
         └────┬────┘                          │
              │                               │
    handoff_triggered          handoff_released
              │                               │
              ▼                               │
    ┌──────────────────┐                     │
    │  human_takeover  │──────────────────────┘
    └────────┬─────────┘
             │
       closed (resuelto)
             │
             ▼
         ┌────────┐
         │ closed │
         └────────┘
```

Transiciones válidas:
- `active → human_takeover`: `takeoverAction()` (role: agent+)
- `human_takeover → active`: `releaseAction()` (role: agent+)
- `active → closed`: agente AI detecta cierre o admin cierra
- `human_takeover → closed`: humano cierra la conversación

### `wa_conversation_messages.direction`
```
inbound   — mensaje recibido del cliente
outbound  — mensaje enviado al cliente (AI o humano)
```

### `wa_conversation_messages.role`
```
user       — mensaje del cliente (siempre inbound)
assistant  — respuesta del AI o del agente humano (siempre outbound)
system     — mensajes internos de sistema (no visibles al cliente)
```

### `wa_conversation_messages.status`
```
(outbound)  sent → delivered → read
                └─► failed

(inbound)   received (inmutable; solo un estado)
```

### `wa_agent_events.event_type`
```
tool_call         — el agente AI invocó una herramienta
tool_result       — resultado de la herramienta
handoff_triggered — el agente solicitó handoff
handoff_completed — un humano tomó control
context_updated   — el contexto de lead fue actualizado
error             — error durante el ciclo AI
greeting_sent     — se envió el mensaje de bienvenida
```

### `ai_episodes.status` — Fase 02 (FSM)
```
         mensaje entrante + conversación activa
              │
              ▼
         ┌──────────┐
         │  active  │ ← LLM procesando
         └────┬─────┘
              │
      ┌───────┼───────────┐
      │       │           │
      ▼       ▼           ▼
  ┌──────┐ ┌──────────┐ ┌────────┐
  │ended │ │handed_off│ │failed  │
  └──────┘ └──────────┘ └────────┘
```

### `ai_message_queue.status` — Fase 02 (FSM)
```
enqueued → processing → done
               │
               └─► failed ──(retry, backoff exponencial)──► processing
                              │
                              └─► dead_letter (max_attempts alcanzado)
```

---

## 5. Convención de modelos LLM

El campo `ai_agents.model` usa el formato `provider/model-name`:

| Valor en DB | Proveedor | API Key env var |
|-------------|-----------|-----------------|
| `anthropic/claude-sonnet-4-6` | Anthropic | `ANTHROPIC_API_KEY` |
| `anthropic/claude-haiku-4-5-20251001` | Anthropic | `ANTHROPIC_API_KEY` |
| `openai/gpt-4o` | OpenAI | `OPENAI_API_KEY` |
| `openai/gpt-4o-mini` | OpenAI | `OPENAI_API_KEY` |
| `google/gemini-2.0-flash` | Google | `GOOGLE_AI_API_KEY` |
| `google/gemini-1.5-pro` | Google | `GOOGLE_AI_API_KEY` |

El registry selecciona el provider por `model.split("/")[0]`. Los valores en DB son estables; el nombre del modelo real es la parte después de `/`.

---

## 6. Restricciones de aislamiento multi-tenant

Reglas que aplican a **todas** las tablas del módulo:

1. Toda tabla tiene `org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
2. Toda query tiene `WHERE org_id = ?` derivado de la sesión autenticada
3. El webhook resuelve `org_id` desde `wa_phone_numbers.org_id` — nunca del payload de Meta
4. El modelo LLM nunca recibe `org_id` como parámetro — lo hereda del contexto del episodio

---

## 7. Migración aplicada

**`drizzle/0015_ai_agents_foundation.sql`** — Estado: generada, pendiente de aplicar a Neon.

Contiene `CREATE TABLE IF NOT EXISTS` para las 7 tablas de Fase 01. Es aditiva y segura para ejecutar múltiples veces.

Para aplicar:
```bash
npx drizzle-kit push
```

Verificar tras aplicar: el total de tablas en Neon debe aumentar en 7 (de 48 a 55).
