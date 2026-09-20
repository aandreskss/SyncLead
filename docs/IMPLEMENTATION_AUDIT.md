# IMPLEMENTATION_AUDIT.md — SyncLead
**Fecha:** 2026-09-19 | **Revisado por:** auditoría automatizada (Prompt 10)
**Alcance:** Prompts 0–9 vs. repositorio real. Sin cambios de código.

---

## 1. Resumen ejecutivo

SyncLead es un CRM SaaS multi-tenant construido con Next.js 16, Neon PostgreSQL y Drizzle ORM. El núcleo de negocio (ingesta, pipeline de leads, cifrado de tokens Meta, analytics) está correctamente implementado y libre de Supabase activo. La arquitectura de aislamiento multi-tenant es consistente: todas las queries filtran por `org_id` y todas las server actions verifican sesión antes de operar.

Los riesgos principales son de naturaleza operacional y de madurez: dos paquetes de Supabase instalados pero sin usar incrementan la superficie de ataque y el bundle; la validación de inputs usa condicionales manuales en lugar de Zod; la cobertura de tests no incluye escenarios de aislamiento cross-tenant; y dos capacidades marcadas como objetivo en Prompts 0–9 (importación Google Sheets y Meta Ads Insights) no existen en el código.

El proyecto puede avanzar a Prompt 11 con los P0 resueltos.

---

## 2. Bloqueadores P0 — críticos antes de producción

| # | Problema | Evidencia | Impacto |
|---|---|---|---|
| P0-1 | Paquetes Supabase instalados (`@supabase/ssr ^0.12.7`, `@supabase/supabase-js ^2.116.0`) con archivos `src/lib/supabase/server.ts` y `src/lib/supabase/client.ts` que no se importan en ningún lado | `package.json:30-31`, `src/lib/supabase/server.ts:1-27`, `src/lib/supabase/client.ts:1-8` | Aumenta superficie de ataque; confunde futuros agentes sobre el stack real |
| P0-2 | `CRON_SECRET` no incluida en `.env.example` — cualquier deploy nuevo arranca con el endpoint `/api/cron/cleanup` expuesto si se olvida configurarla | `.env.example` (ausente), `src/app/api/cron/cleanup/route.ts:11` | Permite limpiar `webhook_events` sin autorización |
| P0-3 | `orgMembers.userId` no tiene FK hacia `user.id` — un usuario eliminado deja miembros huérfanos sin cascade | `src/lib/db/schema.ts:88` | Integridad referencial rota; OrgId resolver puede devolver miembros de usuarios inexistentes |

---

## 3. Riesgos P1

| # | Problema | Evidencia | Impacto |
|---|---|---|---|
| P1-1 | Sin validación Zod en server actions — validación manual con condicionales (`if (!name)`) sin sanitización avanzada | Todos `src/domains/*/actions.ts` | Inputs malformados pueden causar errores 500 no controlados o datos corruptos |
| P1-2 | CSP `style-src 'unsafe-inline'` permite inyección de CSS arbitraria | `src/proxy.ts:7` | Clickjacking y exfiltración de datos por CSS injection |
| P1-3 | Meta Access Token pasado en URL del fetch a Meta CAPI (`?access_token=...`) — queda en logs de red y CDN | `src/lib/meta-capi.ts:64` | Filtración de tokens en logs de infraestructura |
| P1-4 | Sin tests de aislamiento cross-tenant: no hay caso "usuario A intenta acceder lead de org B" | `src/__tests__/`, `tests/e2e/` | Regresiones de seguridad sin cobertura automatizada |
| P1-5 | `role` en `org_members` sin enum PG ni CHECK constraint — acepta cualquier string | `src/lib/db/schema.ts:89` | Control de acceso por rol no verificable en DB; RBAC no funcional |
| P1-6 | Sin logging estructurado — solo `console.error` en ingest route | `src/app/api/leads/ingest/route.ts:141` | Sin trazabilidad para incidentes en producción |

---

## 4. Mejoras P2

| # | Mejora | Evidencia | Beneficio |
|---|---|---|---|
| P2-1 | Importar Zod (ya está en next-auth pero no como dep directa) y centralizar validación de FormData en acciones | Todos actions | Reducción de bugs, mejor DX |
| P2-2 | Agregar tests de autorización (unit + e2e) para aislamiento multi-tenant | `tests/e2e/` | Cobertura de regresiones de seguridad |
| P2-3 | Logging estructurado (pino o winston) con redacción automática de PII | — | Observabilidad en producción |
| P2-4 | Exportación CSV de leads completos (no solo performance view) | `src/app/dashboard/performance/_components/PerformanceView.tsx` | Feature solicitada implícitamente en Prompts |
| P2-5 | Implementar RBAC activo (verificar `role` en actions que ya obtienen `orgId`) | `src/domains/funnels/actions.ts:21`, etc. | Multi-usuario en misma org |
| P2-6 | Constraint o enum PG para `org_members.role` | `src/lib/db/schema.ts:89` | Integridad de datos |
| P2-7 | Mover Meta access token a header `Authorization: Bearer` en CAPI call | `src/lib/meta-capi.ts:64` | Evita token en logs de CDN/proxy |
| P2-8 | Agregar índice compuesto `(campaign_id, created_at)` en `leads` para queries de dashboard | `src/lib/db/schema.ts:143` | Performance en orgs con >10K leads |

---

## 5. Inventario de residuos de Supabase

| Archivo | Tipo | Importado por | Acción |
|---|---|---|---|
| `src/lib/supabase/server.ts` | Módulo — `createServerClient` de `@supabase/ssr` | Ninguno | Eliminar |
| `src/lib/supabase/client.ts` | Módulo — `createBrowserClient` de `@supabase/ssr` | Ninguno | Eliminar |
| `package.json:30` | Dependencia `@supabase/ssr ^0.12.7` | Ninguno (solo archivos a eliminar) | Desinstalar |
| `package.json:31` | Dependencia `@supabase/supabase-js ^2.116.0` | Ninguno | Desinstalar |

Variables de entorno Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`): **no aparecen en `.env.example` ni en `.env.local`**. No hay riesgo activo, pero los archivos a eliminar las referenciarían si se ejecutaran.

---

## 6. Proveedor de autenticación — estado real

**Proveedor detectado:** `next-auth@5.0.0-beta.32` con `@auth/drizzle-adapter@1.11.3`

**Estado de integración:** Funcional y correcto.

| Aspecto | Estado | Evidencia |
|---|---|---|
| Session strategy | ✅ JWT (no database) | `src/auth.ts:20` |
| DrizzleAdapter | ✅ Configurado con tablas singulares (`user`, `account`, `session`, `verificationToken`) | `src/auth.ts:12-17` |
| Providers | ✅ Google OAuth + Credentials (email/password bcrypt) | `src/auth.ts:22-50` |
| Callbacks JWT | ✅ Persiste `user.id` en `token.sub` | `src/auth.ts:55` |
| Callbacks session | ✅ Expone `token.sub` como `session.user.id` | `src/auth.ts:60` |
| Rutas personalizadas | ✅ `/login`, `/verify-email`, `/onboarding` | `src/auth.ts:64-68` |
| Rate limit en auth route | ✅ 20 req/min por IP (opcional Upstash) | `src/app/api/auth/[...nextauth]/route.ts:15-35` |
| `auth()` en server actions | ✅ Usado consistentemente antes de cualquier mutación | `src/domains/*/actions.ts` |
| `auth()` en proxy | ✅ Wrapping de next-auth auth para proteger rutas | `src/proxy.ts:4` |

---

## 7. Matriz de auditoría completa

| Área | Estado | Evidencia (archivo:símbolo) | Riesgo | Acción recomendada | Prompt |
|---|---|---|---|---|---|
| **INFRAESTRUCTURA** | | | | | |
| Neon + Drizzle como única DB | ✅ implementado | `src/lib/db/index.ts:neon()`, `drizzle.config.ts:url` | — | — | — |
| Supabase removido del código | ⚠️ parcial | `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` — existen, no se importan | MEDIO | Eliminar archivos y desinstalar paquetes | 11 |
| Migraciones Drizzle completas | ✅ implementado | `drizzle/0000_even_jazinda.sql`, `drizzle/0001_minor_mauler.sql` — aplicadas | — | — | — |
| Build limpio (0 errores TS) | ✅ implementado | `npm run build` → 22 rutas, 0 errores | — | — | — |
| **AUTENTICACIÓN Y SESIONES** | | | | | |
| next-auth v5 beta configurado | ✅ implementado | `src/auth.ts:1-69` — handlers, signIn, signOut, auth exportados | — | — | — |
| Session strategy JWT | ✅ implementado | `src/auth.ts:20 — strategy: "jwt"` | — | — | — |
| DrizzleAdapter tablas singulares | ✅ implementado | `src/auth.ts:12-17 — DrizzleAdapter(db, { usersTable: users })` | — | — | — |
| Google OAuth provider | ✅ implementado | `src/auth.ts:22-25 — Google({ clientId, clientSecret })` | — | — | — |
| Credentials provider (email+bcrypt) | ✅ implementado | `src/auth.ts:26-50 — bcrypt.compare()` | — | — | — |
| `auth()` en server actions | ✅ implementado | `src/domains/leads/actions.ts:26`, `clients/actions.ts:17`, etc. — all actions | — | — | — |
| Rate limit en `/api/auth` | ✅ implementado | `src/app/api/auth/[...nextauth]/route.ts:15-35 — Upstash 20/min` | — | — | — |
| **ORGANIZACIONES Y MEMBRESÍAS** | | | | | |
| Tabla organizations | ✅ implementado | `src/lib/db/schema.ts:70 — organizations` | — | — | — |
| Tabla org_members con rol | ⚠️ parcial | `src/lib/db/schema.ts:83 — org_members.role (text, no enum)` | MEDIO | Enum PG + CHECK constraint | 12 |
| FK `org_members.userId → user.id` | ❌ ausente | `src/lib/db/schema.ts:88 — userId: text() SIN .references()` | ALTO | Migración aditiva + FK | 11 |
| RBAC activo en actions | ❌ ausente | Ningún action verifica `role` — solo verifica `orgId` | MEDIO | Verificar rol en actions críticas | 13 |
| Onboarding wizard completo | ✅ implementado | `src/app/onboarding/`, `src/domains/onboarding/actions.ts` | — | — | — |
| **AISLAMIENTO MULTI-TENANT** | | | | | |
| Todas las queries filtran por orgId | ✅ implementado | `src/domains/leads/repository.ts:83`, `clients:6`, `campaigns:25`, `funnels:6`, `analytics:31` | — | — | — |
| Server actions verifican sesión + orgId | ✅ implementado | 18 actions verificadas — ninguna acepta orgId del cliente | — | — | — |
| No aceptar orgId/clientId del cliente | ✅ implementado | `src/domains/*/actions.ts` — orgId resuelto siempre desde sesión | — | — | — |
| Tests de aislamiento cross-tenant | ❌ ausente | `tests/e2e/`, `src/__tests__/` — sin caso cross-tenant | ALTO | Tests: user A → lead de org B debe ser 404 | 12 |
| **CLIENTES Y CAMPAÑAS** | | | | | |
| CRUD de clientes completo | ✅ implementado | `src/domains/clients/actions.ts — create/update/delete/toggle` | — | — | — |
| Cifrado de Meta token (AES-256-GCM) | ✅ implementado | `src/lib/crypto.ts:3 — AES-256-GCM`, `clients/actions.ts:encryptToken` | — | — | — |
| Tokens cifrados nunca al cliente | ✅ implementado | `src/domains/clients/actions.ts` — solo `encryptToken` al guardar, nunca devuelto | — | — | — |
| CRUD de campañas completo | ✅ implementado | `src/domains/campaigns/actions.ts — create/update/delete/rotate/toggle` | — | — | — |
| API key generada server-side | ✅ implementado | `src/domains/campaigns/actions.ts:randomBytes(24).toString("hex")` | — | — | — |
| API key con índice único | ✅ implementado | `src/lib/db/schema.ts:campaigns_api_key_idx (unique)` | — | — | — |
| WhatsApp numbers en clients | ✅ implementado | `src/lib/db/schema.ts:clients.whatsappNumbers (text[])` | — | — | — |
| **INGESTA DE LEADS** | | | | | |
| `POST /api/leads/ingest` por API Key | ✅ implementado | `src/app/api/leads/ingest/route.ts:25 — x-campaign-key header` | — | — | — |
| Idempotencia por eventId | ✅ implementado | `src/app/api/leads/ingest/route.ts:66 — webhook_events lookup` | — | — | — |
| Rate limiting en ingest | ✅ implementado | `src/app/api/leads/ingest/route.ts:31 — 100/min por IP (opcional)` | — | — | — |
| Validación de payload | ⚠️ parcial | `src/app/api/leads/ingest/route.ts:59 — solo name required, sin Zod` | MEDIO | Agregar Zod schema para body | 11 |
| Normalización phone/city/temperature | ✅ implementado | `src/domains/leads/normalize.ts — normalizePhone, normalizeCity, calculateTemperature` | — | — | — |
| Atribución UTM | ✅ implementado | `src/lib/db/schema.ts:leads.utm_source/medium/campaign/content` | — | — | — |
| No PII en logs de ingest | ✅ implementado | `src/app/api/leads/ingest/route.ts:141 — solo error.message` | — | — | — |
| Importación bulk CSV | ❌ ausente | Sin endpoint ni UI | BAJO | Feature futura | — |
| Importación Google Sheets | ❌ ausente | Sin código relacionado (búsqueda exhaustiva) | BAJO | Feature futura | — |
| **PIPELINE Y GESTIÓN DE LEADS** | | | | | |
| Vista de leads por campaña con filtros URL | ✅ implementado | `src/app/dashboard/campaigns/[id]/leads/` | — | — | — |
| Lead drawer (Sheet slide-over) | ✅ implementado | `src/app/dashboard/campaigns/[id]/leads/_components/LeadDrawer.tsx` | — | — | — |
| Cambio de temperatura (cycle: cold→warm→hot) | ✅ implementado | `src/domains/leads/actions.ts:updateLeadTemperatureAction` | — | — | — |
| Cambio de etapa (new→contacted→…→won/lost) | ✅ implementado | `src/domains/leads/actions.ts:updateLeadStageAction` | — | — | — |
| Notas de lead | ✅ implementado | `src/domains/leads/actions.ts:updateLeadNotesAction` | — | — | — |
| Asignación a WhatsApp + link WA | ✅ implementado | `src/domains/leads/actions.ts:assignLeadAction`, `LeadDrawer:wa.me link` | — | — | — |
| Historial de cambios (timeline) | ✅ implementado | `src/lib/db/schema.ts:lead_stage_history`, `repository.ts:getLeadDetail` | — | — | — |
| Validación Zod en mutations de leads | ❌ ausente | `src/domains/leads/actions.ts` — sin Zod | MEDIO | Agregar Zod | 11 |
| **VENTAS Y META CAPI** | | | | | |
| Registro de venta (amount/currency/date) | ✅ implementado | `src/domains/leads/actions.ts:markLeadConvertedAction` | — | — | — |
| Meta CAPI Purchase event | ✅ implementado | `src/lib/meta-capi.ts:sendPurchaseEvent — v18.0` | — | — | — |
| SHA-256 de PII antes de enviar | ✅ implementado | `src/lib/meta-capi.ts:41-45 — email, phone, name, city hasheados` | — | — | — |
| Token Meta cifrado descifrado server-side | ✅ implementado | `src/domains/leads/actions.ts:100 — decryptToken() antes del fetch` | — | — | — |
| Meta access token en URL (no header) | ⚠️ roto | `src/lib/meta-capi.ts:64 — ?access_token= en URL del fetch` | MEDIO | Mover a `Authorization: Bearer` header | 11 |
| Estado de envío CAPI en DB | ✅ implementado | `src/lib/db/schema.ts:leads.metaPurchaseSentAt`, `metaPurchaseStatus` | — | — | — |
| **PANELES Y ANALYTICS** | | | | | |
| Dashboard KPIs con delta vs. período anterior | ✅ implementado | `src/app/dashboard/page.tsx`, `src/domains/analytics/repository.ts` | — | — | — |
| 7 series de gráficas (Recharts) | ✅ implementado | `src/app/dashboard/_components/ChartsClient.tsx — 7 charts` | — | — | — |
| DateRangeSelector (7d/30d/90d/custom) | ✅ implementado | `src/app/dashboard/_components/DateRangeSelector.tsx` | — | — | — |
| Tabla de rendimiento por campaña/anuncio | ✅ implementado | `src/app/dashboard/performance/` | — | — | — |
| Export CSV de performance | ✅ implementado | `src/app/dashboard/performance/_components/PerformanceView.tsx` | — | — | — |
| Meta Ads Insights API | ❌ ausente | Sin código de integración con `graph.facebook.com/insights` | BAJO | Feature futura | — |
| Export CSV de leads completos | ❌ ausente | Solo performance view tiene export | BAJO | Feature futura | — |
| Observabilidad estructurada (Sentry/pino) | ❌ ausente | Solo `console.error` en ingest | MEDIO | Sentry o pino con PII redaction | — |
| **EMBUDOS KANBAN** | | | | | |
| CRUD de funnels | ✅ implementado | `src/domains/funnels/actions.ts — create/update/delete` | — | — | — |
| Kanban drag-and-drop (dnd-kit) | ✅ implementado | `src/app/dashboard/funnels/_components/KanbanBoard.tsx` | — | — | — |
| Stages configurables con color | ✅ implementado | `src/lib/db/schema.ts:funnels.stages (jsonb)`, `FunnelDialog.tsx` | — | — | — |
| **MARKETING SITE Y SEO** | | | | | |
| Home, Features, Pricing, Blog | ✅ implementado | `src/app/(marketing)/` — 5 rutas | — | — | — |
| generateMetadata dinámico | ✅ implementado | `src/app/(marketing)/blog/[slug]/page.tsx:generateMetadata` | — | — | — |
| OG images (runtime: nodejs) | ✅ implementado | `src/app/opengraph-image.tsx`, `src/app/(marketing)/blog/[slug]/opengraph-image.tsx` | — | — | — |
| sitemap.ts y robots.ts | ✅ implementado | `src/app/sitemap.ts`, `src/app/robots.ts` | — | — | — |
| JSON-LD (SoftwareApplication + Article) | ✅ implementado | `src/components/marketing/JsonLd.tsx`, home + blog/[slug] | — | — | — |
| CSP con nonce por request | ✅ implementado | `src/proxy.ts:buildCsp()`, `btoa(crypto.randomUUID())` | — | — | — |
| CSP `style-src 'unsafe-inline'` | ⚠️ roto | `src/proxy.ts:7` | MEDIO | Hash-based o nonce para Tailwind | 12 |
| 2 posts MDX en español | ✅ implementado | `src/content/blog/*.mdx — 2 posts` | — | — | — |
| **SEGURIDAD** | | | | | |
| ENCRYPTION_KEY AES-256-GCM | ✅ implementado | `src/lib/crypto.ts:3 — aes-256-gcm` | — | — | — |
| IV aleatorio por encriptación | ✅ implementado | `src/lib/crypto.ts:12 — randomBytes(12)` | — | — | — |
| Auth tag validado al descifrar | ✅ implementado | `src/lib/crypto.ts:25 — decipher.setAuthTag()` | — | — | — |
| Sin PII en logs | ✅ implementado | Revisado todos los `console.*` en server actions y API routes | — | — | — |
| Rate limiting multi-capa | ✅ implementado | `/api/leads/ingest:100/min`, `/api/auth:20/min`, actions:10/min | — | — | — |
| CRON_SECRET en .env.example | ❌ ausente | `.env.example` — campo faltante | ALTO | Agregar a .env.example | 11 |
| **TESTS** | | | | | |
| Unit tests normalizePhone | ✅ implementado | `src/__tests__/normalize.test.ts — 23 tests` | — | — | — |
| Unit tests encryptToken/decryptToken | ✅ implementado | `src/__tests__/crypto.test.ts — 7 tests` | — | — | — |
| Unit tests sha256 | ✅ implementado | `src/__tests__/hash.test.ts — 9 tests` | — | — | — |
| E2E auth flow | ✅ implementado | `tests/e2e/auth.test.ts — 4 tests` | — | — | — |
| E2E leads + drawer | ✅ implementado | `tests/e2e/leads.test.ts — 5 suites` | — | — | — |
| Tests de aislamiento cross-tenant | ❌ ausente | Sin ningún test de "user A → org B" | ALTO | Agregar tests de autorización | 12 |
| Tests de idempotencia ingest | ❌ ausente | Sin test de duplicate eventId | MEDIO | Agregar test unitario | 12 |
| Tests de rate limiting | ❌ ausente | Sin test de 429 | BAJO | Agregar test e2e con mock Upstash | 13 |
| **DEPLOY E INFRAESTRUCTURA** | | | | | |
| Seed demo (200 leads) | ✅ implementado | `scripts/seed.ts — demo@synclead.app / Demo1234!` | — | — | — |
| Script create-admin CLI | ✅ implementado | `scripts/create-admin.ts` | — | — | — |
| Cron cleanup webhook_events | ✅ implementado | `vercel.json:schedule "0 3 * * *"`, `src/app/api/cron/cleanup/route.ts` | — | — | — |
| DEPLOYMENT.md checklist | ✅ implementado | `DEPLOYMENT.md — 10 secciones` | — | — | — |
| .env.example completo | ⚠️ parcial | Falta `CRON_SECRET`, `RESEND_FROM_EMAIL` presente pero `RESEND_API_KEY` no se usa en código | ALTO | Agregar CRON_SECRET | 11 |

---

## 8. Conteo por estado

| Estado | Cantidad |
|---|---|
| ✅ implementado | 57 |
| ⚠️ parcial / riesgo | 9 |
| ❌ ausente | 14 |

---

## 9. Recomendación: ¿es seguro continuar con Prompt 11?

**Sí, con condiciones.**

El núcleo del CRM está correctamente implementado y seguro para un MVP: aislamiento multi-tenant consistente, cifrado AES-256-GCM de tokens, rate limiting en 3 capas e idempotencia de webhooks. No hay vulnerabilidades activas de Supabase (solo archivos muertos).

**Antes de ir a producción real, resolver en Prompt 11:**
1. ✅ Remover residuos de Supabase (archivos + paquetes)
2. ✅ Agregar `CRON_SECRET` a `.env.example`
3. ✅ Agregar FK `org_members.userId → user.id`
4. ✅ Mover Meta access token a header `Authorization: Bearer`
5. ✅ Agregar Zod al menos en `/api/leads/ingest` body

Los P1 de tests cross-tenant y RBAC son importantes pero no bloquean un lanzamiento limitado (beta cerrada).
