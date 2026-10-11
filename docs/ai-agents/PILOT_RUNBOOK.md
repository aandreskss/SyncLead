# SyncLead AI Agents — Pilot Runbook

> **Scope:** One real WhatsApp number, one org, internal team only.  
> **Not production-ready:** External WhatsApp integration tests are missing (see matrix).  
> Status verified: 2026-10-11 — 46/46 unit tests pass, TypeScript clean.

---

## 1. Prerequisites — Infrastructure

| Item | Requirement | Where to find |
|------|-------------|---------------|
| Meta Business account | Verified, phone number claimed | business.facebook.com |
| WhatsApp Business Cloud API | App in "Live" mode (not development) | developers.facebook.com |
| Neon PostgreSQL | Migrations applied (see §3) | Neon console |
| Vercel project | Deployed with env vars (see §2) | Vercel dashboard |
| Anthropic API key | Claude Haiku or Sonnet | console.anthropic.com |
| Pilot WhatsApp number | SIM or virtual number registered in WABA | Meta WABA settings |

---

## 2. Environment Variables

Add these in `vercel env add` or Vercel dashboard (Production + Preview environments):

```
# Meta / WhatsApp Cloud API
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=          # arbitrary string you choose; must match webhook config
WHATSAPP_PHONE_NUMBER_ID=   # from Meta WABA dashboard
WHATSAPP_API_VERSION=v21.0

# Anthropic
ANTHROPIC_API_KEY=

# Encryption (for token storage)
ENCRYPTION_KEY=             # 32-byte hex string; generate with: openssl rand -hex 32

# Feature flags (control AI without re-deploy)
AI_AGENTS_ENABLED=true      # set to "false" to pause globally
```

**Never commit these to git.** Rotate `ENCRYPTION_KEY` only via §12 (Credential Rotation).

---

## 3. Database Migrations

Run in order against the Neon production connection string:

```bash
# Pull env then run migrations
vercel env pull .env.local
npx drizzle-kit migrate
```

Required tables (created by migrations):
- `ai_message_queue` — inbound message job queue
- `ai_budget_reservations` — per-job cost reservation
- `ai_usage_records` — settled cost records
- `ai_tool_executions` — idempotency log
- `ai_episodes` — conversation episodes (version-frozen)
- `ai_budget_limits` — per-org daily/monthly/conversation caps
- `ai_pricing_tiers` — model cost lookup
- `ai_knowledge_sources` / `ai_knowledge_chunks` — RAG documents
- `ai_media_queue` — pending media processing jobs

Verify after migration:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'ai_%';
```

---

## 4. Meta Webhook Configuration

1. Go to developers.facebook.com → your App → WhatsApp → Configuration.
2. Set **Callback URL**: `https://<your-vercel-domain>/api/webhooks/meta`
3. Set **Verify Token**: same value as `META_VERIFY_TOKEN` env var.
4. Subscribe to fields: `messages`, `message_status_updates`.
5. Click **Verify and Save** — the endpoint must return a 200 with the hub.challenge.

Test the webhook is live:
```bash
curl -X POST https://<your-vercel-domain>/api/webhooks/meta \
  -H "Content-Type: application/json" \
  -d '{"object":"test"}'
# Expected: 200 OK (or non-500)
```

---

## 5. AI Cron Jobs

The three AI cron workers must be registered in Vercel (they match `JOB_REGISTRY` in `src/lib/jobs/registry.ts`):

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/jobs/ai-message-processor` | Every minute | Claim + process one AI job |
| `/api/jobs/ai-media-processor` | Every minute | Download + process one media item |
| `/api/jobs/ai-document-processor` | Every minute | Index one knowledge source |

Add to `vercel.json` or `vercel.ts`:
```json
{
  "crons": [
    { "path": "/api/jobs/ai-message-processor", "schedule": "* * * * *" },
    { "path": "/api/jobs/ai-media-processor",   "schedule": "* * * * *" },
    { "path": "/api/jobs/ai-document-processor","schedule": "* * * * *" }
  ]
}
```

Each job is idempotent and safe to overlap — they claim one item at a time with a lease token.

---

## 6. Authorized Recipient Testing (Pilot Phase)

During the pilot, **only send to phone numbers explicitly added to Meta's test contacts list**.

1. Meta dashboard → WhatsApp → Configuration → Test Numbers.
2. Add each pilot tester's number and have them send an opt-in message.
3. Test the end-to-end flow:
   - Tester sends WhatsApp message to the pilot number.
   - Webhook fires → message queued → cron picks it up within 60s.
   - AI reply sent back to tester.
4. Confirm reply is received before proceeding to §7.

---

## 7. Per-Tenant / Per-Number Activation

Each org activates AI per inbox (WhatsApp number). Do NOT enable globally without testing.

```sql
-- Enable AI for one inbox
UPDATE wa_inboxes
SET ai_enabled = true,
    ai_agent_version_id = '<published-agent-version-uuid>'
WHERE id = '<inbox-uuid>' AND org_id = '<org-uuid>';

-- Verify
SELECT id, phone_number_id, ai_enabled, ai_agent_version_id
FROM wa_inboxes
WHERE org_id = '<org-uuid>';
```

The AI only activates when `control_mode = 'ai'` on the conversation. New conversations start in `'ai'` mode if the inbox has `ai_enabled = true`.

---

## 8. Monitoring

### Key metrics to watch during pilot

| Signal | Where | Alert threshold |
|--------|-------|----------------|
| Cron job duration | Vercel Functions → `/api/jobs/ai-message-processor` | > 50s (timeBudgetMs breach) |
| Queue depth | `SELECT COUNT(*) FROM ai_message_queue WHERE status='enqueued'` | > 50 items |
| Error rate | Vercel Logs — filter `"stopReason":"error"` | > 5% of jobs |
| Daily spend | `ai_usage_records` sum | Approaching daily budget limit |
| Orphaned jobs | `ai_message_queue WHERE status='processing' AND claimed_at < NOW() - INTERVAL '15 minutes'` | > 0 (should be 0 — cron recovers them) |

### Log queries

```bash
# Recent AI jobs (Vercel CLI)
vercel logs --filter "ai-message-processor" --since 1h

# Failed jobs in DB
SELECT id, conversation_id, error_message, created_at
FROM ai_message_queue
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```

---

## 9. Rollback by Feature Flag

**Pause AI for all orgs** (no re-deploy needed):
```bash
vercel env add AI_AGENTS_ENABLED production
# Enter: false
# Redeploy or wait for next request — the flag is read at runtime
```

**Pause AI for one inbox** (SQL, immediate):
```sql
UPDATE wa_inboxes SET ai_enabled = false WHERE id = '<inbox-uuid>';
```

Disabling AI does **not** affect message reception or the human agent inbox. Conversations in `control_mode = 'ai'` will simply stop generating AI replies; human agents can still read and respond manually.

---

## 10. Emergency Pause

If AI is sending unexpected messages:

**Step 1 — Flag off (< 30 seconds):**
```sql
UPDATE wa_inboxes SET ai_enabled = false WHERE org_id = '<org-uuid>';
```

**Step 2 — Drain the queue (prevents queued jobs from processing after re-enable):**
```sql
UPDATE ai_message_queue
SET status = 'failed', error_message = 'emergency_pause'
WHERE status IN ('enqueued', 'processing') AND org_id = '<org-uuid>';
```

**Step 3 — Release orphaned budget reservations:**
```sql
UPDATE ai_budget_reservations
SET status = 'orphaned', released_reason = 'emergency_pause', settled_at = NOW()
WHERE status = 'reserved' AND org_id = '<org-uuid>';
```

**Step 4 — Notify affected leads** (manual, via human agent inbox — AI pause does not auto-notify).

---

## 11. Failed Job Recovery

The `ai-message-processor` cron automatically recovers orphaned jobs on every tick (Step 0 of the processor). Manual recovery is only needed after extended downtime.

**View stuck jobs:**
```sql
SELECT id, conversation_id, claimed_at, worker_id
FROM ai_message_queue
WHERE status = 'processing'
  AND claimed_at < NOW() - INTERVAL '10 minutes';
```

**Reset for re-processing:**
```sql
UPDATE ai_message_queue
SET status = 'enqueued', lease_token = NULL, claimed_at = NULL
WHERE status = 'processing'
  AND claimed_at < NOW() - INTERVAL '10 minutes'
  AND org_id = '<org-uuid>';
```

**Permanently failed jobs** (exhausted retries) stay as `status = 'failed'`. To retry manually:
```sql
UPDATE ai_message_queue
SET status = 'enqueued', retry_count = 0, error_message = NULL
WHERE id = '<queue-item-uuid>';
```

---

## 12. Credential Rotation

### Anthropic API key
1. Generate new key in console.anthropic.com.
2. `vercel env rm ANTHROPIC_API_KEY production` then `vercel env add ANTHROPIC_API_KEY production`.
3. Trigger a new deployment. In-flight jobs complete with the old key (already in memory); new jobs use the new key.
4. Revoke the old key.

### Meta App Secret / Verify Token
1. Generate new secret in Meta developer dashboard.
2. Update `META_APP_SECRET` and `META_VERIFY_TOKEN` in Vercel.
3. Re-register the webhook in Meta dashboard with the new verify token.
4. Deploy. The old token stops working for webhook verification immediately after Meta saves the new one.

### Encryption Key (`ENCRYPTION_KEY`)
This key protects stored tokens. Rotation requires re-encrypting all stored tokens:
1. Add new key as `ENCRYPTION_KEY_NEW`.
2. Run a migration script that reads tokens with old key, re-encrypts with new key.
3. Swap: `ENCRYPTION_KEY = value of ENCRYPTION_KEY_NEW`, remove `ENCRYPTION_KEY_NEW`.
4. Deploy. **Do not delete the old key until migration is confirmed complete.**

---

## 13. Return to Human Attention

The AI operates in `control_mode = 'ai'`. To transfer a conversation to a human agent:

**Via AI tool** (recommended): The agent calls `transfer_to_human` → sets `control_mode = 'human'` → conversation appears in human inbox.

**Manual override** (SQL or admin UI):
```sql
UPDATE wa_conversations
SET control_mode = 'human'
WHERE id = '<conversation-uuid>' AND org_id = '<org-uuid>';
```

This immediately stops AI from processing further messages in that conversation. Any enqueued AI jobs for that conversation are voided by the pre-send eligibility check (Step 9 of the message processor).

**Returning to AI after human review:**
```sql
UPDATE wa_conversations
SET control_mode = 'ai'
WHERE id = '<conversation-uuid>' AND org_id = '<org-uuid>';
```

Human agents can read and reply at any time regardless of `control_mode`. Disabling AI never disables the inbox.

---

## 14. Implementation Matrix

| Feature | Implemented | Verified Locally | Verified Externally | Notes |
|---------|:-----------:|:----------------:|:-------------------:|-------|
| System prompt builder (`buildSystemPrompt`) | ✅ | ✅ | ⬜ | 46 unit tests |
| Engine loop with tool calls (`runEngine`) | ✅ | ✅ | ⬜ | Tested with mock provider |
| Tool execution + idempotency (`executeTool`) | ✅ | ✅ | ⬜ | 12 tools covered |
| Sandbox mode (no DB side effects) | ✅ | ✅ | ⬜ | All tools have sandbox branch |
| Budget check + reservation (`checkBudgetAndReserve`) | ✅ | ✅ | ⬜ | Daily/monthly/conversation limits |
| Budget settlement (`settleReservation`) | ✅ | ✅ | ⬜ | Idempotent double-settle guard |
| Cost calculation (`computeCostMillicents`) | ✅ | ✅ | ⬜ | Float precision, no overflow |
| Message queue claim + orphan recovery | ✅ | ✅ | ⬜ | Lease token pattern |
| Cancel pending AI messages on takeover | ✅ | ✅ | ⬜ | Updates to `failed`, not deletes |
| Send eligibility check (24h window) | ✅ | ✅ | ⬜ | Tested with mocked timestamps |
| Lead context injection in prompt | ✅ | ✅ | ⬜ | name, phone, city, campaignName, temperature |
| Cross-tenant isolation in search | ✅ | ✅ | ⬜ | Empty authorizedSourceIds → empty result |
| Knowledge chunk loading + RAG | ✅ | ✅ | ⬜ | Filters by processing_status='available' |
| Conversation summary injection | ✅ | ✅ | ⬜ | Injected as section before lead context |
| Agent version frozen per episode | ✅ | ✅ | ⬜ | getActiveEpisode reads agentVersionId |
| Media processing queue | ✅ | ✅ | ⬜ | onConflictDoNothing for dedup |
| WhatsApp webhook → queue | ✅ | ⬜ | ⬜ | No real webhook test yet |
| AI reply sent via Meta Cloud API | ✅ | ⬜ | ⬜ | No real WhatsApp send test yet |
| End-to-end: inbound → AI reply → delivery | ✅ | ⬜ | ⬜ | **BLOCKING for production** |
| Vision/transcription (media messages) | ✅ | ⬜ | ⬜ | Code complete, not integration-tested |
| Budget alerts (email/Slack on threshold) | ⬜ | ⬜ | ⬜ | Planned post-pilot |
| Analytics dashboard (AI spend/usage) | ⬜ | ⬜ | ⬜ | Planned post-pilot |

**Production readiness gate:** The three ⬜ rows marked "BLOCKING" (webhook → queue, AI reply send, end-to-end) must be verified with a real WhatsApp number before declaring production-ready.
