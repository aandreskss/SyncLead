# Meta OAuth — Future Architecture

> **Status: NOT IMPLEMENTED.** This document captures the intended design for
> a future Meta OAuth 2.0 flow. The current implementation (Prompt 14) uses
> manually-pasted access tokens. OAuth is planned for a future milestone.

---

## Why OAuth instead of manual tokens

Manual tokens require users to:
1. Navigate to Meta Business Manager → System Users or Apps
2. Generate a long-lived token
3. Copy-paste it into SyncLead (error-prone, phishing risk if confused with a browser field)

OAuth reduces the friction to a single "Connect with Meta" button, produces a
properly-scoped user token, and enables automatic refresh via the long-lived
token exchange.

---

## Intended flow

```
User → [Connect with Meta] button in /dashboard/clients/[id]
  ↓
GET /api/meta/oauth/start?clientId={clientId}
  Generates state = HMAC(orgId + clientId + nonce) stored in Redis (TTL 10 min)
  Redirects to:
  https://www.facebook.com/dialog/oauth
    ?client_id={FB_APP_ID}
    &redirect_uri={APP_URL}/api/meta/oauth/callback
    &state={state}
    &scope=ads_read,business_management,pages_read_engagement
    ↓
User approves in Meta dialog
  ↓
GET /api/meta/oauth/callback?code={code}&state={state}
  1. Validate state (HMAC check + Redis lookup → delete on success)
  2. Exchange code → short-lived token (POST /oauth/access_token)
  3. Exchange short-lived → long-lived token (GET /oauth/access_token?grant_type=fb_exchange_token)
  4. Retrieve pixel list for the user's ad accounts (GET /me/adaccounts)
  5. Redirect to /dashboard/clients/[id]?meta_oauth=success
```

---

## Data stored

After a successful OAuth flow, a new `meta_connections` row is created:

| Column | Value |
|---|---|
| `access_token_enc` | Long-lived token, AES-256-GCM encrypted (versioned format) |
| `key_version` | Current `ENCRYPTION_KEY_VERSION` |
| `scopes` | Scopes granted by the user |
| `expires_at` | ~60 days from exchange; cron re-exchanges 5 days before |
| `status` | `active` |
| `graph_api_version` | `META_GRAPH_API_VERSION` at connection time |

The short-lived code and intermediate tokens are **never** written to the
database — only used in-memory within the callback handler.

---

## Token lifecycle

```
Long-lived token valid for ~60 days
  ↓ (55 days)
Cron: GET /api/cron/meta-token-refresh (protected by CRON_SECRET)
  For each meta_connection WHERE status='active' AND expires_at < now() + 5 days:
    Decrypt access_token_enc
    POST /oauth/access_token?grant_type=fb_exchange_token  → new long-lived token
    encryptTokenVersioned(new token)
    UPDATE meta_connections SET access_token_enc, expires_at, last_verified_at
  ↓ (60 days, if refresh failed)
status → 'expired'
Dashboard shows warning banner on affected clients
```

---

## Environment variables required (not added yet)

```env
# Meta App credentials (from Meta for Developers)
META_APP_ID=
META_APP_SECRET=      # Server-only — never expose to browser
```

`META_APP_SECRET` must be kept server-only. The OAuth callback handler runs
server-side. The client-side "Connect with Meta" button navigates to
`/api/meta/oauth/start` — the app secret never touches the browser.

---

## Security constraints for the OAuth implementation

When this is built, the following rules apply:

- `state` parameter must be an HMAC over `orgId + clientId + nonce`, verified
  on callback. Prevents CSRF and state fixation.
- Redis must delete the state after first use (one-time token).
- The `code` exchange (step 2) happens server-side, never in the browser.
- `META_APP_SECRET` is server-only (`import "server-only"` in the handler).
- The callback handler must re-validate `requireClientAccess(clientId)` from
  the decoded state before writing to the DB — it cannot trust the state alone.
- Short-lived tokens are never stored. Only the final long-lived token is
  written, immediately encrypted.
- The token is never returned to the browser in any response body or prop.

---

## Files to create (future)

```
src/app/api/meta/oauth/start/route.ts   — generates state, redirects to FB dialog
src/app/api/meta/oauth/callback/route.ts — exchanges code, stores token
src/app/api/cron/meta-token-refresh/route.ts — token rotation cron
src/lib/meta-oauth.ts — helper: exchangeCode(), refreshToken()
```

The `meta_connections` schema already supports OAuth tokens (same columns as
manual tokens). No schema migration will be needed.
