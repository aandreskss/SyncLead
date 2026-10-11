# AI WhatsApp Agents — Implementation Status

## Module Overview

Adds AI-powered WhatsApp agents to SyncLead using Meta Cloud API directly. Each agent is a reusable configuration deployable to one or more WhatsApp Business phone numbers. Supports multiple LLM providers: Anthropic Claude, OpenAI GPT, and Google Gemini.

---

## Architecture Decisions

### Why Meta Cloud API directly
- Full control over message handling and AI routing
- No dependency on third-party provider uptime
- Secrets stay server-side, encrypted with AES-256-GCM (same as Meta CAPI tokens)

### Multi-tenant isolation
- Every table has `org_id` FK to `organizations`
- Tenant resolved from authenticated session (`requireOrganizationMembership`) or validated Meta webhook signature — never from client-supplied `tenant_id`
- All DB queries filter by `org_id` at the application layer
- No RLS — same pattern as the rest of SyncLead (neon-http PgBouncer)

### Secret management
- `wa_business_accounts.access_token_enc` — Meta Cloud API access token, AES-256-GCM encrypted via `encryptTokenVersioned()` / `decryptTokenVersioned()` (same as `meta_connections`)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` — server-only env vars, Phase 03
- No secrets in `NEXT_PUBLIC_*` vars, logs, or client-visible props

### AI tool calls go through domain services only
- AI agent tools are registered domain service functions (e.g., `qualify_lead`, `create_note`, `assign_lead`)
- Never raw SQL, never arbitrary URLs, never code eval
- Tool schemas validated via Zod before execution

### Human handoff
- `wa_conversations.status` transitions: `active → human_takeover → active`
- `wa_conversations.assigned_to` holds the user_id of the human agent who took over
- AI agent stops responding when `status = 'human_takeover'`
- Handoff can be triggered manually or by AI agent via `handoff_triggered` event

### Additive migrations only
- All `CREATE TABLE IF NOT EXISTS` — safe to run multiple times
- No DROP TABLE, DROP COLUMN, ALTER TYPE with new values

---

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 00 | Repository inspection + technical architecture design | ✅ Complete |
| 01 | Foundation: DB schema + types + CRUD stubs | ✅ Complete |
| 02 | Meta Cloud API webhook ingestion + message persistence | ✅ Complete |
| 03 | AI engine loop: receive → context → LLM → reply | ✅ Complete |
| 04 | Agent config UI + simulator (6 tabs, sandbox, cost estimate) | ✅ Complete |
| 04-gaps | Persistent summary, latency recording, simulator test mode | ✅ Complete (2026-10-10) |
| 05 | Real CRM tools with idempotency: update fields, add note, qualify, assign, handoff, end, search KB | ✅ Complete (2026-10-10) |
| 06 | MetaCloudWhatsAppProvider: eligibility, retry/backoff, actual reply send, delivery ordering | ✅ Complete (2026-10-10) |
| 07 | Durable AI pipeline: router, serialization, debounce, lease fencing, orphan recovery, pre-send guard | ✅ Complete (2026-10-10) |
| 08 | Human inbox UI + deployment controls (bandeja, takeover, schedule, pause) | ✅ Complete (2026-10-10) |
| 09 | Knowledge base / RAG (future) | ⏳ Pending |

---

## Phase 08 — Human Inbox UI + Deployment Controls

### Completed (2026-10-10)

**DB migration `drizzle/0021_phase08_inbox.sql`:**
- `wa_conversation_notes` — private internal notes (never shown as customer messages); `author_id` FK → users with `ON DELETE RESTRICT`
- `ai_deployment_schedules` — per-deployment schedule (IANA timezone + daily windows JSON); unique on `deployment_id`
- `paused / paused_at / paused_by` columns added to `ai_agent_deployments`

**Repository `src/domains/ai-agents/inbox-repository.ts`:**
- `listInboxConversations(orgId, userId, filter, page)` — filters: mine, unassigned, ai_active, waiting_human, closed; includes last-message preview via over-fetch + in-JS grouping
- `getConversationDetail` — messages (paginated, chronological), notes (with authorName), lead fields, assignedUser; `totalMessages` count
- `takeConversation` — atomic `UPDATE WHERE controlMode NOT IN ('human')` + cancels enqueued/processing AI queue items
- `releaseConversation` — sets controlMode to waiting_human, clears assignedTo
- `returnToAi` — sets controlMode to ai + calls `resolveEpisodeForConversation` for new episode
- `resolveConversation` — sets status=closed, controlMode=paused
- `reopenConversation` — sets status=active, controlMode=waiting_human
- `addNote / listNotes` — private notes with author join
- `isWithinSchedule` — DST-safe schedule evaluation via `Intl.DateTimeFormat` locale string

**Actions `src/domains/ai-agents/inbox-actions.ts`:**
- `getInboxAction` — list with filter; viewer can read
- `getConversationDetailAction` — single conversation; viewer can read
- `takeConversationAction` — requires agent+ role; atomic take
- `releaseConversationAction` — requires agent+ role
- `replyAction` — 24h eligibility check; fetches access token from waBusinessAccounts (via join); calls CloudApiClient; records message in DB; 24h window violation returns `requiresTemplate: true`
- `returnToAiAction` — requires agent+ role; fetches conv state; calls returnToAi
- `resolveAction / reopenAction` — requires agent+ role
- `addNoteAction / listNotesAction` — requires agent+ role / membership
- `toggleDeploymentPauseAction` — requires manager+ role; toggles `paused`, sets `pausedAt/By`
- `upsertScheduleAction` — requires manager+ role; validates time format `HH:MM`; uses `onConflictDoUpdate`

**UI routes:**
- `src/app/dashboard/inbox/page.tsx` — SSR list with filter/page from searchParams
- `src/app/dashboard/inbox/_components/InboxView.tsx` — client polling (5→10→20→30s backoff on idle); filter tabs; pagination
- `src/app/dashboard/inbox/_components/ConversationCard.tsx` — control mode badge + last message preview
- `src/app/dashboard/inbox/[conversationId]/page.tsx` — SSR conversation detail
- `src/app/dashboard/inbox/[conversationId]/_components/ConversationView.tsx` — 10s polling; messages + action bar + reply box + lead/notes side panel
- `src/app/dashboard/inbox/[conversationId]/_components/MessageList.tsx` — AI vs human avatar distinction; delivery status symbols
- `src/app/dashboard/inbox/[conversationId]/_components/ReplyBox.tsx` — disabled when not in human mode; 24h template guidance
- `src/app/dashboard/inbox/[conversationId]/_components/ActionBar.tsx` — take/release/return-to-ai/resolve/reopen; role-gated; useTransition
- `src/app/dashboard/inbox/[conversationId]/_components/LeadPanel.tsx` — lead fields + conversation context
- `src/app/dashboard/inbox/[conversationId]/_components/NotesPanel.tsx` — private notes with "Solo visible para tu equipo" label
- `src/components/app/DashboardNav.tsx` — "Bandeja" link added to Agentes IA group

**Deployment tab enhancements `src/app/dashboard/agents/[id]/_components/TabDespliegue.tsx`:**
- Pause/activate button with `toggleDeploymentPauseAction`
- Schedule panel: enabled toggle, IANA timezone input, per-weekday windows (add/remove each window), save button with `upsertScheduleAction`
- Data flows: `page.tsx` → `AgentEditor` → `TabDespliegue` via new `deployment` prop

**Tests `src/__tests__/inbox-phase08.test.ts` (29/29 passing):**
- `isWithinSchedule` — empty windows, day-closed, always-open window, narrow window, DST-safe (America/New_York), multiple windows per day
- Atomic takeover — sequential simulation: first succeeds, second fails with error
- Notes — authorId ≠ isAi (separation from message table), addNote stores correctly
- Permissions — viewer cannot take/note/reply (requireRole throws)
- Human takeover during AI generation — cancels 2 updates (take + cancel-queue)
- Global pause — pause active deployment; activate paused deployment; missing deployment error; viewer cannot pause
- Reply eligibility — 24h window blocked (requiresTemplate), ai-mode blocked, closed blocked
- Return to AI — sets ai mode + creates episode; closed blocked
- Resolve/reopen — close idempotent error; reopen
- Schedule upsert — valid save; invalid time format; missing deployment

### Security invariants
- Notes never appear in `waConversationMessages` queries — different table with `authorId` (not `isAi`)
- takeConversation atomicity: WHERE clause excludes `controlMode = 'human'` — no race condition for concurrent takes
- replyAction checks 24h window and controlMode === 'human' before calling CloudApiClient
- All mutation actions require at least agent role; manager+ for deployment controls
- Org-scoping on all queries; no cross-tenant access possible

---

## Phase 00 — Repository Inspection

### Completed

Full inspection of the SyncLead codebase to verify all integration points before writing any production code.

**Auth, tenants, permissions**:
- JWT session via Auth.js v5 (`src/auth.ts`) — active
- `requireOrganizationMembership()` / `requireRole()` in `src/lib/auth/server.ts` — active
- `orgId` always resolved from DB (`org_members`), never from request body — verified
- Roles reused: owner/admin/manager/agent/viewer — no new roles needed

**Database and queue**:
- Neon Postgres (neon-http, PgBouncer transaction mode) — no interactive transactions
- Drizzle ORM ^0.45.2 — schema centralized in `src/lib/db/schema.ts`
- DB Outbox pattern confirmed in `meta_events` + cron every 10 min + `withJobRun()` wrapper
- Verified: `withJobRun()` in `src/lib/jobs/runner.ts`; 5 registered jobs in `src/lib/jobs/registry.ts`

**Encryption**:
- `encryptTokenVersioned(plain) → { ciphertext: string; keyVersion: number }` — synchronous, AES-256-GCM
- `decryptTokenVersioned(ciphertext) → string`
- Format: `v{n}:iv:tag:data`; `key_version` stored as separate column

**IWhatsAppProvider**:
- Interface exists in `src/domains/whatsapp/types.ts` but **no concrete implementation**
- Current WA system is link-based (wa.me URLs + manual confirmation) — `src/domains/whatsapp/repository.ts`
- The AI module does NOT implement `IWhatsAppProvider` — it uses Meta Cloud API directly via new `src/domains/wa-cloud/` domain

**Zod v4 compatibility verified**:
- `z.record()` requires 2 args: `z.record(z.string(), z.unknown())` — not `z.record(z.unknown())`
- `ZodError.issues` — not `.errors`

**Key finding — multi-LLM**:
- `ai_agents.model` field supports `provider/model-name` convention (e.g., `anthropic/claude-sonnet-4-6`, `openai/gpt-4o`, `google/gemini-2.0-flash`)
- Provider registry selects SDK by `model.split("/")[0]`

**Documents produced**:
- `docs/ai-agents/ARCHITECTURE.md` — full technical design
- `docs/ai-agents/DATA_MODEL.md` — table catalog + ER diagram + state enumerations
- `docs/ai-agents/IMPLEMENTATION_STATUS.md` — this file

---

## Phase 01 — Foundation

### What was built

**DB tables** (7 new tables in `src/lib/db/schema.ts` + migration):
- `wa_business_accounts` — Meta WABA credentials (access_token_enc encrypted)
- `wa_phone_numbers` — individual phone numbers within a WABA
- `ai_agents` — reusable AI agent configurations (system prompt, model, tools)
- `ai_agent_deployments` — links one agent to one phone number (unique per phone+org)
- `wa_conversations` — one permanent thread per (org, phone_number, customer_phone)
- `wa_conversation_messages` — individual messages; UNIQUE index on external_message_id
- `wa_agent_events` — internal AI events (tool calls, handoffs, errors)

**Full two-sided Drizzle relations declared** (CLAUDE.md critical rule):
- `waBusinessAccountsRelations`, `waPhoneNumbersRelations`, `aiAgentsRelations`
- `aiAgentDeploymentsRelations`, `waConversationsRelations`
- `waConversationMessagesRelations`, `waAgentEventsRelations`
- Plus inverse sides added to `organizationsRelations` and `leadsRelations`

**Files created**:
- `drizzle/0015_ai_agents_foundation.sql` — additive migration (IF NOT EXISTS) — **NOT yet applied to Neon**
- `src/domains/ai-agents/types.ts` — TypeScript types and Zod schemas
- `src/domains/ai-agents/repository.ts` — CRUD for all 7 tables

**Fixes applied during Phase 01**:
- `encryptTokenVersioned()` is synchronous — destructure `{ ciphertext, keyVersion }`, no await
- `z.record()` changed to 2-arg form in all 3 occurrences to match Zod v4.6.5

### Verified
- `npx tsc --noEmit` — 0 new errors
- `npx vitest run` — same baseline (910 passing, 48 pre-existing failures unrelated to this module)
- No new API calls, no UI changes, no environment variables required yet

### Limitations of Phase 01
- Migration `0015_ai_agents_foundation.sql` written but **not yet applied to Neon** — run `npx drizzle-kit push` when ready
- No webhook endpoint (Phase 02)
- No LLM integration (Phase 03)
- No UI (Phase 06)

---

## Phase 02 — Webhook Ingestion + Extended Schema

### What was built

**Schema additions** (`src/lib/db/schema.ts` + `drizzle/0016_ai_agents_phase02.sql`):
- `control_mode` + `closed_at` columns on `wa_conversations` (ai / waiting_human / human / paused)
- Global unique index on `wa_phone_numbers.phone_number_id` — one physical Meta number per system
- Global unique index on `wa_business_accounts.waba_id` — one WABA per system
- `ai_agent_versions` — immutable published snapshots; partial unique index ensures at most one published per agent
- `ai_knowledge_sources` + `ai_knowledge_revisions` — content versioning with SHA-256 dedup
- `ai_agent_version_knowledge` — version ↔ revision association; ON DELETE RESTRICT on sources/revisions
- `ai_campaign_rules` — deployment routing by campaign; unique partial indexes prevent duplicate rules
- `ai_episodes` — bounded AI work unit; `agent_version_id`, `campaign_id`, `knowledge_snapshot` fixed at start
- `ai_message_queue` — claim-atomic outbox for async AI processing; UNIQUE on `incoming_message_id`
- `ai_tool_executions` + `ai_usage_records` — audit trail and LLM cost tracking

**New domain: `src/domains/wa-cloud/`**:
- `types.ts` — Zod schemas for Meta webhook payload + normalized interfaces + delivery status constants
- `webhook.ts` — `verifyWebhookSignature()` (HMAC-SHA256 timing-safe), `parseWebhookPayload()` (forward-compatible)
- `client.ts` — `CloudApiClient`: `sendText()`, `sendTemplate()` — errors sanitized, no raw Meta details in logs
- `repository.ts` — tenant resolution from `phone_number_id`, `findOrCreateConversation()`, `persistIncomingMessage()`, `enqueueForAiProcessing()`

**Webhook route**: `src/app/api/webhook/wa-cloud/[wabaId]/route.ts`
- GET: hub verification against per-WABA `webhook_verify_token` (tenant-scoped, not global)
- POST: HMAC verification → WABA existence check → 200 immediately → async `processPayload()`
- Inbound: resolve tenant → find/create conversation → persist message (dedup by wamid) → enqueue for AI
- Status updates: `updateDeliveryStatusByWamid()` — wamid globally unique, no orgId lookup needed

**Extended repository** (`src/domains/ai-agents/repository.ts`):
- `publishAgentVersion()` — two-step atomic publish: archive current published → publish draft
- `getKnowledgeForVersion()` — skips revoked sources at application layer
- `associateKnowledgeWithVersion()` — cross-tenant guard: verifies source + revision belong to the requesting org
- `claimNextQueueItem()` — SELECT then UPDATE WHERE status='enqueued' (optimistic lock for concurrent workers)
- `createKnowledgeRevision()` — SHA-256 dedup: reuses existing revision if content hash matches
- Full CRUD for: agent versions, knowledge sources/revisions, version-knowledge associations, campaign rules, episodes, tool executions, usage records

**Tests** (`src/__tests__/ai-agents-phase02.test.ts`):
- 54 tests, all passing
- Covers: HMAC signature verification (5), payload parsing (8), tenant isolation cross-tenant guard (2), unique constraint semantics (5), atomic publication (2), revoked source filtering (2), claim-atomic queue (3), message dedup (2), conversation upsert (2), queue enqueue dedup (2), constants and enums (5), Zod schemas (9), cross-tenant DB isolation (5), episode immutability contract (2)

### Environment variables required
```
WA_CLOUD_APP_SECRET=<generated>   # Meta app secret for HMAC verification (POST webhook)
```
Hub verification uses the per-WABA `webhook_verify_token` stored in `wa_business_accounts`.

### Migration
`drizzle/0016_ai_agents_phase02.sql` written. Apply with:
```bash
npx drizzle-kit push
```
**Verify environment before applying — do not run against production automatically.**

### Key invariants enforced
- Tenant resolved from `wa_phone_numbers.phone_number_id` global unique index — never from Meta payload body
- `200 OK` to Meta in < 20s — all processing is async fire-and-forget
- Duplicate wamids deduplicated via `UNIQUE (external_message_id) WHERE NOT NULL` + `onConflictDoNothing`
- Revoked knowledge sources excluded from retrieval even if episode references them (audit trail preserved)
- Agent config changes after episode start do not alter active episodes (`agent_version_id` is fixed FK)

---

## Phase 03 — AI Engine Loop (Pending)

### Goal
Complete AI conversation cycle: incoming message → build context → call LLM → send reply.

### New files
- `src/domains/ai-engine/types.ts` — `ILLMProvider`, `LLMMessage`, `LLMResponse`, `LLMTool`
- `src/domains/ai-engine/providers/anthropic.ts` — `AnthropicProvider implements ILLMProvider`
- `src/domains/ai-engine/providers/openai.ts` — `OpenAIProvider implements ILLMProvider`
- `src/domains/ai-engine/providers/google.ts` — `GoogleProvider implements ILLMProvider`
- `src/domains/ai-engine/providers/registry.ts` — `selectProvider(model: string) → ILLMProvider`
- `src/domains/ai-engine/context-builder.ts` — `buildConversationContext()`: history + lead info
- `src/domains/ai-engine/episode.ts` — `runEpisode()`: orchestrates the AI loop
- `src/app/api/cron/ai-message-queue/route.ts` — processes pending items from `ai_message_queue`

### SDKs to install
```bash
npm install @anthropic-ai/sdk openai @google/generative-ai
```

All imported only in `src/domains/ai-engine/providers/` (server-side only, never in client bundles).

### Environment variables required
```
ANTHROPIC_API_KEY=sk-ant-...     # server-only
OPENAI_API_KEY=sk-...            # server-only
GOOGLE_AI_API_KEY=AIza...        # server-only
```

### Multi-LLM selection
Provider selected by `model.split("/")[0]`:

| DB value | Provider | SDK |
|----------|----------|-----|
| `anthropic/claude-sonnet-4-6` | Anthropic | `@anthropic-ai/sdk` |
| `openai/gpt-4o` | OpenAI | `openai` |
| `google/gemini-2.0-flash` | Google | `@google/generative-ai` |

### AI loop design
```
wa_conversation_messages (inbound)
  → ai_message_queue (enqueued)
  → processAiMessage() [immediate fire-and-forget OR cron]
    → buildConversationContext()    ← last N messages + lead info
    → selectProvider(agent.model)
    → provider.complete()           ← LLM call
    → for each tool_use:
        → AiToolRegistry.execute(toolName, input, context)  ← domain service only
    → sendText() via CloudApiClient
    → insertConversationMessage()   ← save outbound
    → insertAgentEvent()            ← log tool calls/results
    → ai_message_queue: status = done
```

### Conversation context window
- Last 50 messages loaded (configurable via `agent.max_tokens` budget)
- Lead info appended as system context if `conversation.lead_id` is set
- Agent snapshot from `ai_episodes.agent_snapshot` (immutable — not affected by agent edits)

---

## Phase 04 — Human Inbox (Pending)

### Goal
Allow agents/managers to take over conversations from the AI and respond as humans.

### New files
- `src/domains/ai-inbox/repository.ts` — `getInboxConversations()`, `markHandoff()`
- `src/domains/ai-inbox/actions.ts` — `takeoverAction()`, `releaseAction()`, `sendHumanMessageAction()`
- `src/app/dashboard/inbox/page.tsx` — inbox UI (Server Component)
- `src/app/dashboard/inbox/_components/` — conversation list, chat view, handoff controls

### Roles
- `takeoverAction()` / `releaseAction()` — requires `agent` role or higher
- `sendHumanMessageAction()` — requires `agent` role or higher; conversation must be `human_takeover`
- Viewing inbox — all roles except `viewer`

### Status transitions
- `wa_conversations.status: active → human_takeover` via `takeoverAction()`
- AI responds only when `status = 'active'`; stops when `status = 'human_takeover'`

---

## Phase 05 — Real CRM Tools ✅ Complete

### What was built

**Schema addition** (`drizzle/0019_ai_tools_phase05.sql`):
- `idempotency_key text` column on `ai_tool_executions`
- Partial unique index `ai_tool_executions_idem_key_idx` (WHERE NOT NULL) — safe to add to table with existing NULL rows

**`src/domains/ai-agents/engine/tools.ts`** (full rewrite):
- `ToolSignal = "transfer" | "end"` — optional signal on `ToolResult` to stop engine loop early
- `withIdempotency()` wrapper: INSERT with `status: "pending"` before execution → ON CONFLICT DO NOTHING → if 0 rows = already done (return `idempotent: true`); UPDATE to `success/error` after
- SHA-256 idempotency key: `tool:{queueItemId}:{toolName}:{callIndex}`
- 10 tools: `update_lead_stage`, `update_lead_fields`, `add_lead_note`, `requalify_lead`, `assign_to_rep`, `create_followup_task`, `create_appointment_request`, `transfer_to_human`, `end_conversation`, `search_knowledge_base`
- `transfer_to_human`: atomic — sets `controlMode = "waiting_human"` + saves summary + activity note → returns `signal: "transfer"`
- `end_conversation`: sets `status = "closed"` + `closedAt = now` → returns `signal: "end"`
- `assign_to_rep`: finds first active rep in org → `assignLeadToRep` → sets `controlMode = "waiting_human"` always
- Security invariant: `orgId`, `leadId`, `conversationId` always from `ToolContext`, never from AI input

**`src/domains/ai-agents/engine/index.ts`**:
- `queueItemId?: string` added to `EngineContext`
- `toolCallCounter` monotonically increments per tool call — ensures unique idempotency keys across engine runs
- `signalBreak` detection: breaks engine loop before next LLM call when `transfer` or `end` signal

**Tests** (`src/__tests__/ai-agents-tools-phase05.test.ts`): 35 tests — sandbox isolation, input validation, idempotency conflict, signal detection, cross-tenant guard.

---

## Phase 06 — MetaCloudWhatsAppProvider + Actual Reply Send ✅ Complete

### What was built

**`src/domains/wa-cloud/eligibility.ts`** (NEW):
- `checkSendEligibility(conversationId, orgId)` → `EligibilityResult`
- Returns `eligible: true` if last inbound message was within 24 hours
- Returns `{ eligible: false, reason: "window_closed" | "no_inbound_messages" }` otherwise
- Never auto-converts AI response to a pre-approved template

**`src/domains/wa-cloud/client.ts`** (UPDATED — API change):
- `SendOutcome` discriminated union: `{ kind: "accepted"; messageId }` | `{ kind: "error"; permanent; httpStatus? }` | `{ kind: "timeout_unknown" }`
- `sendText()` / `sendTemplate()` now return `SendOutcome` (no throwing)
- Configurable `timeoutMs` (default 10s) and `maxRetries` (default 2) via constructor
- `sendWithRetry()`: skips retry on `timeout_unknown` (ambiguous result — may already be in transit)
- Permanent error classification: HTTP 400/401/403/404/410, Meta codes 100/190/200/273
- On timeout: returns `timeout_unknown` — caller documents the ambiguity, does not resend blindly
- `CloudApiError` class preserved for backwards compatibility

**`src/domains/wa-cloud/provider.ts`** (NEW):
- `MetaCloudWhatsAppProvider implements IWhatsAppProvider` (from `src/domains/whatsapp/types.ts`)
- Constructor: `{ accessToken: string; phoneNumberId: string }` — no secrets in plaintext props
- `sendMessage` → `CloudApiClient.sendText`; throws on `timeout_unknown` with documented reason
- `parseWebhook` → delegates to `parseWebhookPayload()` for first status update
- `verifySignature` → delegates to `verifyWebhookSignature()`
- `normalizeStatus`: maps `sent/delivered/read/failed` → `WaMessageStatus`
- Coexistence note: Meta Cloud API + WhatsApp mobile app cannot coexist on the same number

**`src/domains/wa-cloud/repository.ts`** (UPDATED):
- `STATUS_DOWNGRADE_GUARD`: prevents out-of-order webhook events from downgrading delivery status
  - `"sent"` blocked by `["delivered", "read", "failed"]`
  - `"delivered"` blocked by `["read", "failed"]`
  - `"read"` blocked by `["failed"]`
  - `"failed"` blocked by `["delivered", "read"]`
- `updateDeliveryStatusByWamid()` and `updateMessageDeliveryStatus()` both apply the guard via `notInArray`
- `updateOutboundMessageStatus(messageRowId, orgId, { wamid?, status })` — sets wamid + status after send attempt

**`src/app/api/cron/ai-message-processor/route.ts`** (UPDATED — critical fix):
- `maxDuration` raised from 30 to 60 (engine ≤25s, send ≤8s, rest ≤27s overhead)
- Added `waPhoneNumbers`, `waBusinessAccounts` schema imports
- Conversation SELECT now includes `phoneNumberId` + `customerPhone`
- `insertConversationMessage` now captures return value; inserts with `status: "pending"` (not "sent")
- `sendReplyToMeta()`: loads phone credentials → checks eligibility → sends via `CloudApiClient({ timeoutMs: 8000, maxRetries: 0 })` → updates message status
- Outcome handling: accepted → update status="accepted" + wamid; permanent error → status="failed"; timeout_unknown/transient → status stays "pending" (delivery webhook updates it if received by Meta)
- Entire send is non-fatal: reply already persisted regardless of send outcome

**`.env.example`** (UPDATED):
- `WA_CLOUD_APP_SECRET` documented with setup procedure and coexistence warning

**Tests** (`src/__tests__/wa-cloud-phase06.test.ts`): 37 tests
- `verifyWebhookSignature`: valid, wrong secret, tampered body, null header, wrong length
- `checkSendEligibility`: within window, window closed, no inbound, exactly at boundary
- `CloudApiClient.sendText`: accepted, permanent 401, permanent Meta code, transient 500, timeout_unknown, network error, no retry on timeout, no retry on permanent, retry on transient
- `MetaCloudWhatsAppProvider`: sendMessage success/timeout_unknown/permanent, verifySignature, normalizeStatus, parseWebhook, supported statuses
- Delivery status ordering guard: delivered→sent blocks, read→delivered blocks, failed guards
- Deduplication: duplicate wamid returns null, first insertion returns rowId
- Unknown number: `resolveTenantFromPhoneNumberId` returns null
- `updateOutboundMessageStatus`: with wamid, without wamid, non-fatal

### API Graph version
Meta Graph API v22.0 (default). Configurable via `META_GRAPH_API_VERSION` env var.
Official docs: https://developers.facebook.com/docs/whatsapp/cloud-api (verified 2026-10-10).
Capabilities verified: send text message, send template, receive messages webhook, delivery status webhook.

### Known limitations
- Exactly-once delivery not guaranteed: `timeout_unknown` means Meta may have received the message. If the Vercel function times out before `markQueueItemDone`, the engine runs again on retry generating a duplicate reply. This is documented behavior — Phase 06 explicitly does not promise exactly-once.
- No Embedded Signup (reserved for Phase 12).
- No multi-client complete onboarding — single admin connection only for pilot.
- Mobile app coexistence: Cloud API disables the mobile app for that phone number. Document to operator before registering.

---

## Phase 07 — Durable AI Pipeline ✅ Complete (2026-10-10)

### What was built

**Migration** (`drizzle/0020_phase07_durable_pipeline.sql`):
- `lease_token uuid` column on `ai_message_queue` — fencing token for stale worker detection
- `ai_message_queue_orphan_idx` on `claimed_at WHERE status='processing'` — fast orphan recovery scan

**Schema** (`src/lib/db/schema.ts`):
- `leaseToken` column added to `aiMessageQueue`

**Router** (`src/domains/ai-agents/router.ts`) — NEW FILE:
- `resolveEpisodeForConversation()`: active episode reuse → deployment lookup → published version → campaign rules → create episode with frozen knowledge snapshot
- Campaign rule resolution: specific match wins; catch-all fallback; no match + no catch-all → null (escalate to human); no rules at all → proceed open
- Revoked knowledge sources excluded from snapshot at creation time
- Cross-tenant guard: `campaignId` FK + `orgId` filter on rules query — no leakage possible
- Returns null when no agent can handle → caller sets `controlMode = "waiting_human"`

**Repository enhancements** (`src/domains/ai-agents/repository.ts`):
- `claimNextQueueItem()`: + `claimAt <= NOW()` filter (debounce); per-conversation serialization via SQL subquery; generates UUID lease token stored in UPDATE
- `markQueueItemDone/Failed/DeadLetter()`: optional `leaseToken` parameter — WHERE clause includes token when provided; stale worker sees 0 rows updated
- `recoverOrphanedQueueItems(orphanThresholdMs = 10min)`: resets `status='processing'` items older than threshold to `'enqueued'`; clears `leaseToken`; sets `claimAt = NOW()`
- `cancelPendingQueueItems(conversationId, orgId)`: sets all enqueued items to `'done'` for human takeover
- `cancelPendingAiMessages(conversationId, orgId)`: marks `isAi=true + status='pending'` messages as `'failed'`; documents that Meta-accepted sends cannot be retracted

**Burst debounce** (`src/domains/wa-cloud/repository.ts`):
- `enqueueForAiProcessing()`: sets `claimAt = NOW() + 3000ms`; extends all existing enqueued items in same conversation to the same future time on each new message
- Claim query filters `claimAt <= NOW()` — burst window invisible until settled

**Cron worker** (`src/app/api/cron/ai-message-processor/route.ts`) — full rewrite:
- Step 0: `recoverOrphanedQueueItems()` — before claiming, reset stuck items
- Step 1: `claimNextQueueItem()` — returns item with `leaseToken`
- Step 3: `resolveEpisodeForConversation()` — replaces hard fail with router; null → `waiting_human`
- Step 10: pre-send controlMode re-check — reads fresh `controlMode` from DB after engine run (≤25s); if human took over → `cancelPendingAiMessages`, no send
- All mark calls pass `leaseToken` — stale worker cannot complete
- Max 5 attempts → dead-letter with lease fencing; exponential backoff with `claimAt` as retry-at time

**Tests** (`src/__tests__/wa-cloud-phase07.test.ts`): 30 tests — all passing
- Burst debounce: claimAt in future, extension on second message, non-fatal on DB failure
- Serialization: null on empty queue, null on lost race, successful claim with leaseToken in SET
- Orphan recovery: resets 2 items, returns 0 when clean, cutoff time within 2s tolerance
- Lease fencing: markDone/Failed/DeadLetter include token in WHERE; no token = single eq call
- cancelPendingQueueItems / cancelPendingAiMessages: count returned, status set correctly
- Router: active episode reuse (no INSERT), null on no deployment, new episode via specific rule, null on no match + no catch-all, catch-all fallback, open (no rules)
- Knowledge snapshot: revoked source excluded (1 of 2 in snapshot)
- E2E: enqueue→claim→done, stale worker no-op, orphan→reclaim, takeover during LLM, dead-letter after 5 attempts
- Idempotence: onConflictDoNothing called for duplicate enqueue

### Security invariants maintained
- `orgId` never from client input — always from claimed queue item or authenticated session
- AI tool calls go through domain services only (no raw SQL in tools)
- Lease token prevents stale worker from marking done an item reclaimed by orphan recovery
- Pre-send guard minimizes window where human takeover goes undetected
- Meta-accepted sends cannot be retracted — documented explicitly in code comments

### Known limitations
- Pre-send guard reduces but does not eliminate the takeover race window (LLM can take up to 25s)
- A message accepted by Meta between the pre-send check and the send itself cannot be stopped
- Per-conversation serialization uses a 10-minute exclusion window consistent with orphan threshold; a very long episode (near 25s) + 3 retries could delay the next message processing by up to ~10min

### Migration to apply
```bash
npx drizzle-kit push
# Adds lease_token column + orphan index to ai_message_queue
```

---

## Phase 05 — CRM Tool Calls (Pending — REPLACED by actual Phase 05 above)

### Goal
Enable AI agents to call CRM functions during conversations.

### New files
- `src/domains/ai-tools/registry.ts` — `AiToolRegistry`: name → `{ schema, execute }`
- `src/domains/ai-tools/tool-context.ts` — `AiToolContext`: `{ orgId, conversationId, leadId }`
- `src/domains/ai-tools/tools/qualify-lead.ts`
- `src/domains/ai-tools/tools/create-note.ts`
- `src/domains/ai-tools/tools/create-lead.ts`
- `src/domains/ai-tools/tools/update-lead.ts`
- `src/domains/ai-tools/tools/assign-lead.ts`
- `src/domains/ai-tools/tools/get-lead-info.ts`
- `src/domains/ai-tools/tools/send-template.ts`

### Security invariant
Each tool's `execute()` calls existing domain service functions with `orgId` from the episode context. No direct DB access, no arbitrary URLs, no code eval. Zod validates tool inputs before execution.

### Reused domain services
| Tool name | Calls |
|-----------|-------|
| `qualify_lead` | `autoQualifyLeadInternal(leadId)` |
| `create_lead` | `createLeadManuallyAction(campaignId, input)` |
| `update_lead` | `updateLeadInfoAction(leadId, input)` |
| `create_note` | `db.insert(leadNotes)` via repository |
| `assign_lead` | `db.insert(leadAssignments)` via repository |
| `get_lead_info` | `getLeadByPhoneForOrg(phone, orgId)` (to be added) |
| `send_template` | `CloudApiClient.sendTemplate()` |

---

## Phase 06 — Agent Configuration UI (Pending)

### Goal
Allow admins/owners to create, configure, and deploy AI agents from the dashboard.

### New pages
- `src/app/dashboard/ai-agents/page.tsx` — agent list
- `src/app/dashboard/ai-agents/[id]/page.tsx` — agent detail: system prompt editor, tool selection, deployment management
- Nav entries in `DashboardNav.tsx`: "Agentes AI" and "Inbox"

### Actions needed
- `createAiAgentAction()` — owner/admin
- `updateAiAgentAction()` — owner/admin/manager
- `createDeploymentAction()` — owner/admin (deactivates previous deployment for that phone number)
- `deactivateDeploymentAction()` — owner/admin

---

## Data Model

```
organizations
  └── wa_business_accounts  ✅ (Phase 01)
        └── wa_phone_numbers  ✅ (Phase 01)
              ├── ai_agent_deployments  ✅ (Phase 01)
              │     └── ai_agents  ✅ (Phase 01)
              └── wa_conversations  ✅ (Phase 01)
                    ├── wa_conversation_messages  ✅ (Phase 01)
                    ├── wa_agent_events  ✅ (Phase 01)
                    ├── ai_episodes  ⏳ (Phase 02)
                    └── ai_message_queue  ⏳ (Phase 02)

leads (existing)
  └── wa_conversations.lead_id (nullable FK)  ✅ (Phase 01)
```

---

## Environment Variables

| Variable | Phase | Notes |
|----------|-------|-------|
| `WA_CLOUD_API_VERSION` | 02 | e.g., `v19.0` |
| `ANTHROPIC_API_KEY` | 03 | server-only, never NEXT_PUBLIC_ |
| `OPENAI_API_KEY` | 03 | server-only |
| `GOOGLE_AI_API_KEY` | 03 | server-only |

---

## Security Constraints

> Todo acceso, acción, archivo, trabajo en cola y búsqueda de conocimiento debe quedar aislado por tenant. Resuelve el tenant desde identidad autenticada o conexión Meta validada; nunca confíes en un tenant_id enviado por el cliente o el modelo.

> Las claves y tokens son exclusivos del servidor. No uses NEXT_PUBLIC para secretos ni los imprimas en logs. Usa cifrado administrado o referencias a secretos, con estrategia de rotación.

> Las acciones IA llaman a servicios de dominio con esquemas y permisos. Nunca ejecutan SQL, código arbitrario o URLs arbitrarias propuestas por el modelo.
