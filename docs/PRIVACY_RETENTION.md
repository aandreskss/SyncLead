# Privacy & Data Retention — SyncLead

> Last updated: 2026-09-19 (Prompt 21)
> ⚠ Este documento es de referencia técnica. No constituye asesoramiento legal.
> Consultar abogado especializado en GDPR/LGPD antes del lanzamiento público.

## 1. Inventario de PII por tabla

| Tabla | Campo PII | Clase | Retención | Método de expiración |
|-------|-----------|-------|-----------|----------------------|
| `leads` | `name` | Nombre real | Indefinida (requerida) | Erasure request → `[erased]` |
| `leads` | `email` | Email | Indefinida (requerida) | Erasure request → NULL |
| `leads` | `phone` | Teléfono | Indefinida (requerida) | Erasure request → NULL |
| `leads` | `city` | Ciudad | Indefinida (requerida) | Erasure request → NULL |
| `leads` | `ip` | Dirección IP (redactada) | 90 días | `ip_expires_at`; cron nullifica |
| `leads` | `user_agent` | User-Agent | 90 días | `ua_expires_at`; cron nullifica |
| `leads` | `fbc`, `fbp`, `fbclid` | Identificadores Meta | Indefinida | Erasure request → NULL |
| `audit_logs` | `ip_redacted` | IP parcial (xxx) | 2 años | Manual o cron futuro |
| `audit_logs` | `actor_id` | ID de usuario (no PII) | Indefinida | — |
| `webhook_events` | `rawPayload` | Solo metadatos (sin PII) | 30 días | Cron `/api/cron/cleanup` |
| `wa_messages` | `messageText` | Texto del mensaje | 1 año | Manual |
| `import_rows` | `rawData` (jsonb) | Fila original del CSV | 90 días | Cron futuro |

## 2. Campos de consentimiento (leads)

Los siguientes campos fueron añadidos en la migración `0010_security_hardening.sql`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `consent_given` | boolean | El lead consintió explícitamente el tratamiento de sus datos |
| `legal_basis` | text | Base legal (ej: `consent`, `legitimate_interest`, `contract`) |
| `consented_at` | timestamptz | Timestamp del consentimiento |
| `deletion_requested_at` | timestamptz | Fecha de solicitud de borrado (RTBF) |
| `erased_at` | timestamptz | Fecha efectiva de borrado (post-erasure) |

### Valores posibles para `legal_basis`
- `consent` — consentimiento explícito del interesado (recomendado para leads de anuncios)
- `legitimate_interest` — interés legítimo del responsable (requiere LIA documentado)
- `contract` — ejecución de un contrato
- `legal_obligation` — obligación legal

## 3. Flujo de retención y borrado

### 3.1 Retención automática (cron diario)
El endpoint `GET /api/cron/retention-cleanup` (Bearer $CRON_SECRET) ejecuta:

1. **IP nullification**: `leads.ip = NULL` donde `ip_expires_at < NOW()`
2. **UA nullification**: `leads.user_agent = NULL` donde `ua_expires_at < NOW()`
3. **GDPR erasure**: para leads con `deletion_requested_at IS NOT NULL AND erased_at IS NULL`:
   - `name = "[erased]"`, `email = NULL`, `phone = NULL`, `city = NULL`
   - `ip = NULL`, `user_agent = NULL`, `fbc = NULL`, `fbp = NULL`, `fbclid = NULL`
   - `erased_at = NOW()`

### 3.2 Solicitud de borrado manual (Right to be Forgotten)
Flujo actual (manual, a implementar en UI en v2):
1. Recibir solicitud del lead (email o formulario)
2. Localizar lead por email/teléfono
3. Establecer `deletion_requested_at = NOW()`
4. El cron nocturno ejecuta el borrado físico en la siguiente ejecución
5. Confirmar borrado al solicitante

### 3.3 Borrado de organización completa
No implementado en v1. Requiere:
- Borrado en cascada en todas las tablas con `org_id`
- Confirmación por escrito del owner
- Audit log previo al borrado

## 4. Datos enviados a Meta Conversions API

Cuando se registra una venta, `buildPurchasePayload()` envía a Meta:

| Campo | Valor enviado | Tratamiento |
|-------|---------------|-------------|
| `em` (email) | SHA-256(email.trim().toLowerCase()) | Hashed |
| `ph` (phone) | SHA-256(phone.replace(/\D/g, "")) | Hashed |
| `fn` (first name) | SHA-256(firstName) | Hashed |
| `ct` (city) | SHA-256(city) | Hashed |
| `fbc` | Valor verbatim | Sin hash (Meta lo requiere sin hashear) |
| `fbp` | Valor verbatim | Sin hash |
| `client_ip_address` | IP verbatim (si disponible) | Sin hash (Meta lo requiere sin hashear) |
| `client_user_agent` | UA verbatim (si disponible) | Sin hash |

**Invariante**: el access token de Meta se descifra solo en RAM del servidor para la llamada CAPI; nunca se escribe en logs, respuestas API ni DB en forma descifrada.

## 5. Datos NO enviados a Meta

- Leads importados de Google Sheets (Modo import): **nunca** crean `meta_events`; `runImport()` tiene assertion explícita
- Historial de leads anteriores al onboarding de SyncLead

## 6. Retención de logs

| Log | Retención actual | Notas |
|-----|------------------|-------|
| `audit_logs` | Sin expiración (append-only) | Planificar rotación a 2 años |
| `webhook_events` | 30 días | Cron `/api/cron/cleanup` |
| `wa_provider_events` | Sin expiración | Revisar en v2 |
| Logs de consola (Vercel) | 7–30 días (Vercel policy) | No contienen PII (ver reglas de monitoring.ts) |

## 7. Transferencias internacionales

| Receptor | País | Base legal | Datos transferidos |
|----------|------|------------|-------------------|
| Neon Inc. | USA | SCCs / DPA | Toda la DB (incluyendo PII leads) |
| Vercel Inc. | USA | SCCs / DPA | Código + env vars + logs |
| Meta Platforms | USA | SCCs / DPA | Eventos CAPI (PII hasheada) |
| Upstash | USA | SCCs / DPA | Contadores de rate limit (sin PII) |
| Resend | USA | SCCs / DPA | Email del usuario (para emails transaccionales) |

> ⚠ Si el negocio opera en la UE o con leads europeos, verificar que cada proveedor tenga DPA firmado y SCCs vigentes bajo GDPR Cap. V.

## 8. Decisiones pendientes antes del lanzamiento público

- [ ] Elegir proveedor de error monitoring (Sentry / Axiom / Highlight / Vercel) e integrar en `src/lib/monitoring.ts`
- [ ] Implementar UI de solicitud de borrado para leads
- [ ] Configurar cron `retention-cleanup` en `vercel.json` (schedule: `0 3 * * *`)
- [ ] Documentar y firmar DPA con Neon, Vercel, Meta, Resend
- [ ] Redactar Política de Privacidad y Aviso de Cookies para el sitio
- [ ] Definir base legal formal para cada tipo de tratamiento con asesor jurídico
- [ ] Implementar banner de cookies si se añaden analytics en el marketing site
