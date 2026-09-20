# Threat Model — SyncLead

> Last updated: 2026-09-19 (Prompt 21)

## 1. Activos

| Activo | Clasificación | Dónde vive |
|--------|---------------|------------|
| Meta Access Token (descifrado) | Secreto crítico | RAM del servidor (solo durante CAPI call); nunca en DB ni logs |
| ENCRYPTION_KEY | Secreto crítico | Vercel env var; nunca en repo |
| AUTH_SECRET | Secreto crítico | Vercel env var |
| DATABASE_URL | Secreto alto | Vercel env var |
| Datos PII de leads (nombre, email, teléfono) | PII | `leads` table en Neon |
| Datos PII en tránsito | PII | HTTPS solamente |
| Historial de conversiones | Confidencial de negocio | `conversions` table |
| API keys de ingesta (hash) | Secreto medio | `ingestion_credentials.key_hash` (solo SHA-256) |
| Tokens de sesión Auth.js | Secreto medio | Cookie httpOnly+Secure (JWT) |

## 2. Actores

| Actor | Capacidades asumidas |
|-------|---------------------|
| Usuario legítimo autenticado | Acceso a su org solamente; rol controla permisos granulares |
| Administrador de la plataforma | Acceso admin con 2FA futura; actualmente owner |
| Atacante externo sin credenciales | Puede enviar requests arbitrarios a rutas públicas |
| Atacante con token de sesión robado | Mismas capacidades que usuario legítimo durante TTL del JWT |
| Insider malicioso (miembro del equipo) | Limitado por RBAC; auditable via audit_logs |
| Proveedor Meta | Recibe eventos Conversion API — nunca PII sin hashear |
| Bot / crawler | Bloqueado por Turnstile + honeypot + rate limit en Modo A |

## 3. Superficies de ataque

### 3.1 Endpoints públicos
- `POST /api/ingest/form` — Modo A: token público (pub_xxx), protegido por Turnstile + honeypot + rate limit 20/min
- `POST /api/ingest/server` — Modo B: Bearer hash lookup, rate limit 1000/min
- `GET /api/auth/[...nextauth]` — Auth.js: login, OAuth callback, session
- `GET /api/webhook/whatsapp/[clientId]` — firma HMAC requerida

### 3.2 Dashboard autenticado
- Todas las rutas `/dashboard/*` requieren JWT válido y membresía en org
- `org_id` siempre desde sesión/credencial; nunca del request body
- Server Actions: `requireOrganizationMembership()` en todas las mutations

### 3.3 Cron endpoints
- `/api/cron/*` — protegidos por `Authorization: Bearer $CRON_SECRET`
- Sin CRON_SECRET → respuesta 401; no degradación silenciosa

### 3.4 Dependencias
- `next`, `next-auth`, `drizzle-orm`, `xlsx`, `@neondatabase/serverless`, `@upstash/ratelimit`
- Auditoría: `npm audit` en CI (ver scripts en package.json)

## 4. Amenazas y mitigaciones

| # | Amenaza | Superficie | Mitigación | Estado |
|---|---------|------------|------------|--------|
| T1 | Robo de Meta Access Token vía logs | Logs de error | `import "server-only"` en crypto.ts/meta-capi.ts; `redactForLog()` en monitoring.ts; mensaje de error omitido por default | ✅ |
| T2 | IDOR: acceso cross-tenant a leads | Dashboard API | `org_id` siempre de sesión; `requireOrganizationMembership()` en todas las mutations | ✅ |
| T3 | Inyección de fórmulas en CSV export | Performance view | `sanitizeCsvCell()` prefija `=`, `+`, `-`, `@`, `\t`, `\r` con `'` | ✅ |
| T4 | Replay de webhook (ingesta duplicada) | /api/ingest/* | Unique index `webhook_events(campaign_id, event_id)`; ON CONFLICT DO NOTHING | ✅ |
| T5 | Envío accidental de eventos Meta desde preview | Cron worker | `VERCEL_ENV === "preview"` añade `test_event_code`; sin test code → evento es de prueba visible en Events Manager | ✅ |
| T6 | XSS vía CSP bypass | Todas las páginas | CSP con nonce por request; `script-src 'nonce-{n}' 'strict-dynamic'`; `X-Frame-Options: DENY` | ✅ |
| T7 | Clickjacking | Todas las páginas | `X-Frame-Options: DENY` + `frame-src 'none'` en CSP | ✅ |
| T8 | Exposición de secretos en bundle JS | Build cliente | `server-only` en crypto/meta-capi/audit; tests en bundle-safety.test.ts | ✅ |
| T9 | Brute-force de login | /api/auth/* | Rate limit Upstash (degradado silencioso si no configurado) | ⚠ Parcial (Redis opcional) |
| T10 | Importación duplicada de leads | /dashboard/import | dedupeKey (SHA-256 fileHash:sheetName:rowIndex) + fingerprint cross-batch | ✅ |
| T11 | Backfill no autorizado a Meta CAPI | Import processor | `runImport()` nunca crea `meta_events`; assertion en tests | ✅ |
| T12 | Exposición de PII en audit_logs | audit_logs table | Solo `resourceId` + acción almacenados; sin email/phone en metadata; `ip_redacted` (xxx en último octeto) | ✅ |
| T13 | Retención indefinida de IP/UA | leads table | `ip_expires_at` / `ua_expires_at` (90 días); cron `/api/cron/retention-cleanup` nullifica | ✅ |
| T14 | SQL injection | Todas las queries | Drizzle ORM con parámetros preparados; sin SQL raw excepto casos documentados | ✅ |
| T15 | SSRF via landing URLs | Ingest schema | Zod refine: solo `http://` y `https://` permitidos | ✅ |
| T16 | Path traversal en import | Upload action | xlsx lib parsea buffer; sin acceso a filesystem por nombre de archivo | ✅ |
| T17 | Rotación insegura de claves de cifrado | crypto.ts | Formato `v{n}:iv:tag:data`; `keyVersion` en `meta_connections`; rotación sin borrar claves antiguas | ✅ |

## 5. Riesgos aceptados / fuera de alcance

| Riesgo | Decisión |
|--------|----------|
| Rate limiting Redis sin configurar | Aceptado: degradación silenciosa; honeypot y otras capas permanecen activas |
| 2FA para admin | Fuera de alcance para v1; planificado en roadmap |
| Penetration test formal | Pendiente antes de apertura pública |
| SIEM / SOAR integration | Pendiente; `monitoring.ts` tiene hooks comentados para Sentry/Axiom |
| Backup encryption at rest | Neon gestiona encryption at rest en la infraestructura |
| SOC 2 / ISO 27001 | Fuera de alcance para beta |

## 6. Flujo de datos PII

```
Lead form (browser)
  → HTTPS → /api/ingest/form
    → Cloudflare Turnstile check
    → Rate limit (IP anonimizada para el límite)
    → normalizeLeadData() — extrae campos PII
    → persistLead():
        leads.email = raw PII (retenido, expira en ip_expires_at/ua_expires_at para IP/UA)
        leads.ip = anonimizada para almacenamiento (último octeto = xxx)
        leads.user_agent = raw (expira en ua_expires_at)
    → webhook_events.rawPayload = solo metadatos (sin PII)

Lead conversion → Meta CAPI
  → buildPurchasePayload():
      em = SHA-256(email.trim().toLowerCase())
      ph = SHA-256(phone.replace(\D, ''))
      fn = SHA-256(firstName)
      ct = SHA-256(city)
      fbc, fbp, client_ip_address = verbatim (Meta requiere sin hash)
  → accessToken descifrado en RAM, nunca loggeado
```

## 7. Supuestos de confianza

- Neon Postgres: proveedor de infraestructura de confianza; backups gestionados por Neon
- Vercel: plataforma de deploy de confianza; env vars cifradas en reposo
- Auth.js v5: implementación correcta de JWT y cookie handling
- Meta Graph API: HTTPS; certificados verificados por Node fetch
- `@neondatabase/serverless`: driver oficial; no se cachea connection state entre requests (neon-http)
