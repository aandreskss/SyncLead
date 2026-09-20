# Go-Live Checklist — SyncLead Beta

**Fecha de revisión:** 2026-09-19  
**Decisor final:** Fundador / CTO  
**Criterio:** El lanzamiento se decide por evidencia reproducible, no por que el build compile.

---

## Go / No-Go Table

| # | Categoría | Ítem | Estado | Evidencia | Responsable |
|---|-----------|------|--------|-----------|-------------|
| 1 | **Infraestructura** | `npm run preflight:full` pasa sin errores | ✅ | Ejecutar contra env de producción | DevOps |
| 2 | **Infraestructura** | Migraciones 0000–0011 aplicadas en Neon prod | ⏳ | `drizzle-kit migrate` + `preflight --check-migrations` | DevOps |
| 3 | **Infraestructura** | `ENCRYPTION_KEY` distinto al de staging/dev | ⏳ | Verificar manualmente en Vercel dashboard | DevOps |
| 4 | **Infraestructura** | `CRON_SECRET` configurado en Vercel | ⏳ | `preflight.ts` lo verifica | DevOps |
| 5 | **Infraestructura** | Crons registrados en `vercel.json` | ✅ | `api/cron/*` con `maxDuration=60` | DevOps |
| 6 | **Seguridad** | `META_TEST_EVENT_CODE` ausente en producción | ✅ | `preflight.ts` lo detecta | Automático |
| 7 | **Seguridad** | `ENABLE_EXTERNAL_META_OAUTH=false` | ✅ | `META_CONNECTION_MODE=internal_manual` | Decisión arquitectural |
| 8 | **Seguridad** | Token Meta nunca en respuesta al browser | ✅ | `MetaConnectionPublic` omite `accessTokenEnc`; revisado en PR | Revisión de código |
| 9 | **Seguridad** | `import "server-only"` en `crypto.ts` y `meta-capi.ts` | ✅ | `bundle-safety.test.ts` (3 tests) | CI |
| 10 | **Seguridad** | CSP con nonce activo | ✅ | `proxy.ts` configura headers en cada request | Revisión de código |
| 11 | **Tests** | 817 tests pasando (24 suites) | ✅ | `npx vitest run` — 2026-09-19 | CI |
| 12 | **Tests** | TypeScript 0 errores | ✅ | `npx tsc --noEmit` — 2026-09-19 | CI |
| 13 | **Tests** | Permissions matrix — todos los roles × acciones | ✅ | `permissions-matrix.test.ts` (45 tests) | CI |
| 14 | **Tests** | Aislamiento cross-tenant | ✅ | `auth-isolation.test.ts` (22 tests) | CI |
| 15 | **Tests** | Idempotencia de ventas y CAPI | ✅ | `sale-registration.test.ts` + `meta-outbox.test.ts` | CI |
| 16 | **Tests** | Import: deduplicación y fingerprint | ✅ | `import-idempotency.test.ts` | CI |
| 17 | **Tests** | Job runner: `withJobRun`, timeBudget, correlationId | ✅ | `job-runner.test.ts` (12 tests) | CI |
| 18 | **Observabilidad** | Health dashboard accesible para owner/admin | ✅ | `/dashboard/health` — requires admin+ | Revisión manual |
| 19 | **Observabilidad** | `cron_runs` tabla poblada tras primer cron | ⏳ | Verificar tras deploy: `SELECT * FROM cron_runs LIMIT 5` | DevOps |
| 20 | **Datos** | Seed de lanzamiento ejecutado (opcional: beta interno) | ⏳ | `npm run seed:launch` — idempotente | DevOps |
| 21 | **Meta** | Primera conexión Meta probada con token real | ⏳ | `testMetaConnectionAction()` devuelve `ok: true` | Fundador |
| 22 | **Meta** | Evento Purchase enviado y confirmado en Meta Events Manager | ⏳ | Registrar venta de prueba → verificar en Events Manager | Fundador |
| 23 | **UX** | Registro + onboarding completo sin errores | ⏳ | Prueba manual con email real | QA |
| 24 | **UX** | Ingesta de lead desde formulario externo (Modo A) | ⏳ | Prueba con `browser-form.html` de ejemplo | QA |
| 25 | **Legal** | Política de privacidad publicada | ⏳ | Página `/privacy` en producción | Fundador |
| 26 | **Legal** | Términos de servicio publicados | ⏳ | Página `/terms` en producción | Fundador |
| 27 | **Legal** | DPA con Neon firmado | ⏳ | Proceso manual con Neon support | Legal |

---

## P0 — Bloqueantes de seguridad

Todos resueltos. Sin P0 pendientes al 2026-09-19.

| ID | Problema | Resolución | Commit/PR |
|----|----------|------------|-----------|
| P0-1 | Residuos de Supabase | Removidos; solo Neon + Drizzle | Prompt 11 |
| P0-2 | `CRON_SECRET` no validado | Añadido a `preflight.ts` + `.env.example` | Prompt 21 |
| P0-3 | FK `org_members.user_id` faltante | `→ users.id ON DELETE CASCADE` | Prompt 12 |
| P0-4 | `server-only` no guardado en crypto | `import "server-only"` añadido | Prompt 21 |

---

## P1 — Mejoras importantes (no bloqueantes para beta)

| ID | Problema | Estado | Decisión |
|----|----------|--------|----------|
| P1-1 | Sin tests E2E Playwright | Aceptado | Demasiado costoso antes de beta; agregar en sprint 2 |
| P1-2 | `leads.stage` deprecated, no migrado | Aceptado | Conviven hasta Prompt 14+; `current_stage_id` disponible |
| P1-3 | Sin alertas Slack/email en cron failure | Aceptado | Health dashboard cubre diagnóstico; alertas en sprint 2 |
| P1-4 | `RESEND_API_KEY` no configurado | Opcional | Email desactivado para beta mínimo |
| P1-5 | Política GDPR incompleta (erasure flow) | Aceptado | Campos de consentimiento presentes; UI de erasure en sprint 3 |

---

## Decisiones de no-lanzamiento

**Condiciones que deben triggear NO-GO:**

- Cualquier test falla en CI → **NO-GO hasta fix**
- `preflight.ts --check-db` falla en producción → **NO-GO**
- Token Meta aparece en respuesta API o logs → **NO-GO inmediato + incident**
- `ENABLE_EXTERNAL_META_OAUTH=true` sin App Review aprobado → **NO-GO**
- `META_TEST_EVENT_CODE` presente en producción → **NO-GO**

---

## Instrucciones de verificación

```bash
# 1. Verificar env de producción
npm run preflight:full

# 2. Verificar tests (CI o local)
npx vitest run
npx tsc --noEmit

# 3. Seed de datos beta (opcional)
npm run seed:launch

# 4. Verificar crons tras deploy
# → Ver /dashboard/health → sección "Cron History"

# 5. Verificar aislamiento (manual)
# → Login como owner@savaya.test → no ver datos de callbell.test
# → Login como owner@callbell.test → no ver datos de savaya.test
```
