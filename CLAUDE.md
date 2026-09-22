@AGENTS.md

# CLAUDE.md — SyncLead

CRM SaaS para gestión de leads de Meta Ads. Multi-tenant con aislamiento a nivel de aplicación.

## Reglas de trabajo

Estás trabajando sobre el repositorio existente de SyncLead. La arquitectura oficial usa Neon PostgreSQL y Drizzle ORM; Supabase está descartado.

1. Lee primero CLAUDE.md, package.json, drizzle.config.*, el esquema Drizzle, las migraciones, la configuración de autenticación, middleware/proxy, variables de entorno, rutas API, Server Actions y pruebas relacionadas con esta tarea.
2. No asumas que los prompts anteriores se implementaron bien. Informa brevemente qué ya existe, qué está incompleto y qué modificarás.
3. Conserva el código funcional. Haz cambios incrementales y migraciones aditivas; no borres tablas, columnas ni datos sin un plan de backfill, compatibilidad temporal y rollback.
4. No ejecutes migraciones destructivas contra producción. Genera la migración, pruébala en una base aislada y deja instrucciones para aplicarla.
5. No inventes secrets ni uses credenciales reales. Actualiza `.env.example` con valores de ejemplo y documenta qué variables son obligatorias.
6. Toda operación que acceda a datos de negocio debe obtener el usuario desde una sesión verificada en el servidor, resolver su membresía activa y limitar la consulta por `org_id`. Nunca confíes en `org_id`, `client_id`, rol o email enviados por el navegador.
7. No uses Supabase, `auth.uid()` ni clientes Supabase. Si encuentras residuos de Supabase, repórtalos y retíralos únicamente cuando exista un reemplazo funcional y probado.
8. Usa transacciones para cambios que deban ser atómicos. Añade constraints e índices en la base, no solo validaciones de UI.
9. Valida entradas con Zod. No registres tokens, API keys, cookies, emails, teléfonos, IP completas ni payloads con PII en logs.
10. Evita `any`, errores silenciados y respuestas que filtren detalles internos. Mantén separación entre código server-only y cliente.
11. Antes de terminar ejecuta los comandos disponibles de formato, lint, typecheck, pruebas y build. Si alguno falla por una causa previa, demuéstralo y no lo ocultes.
12. Entrega al final: archivos modificados, migraciones generadas, pruebas ejecutadas, resultados, variables nuevas, pasos manuales y riesgos pendientes. No hagas commit ni deploy salvo que se te pida expresamente.
13. **Checklist pre-push obligatorio para cambios de schema**: Antes de hacer push a producción, verificar siempre:
    - (a) Toda tabla nueva en `schema.ts` tiene su migración SQL generada (`npx drizzle-kit generate`) y aplicada en Neon (`npx drizzle-kit push`).
    - (b) Todo `many(X)` en un bloque `relations()` tiene su bloque `relations(X, ...)` inverso declarado en el mismo schema. La ausencia del inverso no da error de TypeScript — falla silenciosamente en runtime causando React error #441 en producción (ver commit `49063ee`).
    - (c) Ejecutar `npx drizzle-kit push --dry-run` (o `studio`) para confirmar que no hay diferencias pendientes entre el schema Drizzle y la DB de Neon.

## Ruta local
`C:\Users\Andre\OneDrive\Documentos\Claude\Projects\SyncLead`

## Repo GitHub
`https://github.com/aandreskss/SyncLead.git`

## Stack
- **Next.js 16** App Router + TypeScript + Server Actions
- **Neon Postgres** — base de datos (sin Supabase)
- **Auth.js v5** (next-auth@beta) — auth con email/password + Google OAuth
- **Drizzle ORM** con driver `@neondatabase/serverless` (neon-http)
- **Tailwind v4** + **shadcn/ui** (zinc base, CSS variables)
- **Recharts** — gráficas
- **Resend** — emails transaccionales
- **Upstash Redis** — rate limiting
- **AES-256-GCM** — cifrado versionado de tokens Meta en DB (`src/lib/crypto.ts`); rotación por `ENCRYPTION_KEY_VERSION`
- **Cloudflare Turnstile** — bot protection para formularios públicos (opcional)
- **Vercel** — deploy automático desde rama `main`

## Decisiones críticas (no revertir)
- Supabase descartado — solo Neon + Drizzle
- Auth.js v5 con DrizzleAdapter (tablas: `user`, `account`, `session`, `verificationToken` — nombres en singular)
- `organizations.owner_id` es `text` (referencia a `user.id` de Auth.js, que usa text no UUID)
- **Next.js 16 usa `proxy.ts` en lugar de `middleware.ts`** — el archivo en `src/proxy.ts`
- `useActionState` en Next.js 16 / React 19 requiere firma `(prevState, formData)` en las server actions
- `db/index.ts` usa URL de fallback para build-safety — neon() no conecta hasta la primera query
- No hay `.dark` class en el body — el dashboard usa colores zinc-* explícitos en cada componente
- Auth.js session strategy: **jwt** (no database) — obligatorio para que `proxy.ts` pueda leer la sesión sin DB round-trip
- Rate limiting Upstash **siempre opcional**: `getRedis()` devuelve `null` si vars no están configuradas, todos los callers verifican null antes de usar
- **No RLS**: neon-http usa PgBouncer en modo transaction — session-level vars no persisten entre transacciones. Aislamiento garantizado vía `WHERE org_id = ?` en todas las queries (ver `docs/AUTHORIZATION.md`)
- **neon-http no soporta transacciones interactivas** — usar orden de operaciones idempotente; operaciones non-fatal con `.catch(() => undefined)`
- **Motor de calificación v2 (Prompt 16B)**: precedencia `campaign.profileId → client published profile → org-wide published profile → savaya_v1 rule set → sin evaluación`. Perfiles publicados son inmutables — editar requiere duplicar. `effective_qual_class` en leads = `manual?.qualClass ?? automatic?.qualClass ?? null`
- **`condition-evaluator` usa `OPERATORS_BY_TYPE[dataType]`** (el mapa estático de `profile-types.ts`), NO los `allowedOperators` del field registry. `is_empty`/`is_not_empty` NO están en `ENUM_OPERATORS` — para esos operadores usar campos de tipo `text` (ej: `negocio_normalized`, `city_canonical`)
- **`import "server-only"`** en `crypto.ts`, `meta-capi.ts`, `audit.ts` — garantía en tiempo de compilación de que estos módulos no entran al bundle del navegador
- **VERCEL_ENV vs NODE_ENV**: Vercel pone `NODE_ENV=production` en todos los deploys (incluyendo preview). El check correcto es `NODE_ENV !== "production" || VERCEL_ENV === "preview"`. En `worker.ts`, `test_event_code` se añade solo si esa condición es verdadera.
- **`META_CONNECTION_MODE=internal_manual`** — único modo funcional durante beta. `external_oauth` bloqueado hasta App Review de Meta aprobado.
- **`action_source: "crm"` para eventos Purchase**: ventas registradas manualmente en SyncLead usan `action_source: "crm"` (no `"website"`). `"website"` se conserva solo en `sendLeadEvent()` y `sendContactEvent()`. Ver `src/domains/conversions/payload.ts` y `src/lib/meta-capi.ts`.
- **Meta Lead Ads webhook**: single endpoint `/api/webhook/meta-leads` con routing multi-tenant via tabla `meta_lead_ad_sources`. El campo `(page_id, form_id)` mapea a `(campaign_id, org_id)`. Si `form_id` es null en la tabla, acepta cualquier form del page. Webhook retorna 200 inmediatamente; todo el procesamiento es fire-and-forget. Idempotencia via `webhook_events(campaign_id, event_id)` donde `event_id = leadgen_id`.
- **Page Access Token para Lead Ads**: token separado del token CAPI — requiere permisos `leads_retrieval + pages_manage_ads`. Se cifra con `encryptTokenVersioned()` igual que los tokens CAPI. Se usa SOLO para llamar `GET /{apiVersion}/{leadgen_id}?fields=field_data,created_time` en la Graph API.
- **`leadSource` values**: `"meta_ads"` para leads del webhook Lead Ads, `"manual"` para leads creados manualmente desde el dashboard. `"form"` para ingest Modo A/B.
- **Leads manuales no tienen `fbc`/`fbp`**: solo PII matching cuando se registra venta. No hay `externalEventId` ni `metaCampaign*` fields. `leadSource: "manual"` sirve como señal para filtros/badges.
- **`mapMetaFields()` en webhook**: normaliza campos Meta → SyncLead. Maneja `full_name` ó `first_name`+`last_name`, `phone_number`/`phone`, `city`/`ciudad`, negocio variants (`negocio`, `tiene_negocio`, `business`, `servicio`).
- **Semántica de fechas en métricas**: "Leads creados" filtra por `leads.created_at`; "Ventas del periodo" e "Ingresos del periodo" filtran por `conversions.converted_at`. Nunca mezclar las dos fechas en un mismo cálculo.
- **`null` = N/D (dato no disponible); `0` = cero real** — ROAS, convRate y KPIs mixtos devuelven `null` cuando la moneda no es uniforme o no hay datos suficientes, no `0`.
- **CSV formula injection**: sanitizar valores que empiecen con `=`, `+`, `-`, `@`, `\t`, `\r` añadiendo un prefijo `'` antes de serializar. Ver `sanitizeCsv()` en `PerformanceView.tsx`.
- **Import idempotencia**: `dedupeKey = SHA-256(fileHash:sheetName:rowIndex)` — mismo archivo importado dos veces → 0 filas nuevas. `fingerprint = SHA-256(orgId:campaignId:name.lower:phone_nospaces:fecha)` — mismo lead en archivo distinto → detectado como duplicado.
- **Conversiones importadas NUNCA crean meta_events** — `runImport()` en `processor.ts` no llama CAPI. Solo ventas registradas manualmente desde el drawer generan eventos CAPI.
- **`withJobRun(jobName, fn)`** — wrapper obligatorio para todos los crons. Registra cada ejecución en `cron_runs`. Si el insert inicial falla, el job igual corre (non-fatal). `correlationId` = UUID, nunca PII.
- **`isOverBudget(-1)`** para tests de "siempre excedido" — evita flakiness en entornos rápidos.
- **`drizzle-kit push` para sincronización de schema**: `npx drizzle-kit migrate` puede reportar éxito sin crear todas las tablas cuando `__drizzle_migrations` no existe o está desincronizado. Usar `npx drizzle-kit push` para comparar el schema Drizzle actual contra la DB y aplicar diferencias directamente. Verificar tablas tras migrar: 48 tablas en Neon después de sync completo.
- **Drizzle relaciones: siempre declarar ambos lados**: Al añadir `many(X)` en un `relations()`, SIEMPRE añadir el `relations()` inverso para la tabla X. Si falta el lado inverso, Drizzle lanza un error en runtime al ejecutar CUALQUIER query relacional que toque ese schema — no solo las que usan la relación faltante — causando React error #441 (server component crash) en producción. El fix es añadir el bloque `relations(X, ({ one }) => ({ ... }))` correspondiente. Ver commit `49063ee`: `leadStageHistoryRelations` faltaba porque `leadsRelations` tenía `stageHistory: many(leadStageHistory)` sin su inverso.
- **`drizzle.config.ts` requiere dotenv**: `drizzle-kit` no carga `.env.local` automáticamente. Añadir `import { config } from "dotenv"; config({ path: ".env.local" })` al inicio del archivo; sin esto los comandos drizzle-kit leen `DATABASE_URL` como `undefined`.
- **`createOrgAction` DEBE llamar `ensureOwnerMembership()`**: `provisionOrganization()` crea la org pero no inserta en `org_members`. `requireOrganizationMembership()` solo consulta `org_members`, por lo que sin este insert todos los usuarios nuevos son redirigidos al onboarding en un bucle infinito. Ver `src/app/onboarding/actions.ts`.
- **`authorize` en `auth.ts` DEBE tener try/catch**: Si la DB no está disponible y `authorize` lanza una excepción, Auth.js muestra "There was a problem with the server configuration" en lugar de un error manejable. Envolver todo el cuerpo de `authorize` en try/catch y devolver `null` ante cualquier error de DB.
- **`verifyMetaConnection` no bloquea por errores 100/200 del pixel read**: Los tokens de CAPI no requieren `ads_read` scope para enviar eventos; solo verificar que el token sea válido (error 190/102 = inválido). Si el pixel read falla con 100/200 (permisos de lectura), proceder igual — el token puede enviara CAPI sin leer metadatos del pixel.
- **`registerAction` usa dos bloques try/catch separados**: El bloque DB (crear usuario) y el bloque `signIn` deben estar separados. `signIn()` de Auth.js lanza un error especial con `digest.startsWith("NEXT_REDIRECT")` que DEBE ser re-lanzado — usar el helper `isRedirectError()` para detectarlo antes de capturarlo.
- **`import_rows.dedupe_key` requiere `.notNull().unique()`**: `onConflictDoNothing({ target: importRows.dedupeKey })` necesita un índice único en Postgres o rechaza el INSERT con "no unique constraint matching the ON CONFLICT specification". La columna debe tener `.notNull().unique()` en el schema Drizzle y el constraint aplicado en DB via `drizzle-kit push`.
- **Design system del dashboard usa clases `sg-*`**: El dashboard usa CSS custom properties definidas en `globals.css` (sg-app, bg-sg-bg, sg-border, sg-accent, sg-s1/s2/s3, sg-ink, sg-muted, sg-subtle, sg-radius). Nuevos componentes del dashboard deben usar estas clases, no `zinc-*` directamente. El componente `DashboardNav` en `src/components/app/DashboardNav.tsx` es el nav principal del dashboard.
- **`startTransition(async () => {...})` requiere try/catch explícito**: React 19 silencia excepciones lanzadas dentro de transitions asíncronas. Sin try/catch, errores de server actions desaparecen sin mostrar nada al usuario. Siempre envolver el body async en try/catch y manejar el error con `setError(...)`.
- **Server actions complejas deben retornar `{ success, error? }` y NO lanzar**: Envolver el body principal en try/catch y devolver `{ success: false, error: "..." }` en lugar de propagar la excepción. Lanzar desde una server action causa que el cliente reciba un error genérico no manejable. Ver `registerSaleAction` y `updateLeadInfoAction`.
- **`loadAll` en LeadDrawer usa `Promise.allSettled`**: Si una de las 5 acciones paralelas falla (p.ej. `fetchLeadDetailAction` por error de relación Drizzle), las demás deben igualmente completarse. Con `Promise.all`, un fallo cancela todo y `allConversions` queda vacío. Usar siempre `Promise.allSettled` en cargas de drawer/panel con múltiples acciones independientes.
- **Queries de leads en server actions deben especificar `columns: {}`**: `db.query.leads.findFirst()` sin filtro de columnas genera SELECT de todas las columnas — si el schema Drizzle tiene columnas que no existen aún en Neon, la query falla. En acciones que solo necesitan campos específicos, usar `columns: { id: true, campaignId: true, ... }` para aislar el impacto del schema drift.
- **`leadStageHistoryRelations` es obligatoria en schema.ts**: `leadsRelations` tiene `stageHistory: many(leadStageHistory)`. Drizzle requiere que exista `leadStageHistoryRelations` con `lead: one(leads, ...)` en la otra punta, o lanza "There is not enough information to infer relation 'leads.stageHistory'" en tiempo de ejecución.
- **`meta_connections.send_lead_events` / `send_contact_events`**: Booleanos (default false) que controlan si se disparan auto-eventos Lead (al ingestar) y Contact (al cambiar stage a "contacted"). Agregados como columnas en Neon via SQL directo (`ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS ...`) porque `drizzle-kit push` bloqueó por prompt TTY interactivo en el ambiente CI/no-TTY.
- **`LeadWithActivity` agrega TODAS las ventas confirmadas**: `saleCount` = total de conversiones confirmadas; `saleTotalAmount` = suma si moneda uniforme, `null` si mixta; `saleCurrency` = moneda si uniforme. Reemplazó los campos anteriores `saleAmount / saleStatus / saleConvertedAt` (que solo reflejaban la primera conversión). El filtro `has_sale` usa `saleCount > 0`.
- **`LeadWithActivity.hasPendingCapi`**: booleano cargado en TODAS las consultas (4ª query paralela en `getLeadsByCampaignWithActivity`). Indica que el lead tiene al menos un `meta_event` con `status = 'pending' OR 'retrying'`. Activa el icono ⚡ en `ActivityBadges` y el filtro `pending_capi`. En `getLeadsByClientWithActivity` y `funnels/repository.ts` siempre se devuelve como `false` (no se cargan eventos CAPI en esas vistas).
- **Eliminar leads**: tres acciones multi-tenant en `leads/actions.ts` — `deleteLeadsAction(ids[])` (por selección), `deleteLeadsByCampaignAction(campaignId)`, `deleteLeadsByClientAction(clientId)`. Todas validan pertenencia a `ctx.orgId` antes de borrar. La DB hace cascade en `lead_stage_history`, `conversions`, `lead_qualifications`, etc.; `meta_events.leadId` queda en `NULL` (set null) para no perder el historial CAPI.
- **`drizzle-kit push` puede bloquearse por prompts TTY**: cuando la CLI detecta cambios que podrían ser destructivos (ej. añadir UNIQUE constraint a tabla con datos), pide confirmación interactiva. En entornos no-TTY usar SQL directo via `neon()` client. Para agregar columnas simples con DEFAULT, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` siempre es seguro.
- **`calculateTemperature()` eliminado de todos los flujos de ingest**: los tres ingest paths (Modo A `/api/ingest/form`, Modo B `/api/ingest/server`, legacy `/api/leads/ingest`) guardan `temperature: "cold"` y delegan a `autoQualifyLeadInternal()` fire-and-forget. La función `calculateTemperature` aún existe en `normalize.ts` para no romper imports que no se han migrado, pero no se debe invocar en código nuevo.
- **`autoQualifyLeadInternal` tiene try/finally como red de seguridad absoluta**: el bloque `finally` siempre consulta la tabla `conversions` al terminar (incluso si la función sale con `return` anticipado). Si existe una conversión con `status = "confirmed"`, fuerza `temperature = "hot"`. Esto garantiza que ningún camino de calificación pueda dejar en frío a un lead que ya compró. La guarda `ne(leads.temperature, "hot")` en el `finally` evita writes innecesarios.

## Arquitectura multi-tenant
Aislamiento a nivel de aplicación (no RLS). **Todas las tablas tienen `org_id`.**
Jerarquía: `Organization → Clients → Campaigns → Leads`

### Capa de autorización (`src/lib/auth/server.ts` — server-only)
Todas las mutations y páginas autenticadas pasan por estas funciones. **Nunca confiar en `org_id`, rol ni `client_id` del request.**

| Función | Garantía |
|---|---|
| `requireUser()` | Sesión JWT válida; `userId` del token — nunca del body |
| `requireOrganizationMembership()` | `orgId` y `role` de `org_members` en DB |
| `requireRole(roles[])` | Lo anterior + role del usuario dentro del array |
| `requireClientAccess(clientId)` | Membresía + `clients.org_id = ctx.orgId` |
| `requireCampaignAccess(campaignId)` | Membresía + `campaigns.org_id = ctx.orgId` |

Errores: `AuthError` (401) → redirect `/login`, `ForbiddenError` (403) → redirect `/onboarding`, `NotFoundError` (404) → `{ error }`.

Roles (enum `member_role`): `owner > admin > manager > agent > viewer`

Ver matriz completa en `docs/AUTHORIZATION.md`.

## Dominio del negocio
- Usuarios de Meta Ads capturan leads vía landing pages externas
- Cada usuario gestiona múltiples clientes (marcas/negocios)
- Leads entran por tres fuentes:
  - `POST /api/ingest/form` — Modo A: token público para formularios de navegador
  - `POST /api/ingest/server` — Modo B: API key secreta para servidor a servidor
  - `POST /api/webhook/meta-leads` — Meta Lead Ads webhook (GET verify + POST process)
  - `POST /api/leads/ingest` — **@deprecated**: sigue funcionando, migrar a Modo B
  - Creación manual desde el dashboard (campaña o cliente)
- El `meta_access_token` se cifra AES-256-GCM antes de guardarse en DB
- Al marcar venta: server action llama a Meta Conversions API con evento `Purchase`
- Datos PII (email, phone, name, city) se hashean SHA-256 antes de enviar a Meta

## Ingesta de leads — dos modos

### Modo A — Formulario público (`/api/ingest/form`)
- Credencial tipo `public_form` (token `pub_xxx`) — **seguro en HTML/JS del cliente**
- Protecciones: Cloudflare Turnstile (configurable), honeypot, timestamp mínimo (3s), CORS + origin allowlist por credencial, rate limit 20 req/min por token+IP anonimizada
- Header: `X-Ingest-Token: pub_xxx`
- Bot rechazado → respuesta 200 silenciosa (no enseña qué check falló)

### Modo B — Servidor a servidor (`/api/ingest/server`)
- Credencial tipo `server_secret` (key `slk_xxx`) — **nunca en código de navegador**
- Almacenada solo como SHA-256 hash en `ingestion_credentials.key_hash`
- Header: `Authorization: Bearer slk_xxx`
- Rate limit 1000 req/min por credencial

### Compartido (ambos modos)
- Credencial resuelve `org_id` y `campaign_id` en DB — nunca del body
- Zod valida payload; URLs solo aceptan `http://` y `https://`
- IP y User-Agent solo de headers del servidor (nunca del body)
- IP anonimizada para rate limit y storage: último octeto IPv4, /48 en IPv6
- Idempotencia atómica: `INSERT webhook_events ON CONFLICT DO NOTHING` (unique index `campaign_id + event_id`)
- Persiste: lead + `lead_attribution_touchpoints` (first_touch) + `lead_activities` (created)
- `rawPayload` en `webhook_events` no contiene PII (solo metadatos de auditoría)
- Retención: `ip_expires_at` y `ua_expires_at` en leads (90 días), cron los nullifica

## Estructura de carpetas
```
src/
  app/
    (auth)/login|register|verify-email  ← páginas públicas de auth
    (marketing)/                        ← home, features, pricing, blog
    dashboard/
      layout.tsx                        ← requireOrganizationMembership + getOrganizationById + enlace Health para admin+
      page.tsx                          ← KPIs (leads/ventas/ingresos por converted_at)
      clients/
        page.tsx + _components/         ← CRUD clientes
        [id]/page.tsx + _components/    ← MetaConnectionPanel + MetaInsightsPanel + QualificationProfilesPanel + SalesTeamPanel + WhatsAppConfigPanel
      campaigns/
        page.tsx + _components/         ← CRUD campañas
        [id]/leads/
          page.tsx + _components/       ← LeadsView (+ LeadAdsPanel + CreateLeadDialog) + LeadDrawer (AssignmentPanel + WhatsAppPanel + VentaPanel + CAPIPanel)
      performance/
        page.tsx + _components/         ← tabla rendimiento + SummaryCards + CSV export con sanitizeCsv
      funnels/
        page.tsx + _components/         ← Kanban dnd-kit (tabla funnels deprecated; rollback optimista)
      import/
        page.tsx + _components/         ← ImportWizard (upload → ColumnMapper → DryRunPreview → ImportProgress)
      health/
        page.tsx                        ← SSR; requireRole owner/admin
        _components/HealthDashboard.tsx ← status dots, CAPI queue, imports, cron history, botones retry
    api/
      ingest/
        form/route.ts                   ← Modo A: token público, CORS, Turnstile, honeypot
        server/route.ts                 ← Modo B: Authorization Bearer, hash lookup
      behavior/route.ts                 ← POST: eventos de comportamiento (begin_checkout/checkout_abandoned/add_to_cart/remove_from_cart/form_submitted/info_requested/view_product/payment_failed/purchase); auth: Bearer pub_xxx; CORS wildcard; escribe en lead_behavior_events; idempotente con externalId; evento "purchase" → temperature=hot directo (awaited, sin motor de calificación)
      leads/ingest/route.ts             ← @deprecated: legacy X-Campaign-Key adapter; temperature="cold" (calculateTemperature eliminado); llama autoQualifyLeadInternal fire-and-forget
      auth/[...nextauth]/route.ts       ← Auth.js handler
      webhook/whatsapp/[clientId]/route.ts ← webhook proveedor WA (verificación de firma)
      webhook/meta-leads/route.ts         ← GET: hub.verify_token challenge; POST: HMAC-SHA256 verify + processEntries fire-and-forget
      cron/
        cleanup/route.ts                ← limpia webhook_events >30 días
        meta-outbox/route.ts            ← procesa cola CAPI (batchSize param, maxDuration=60)
        meta-insights-sync/route.ts     ← sync diario de ad_insights_daily
        retention-cleanup/route.ts      ← nullifica IP/UA expirados; borra PII de erasure requests
  domains/
    auth/           actions.ts
    organizations/  repository.ts
    clients/        repository.ts, actions.ts, types.ts
    campaigns/      repository.ts, actions.ts, types.ts
    leads/
      normalize.ts  ← normalizePhone, normalizeCity (calculateTemperature eliminado — no se usa en ningún flujo de ingest)
      repository.ts ← getLeadsByCampaign, getLeadsByCampaignWithActivity (4 queries: leads+conversions+behavior+metaEvents pending/retrying), getLeadDetail, updateLeadTemperature/Stage/Notes/assign; LeadWithActivity: saleCount/saleTotalAmount/saleCurrency/hasPendingCapi/activity
      actions.ts    ← mutations + writeAuditLog (temperature.change, stage.change, assign); updateLeadInfoAction retorna { success, error? }; deleteLeadsAction(ids[]), deleteLeadsByCampaignAction(campaignId), deleteLeadsByClientAction(clientId); createLeadManuallyAction(campaignId, input)
    analytics/
      types.ts      ← Metric = number | null, DashboardKPIs, PerformanceRow
      repository.ts ← getKPIMetrics() (converted_at), getPerformanceTable(), getLeadsByDay(), getLeadsByCampaignChart()
      actions.ts    ← logCsvExportAction (audit log de exportaciones)
    conversions/
      schema.ts     ← RegisterSaleSchema (Zod v4): amount>0, currency 3-char uppercase, orderId
      payload.ts    ← buildPurchasePayload(): PII hash SHA-256, event_id = purchase_{conversionId}
      repository.ts ← createConversionIdempotent(), createMetaEventIdempotent(), cancelConversion(), etc.
      actions.ts    ← registerSaleAction() (body en try/catch → retorna error en lugar de lanzar; queries de leads/campaigns con columns selectivos; temperature=hot es AWAITED — no fire-and-forget), fetchConversionStatusAction(), getAllConversionsByLeadAction(), retryCAPIAction(), cancelConversionAction()
    qualification/
      types.ts, normalize.ts, engine.ts, repository.ts, actions.ts  ← motor v1 Savaya
      profile-types.ts, field-registry.ts, condition-evaluator.ts, score-engine.ts  ← motor v2 genérico (field-registry incluye sys_ecom_purchased — campo boolean para evento purchase)
      profile-repository.ts, profile-actions.ts  ← CRUD perfiles + 13 Server Actions; getEventDataForLead() incluye ecom_purchased
    funnels/
      repository.ts, actions.ts ← CRUD funnels (deprecated, migrar a pipelines)
    meta/
      repository.ts ← CRUD meta_connections
      verify.ts     ← verifyMetaConnection(), sendTestLeadEvent() — server-only
      actions.ts    ← saveMetaConnectionAction, testMetaConnectionAction, disconnectMetaConnectionAction
    meta-insights/
      types.ts      ← InsightsRow, KPIMetrics, SyncOptions
      allowlist.ts  ← isAdAccountAllowed() (DB allowlist + env META_ALLOWED_AD_ACCOUNTS)
      kpi.ts        ← computeKPIs() — null si monedas mixtas (seguridad ROAS)
      sync-engine.ts ← syncAdInsights() con lock via lockedUntil/lockedBy en meta_sync_runs
      catalog-sync.ts ← syncCampaignCatalog(), syncAdsetCatalog(), syncAdCatalog()
      actions.ts    ← getInsightsAction, triggerManualSyncAction, getAllowlistAction, etc.
    import/
      types.ts      ← SHEET_COLUMNS (25 cols Savaya), ColumnMapping, ParsedRow, DryRunResult
      parser.ts     ← parseFile (XLSX/CSV), buildDedupeKey, buildFingerprint, applyMapping, validateParsedRow
      mapper.ts     ← autoDetectMapping (regex aliases), getMissingRequiredFields
      repository.ts ← CRUD batches/rows, findImportedRowByFingerprint
      processor.ts  ← runDryRun, runImport (batches de 50) — NUNCA llama Meta CAPI
      actions.ts    ← uploadImportFileAction, confirmImportAction, getBatchStatusAction, etc.
    team/
      types.ts, repository.ts, actions.ts ← CRUD vendedores (salesReps) por cliente
    whatsapp/
      types.ts      ← IWhatsAppProvider (interfaz sin implementación concreta aún)
      repository.ts ← getWaClientConfig, getMessageTemplates, CRUD wa_messages
      actions.ts    ← prepareWaLinkAction, confirmWaSentAction, handleProviderWebhookAction
    lead-ads/
      repository.ts ← getLeadAdSourceByCampaign, getLeadAdSourceByPage (webhook routing), upsertLeadAdSource, deleteLeadAdSource
      actions.ts    ← saveLeadAdSourceAction (cifra Page Access Token), deleteLeadAdSourceAction, getLeadAdSourceAction
    health/
      repository.ts ← getHealthSnapshot(orgId): DB ping, meta connections, CAPI queue, imports, cron runs, stuck runs
      actions.ts    ← retryFailedCapiEventsAction(), retryFailedImportAction(batchId), resolveStuckCronRunsAction()
  lib/
    auth/
      errors.ts     ← AuthError, ForbiddenError, NotFoundError
      server.ts     ← requireUser, requireOrganizationMembership, requireRole, requireClientAccess, requireCampaignAccess
    ingest/
      schema.ts, lookup.ts, normalize.ts, bot.ts, persist.ts
    jobs/
      runner.ts     ← withJobRun(jobName, fn): registra en cron_runs, captura error.name (no message), isOverBudget(ms)
      registry.ts   ← JOB_REGISTRY: 4 jobs con schedule, maxDurationSec, timeBudgetMs (buffer ≥ 5000ms)
    meta-ads/
      client.ts     ← MetaAdsClient con retry/backoff (mocked en tests)
    meta-outbox/
      classify.ts   ← classifyMetaErrorCode() / classifyHttpStatus(): permanent vs retryable
      backoff.ts    ← computeBackoff() exponencial con jitter ±20%
      worker.ts     ← sendMetaEventDirect(), processOneMetaEvent() (claim atómico), processMetaOutbox()
    db/             index.ts (drizzle + fallback URL), schema.ts
    crypto.ts       ← import "server-only"; encryptTokenVersioned/decryptTokenVersioned (v{n}:iv:tag:data)
    meta-capi.ts    ← import "server-only"; sendPurchaseEvent() — errores sanitizados
    audit.ts        ← import "server-only"; writeAuditLog(entry), redactIp()
    redact.ts       ← redactForLog(), safeErrorSummary(), publicErrorBody(), looksLikeSecret()
    monitoring.ts   ← stub con PROVIDER_HOOK comments (Sentry/Axiom/Highlight — pendiente de integrar)
    redis.ts        ← getRedis() — null si UPSTASH_* no configurados
    utils.ts        ← cn()
  __tests__/
    __mocks__/server-only.ts          ← no-op mock para Vitest (alias en vitest.config.ts)
    ingest-schema.test.ts             ← 28 tests validación Zod ingest
    ingest-security.test.ts           ← 35 tests honeypot/timing/IP/origin/idempotencia
    auth-isolation.test.ts            ← 22 tests cross-tenant negativos
    crypto.test.ts                    ← 22 tests AES-256-GCM, auth tag, rotación
    conversion-payload.test.ts        ← 30 tests PII hash, event_id, amount, sin test_event_code
    meta-outbox.test.ts               ← 32 tests classify, backoff, worker, tenant isolation
    qualification-engine.test.ts      ← 116 tests normalizers, evaluateLead, aliases, accents
    qualification-condition-evaluator.test.ts ← operadores por tipo
    qualification-score-engine.test.ts ← scoring, clamp, stop_processing, 5 fixtures
    analytics-metrics.test.ts         ← 31 tests semántica fechas, N/D vs cero
    team-assignment.test.ts           ← assignment CRUD, isCurrent constraint
    whatsapp-manual.test.ts           ← flujo manual link_prepared→marked_shared
    whatsapp-provider.test.ts         ← webhook dedupeKey, estado transitions
    import-parser.test.ts             ← 75 tests parseDate/parseBoolean/parseAmount/dedupeKey/fingerprint
    import-idempotency.test.ts        ← 51 tests idempotencia, duplicados, Meta CAPI safety
    security-headers.test.ts          ← 27 tests redactForLog, safeErrorSummary, looksLikeSecret, redactIp
    bundle-safety.test.ts             ← server-only guards, NEXT_PUBLIC_ isolation
    job-runner.test.ts                ← 12 tests registry invariants, withJobRun, isOverBudget, correlationId
    permissions-matrix.test.ts        ← 45 tests roles×acciones (owner/admin/manager/agent/viewer)
    sale-registration.test.ts         ← 18 tests RegisterSaleSchema, idempotency contract, currency isolation
scripts/
  seed.ts           ← seed básico (original)
  seed-launch.ts    ← seed de lanzamiento beta: 2 orgs completas (Savaya + Callbell), idempotente
  preflight.ts      ← verifica 12 env vars + --check-db + --check-migrations; exit 0/1
  create-admin.ts   ← crea usuario admin interactivo
docs/
  AUTHORIZATION.md         ← decisión RLS, roles, matriz permisos
  DATA_MODEL.md            ← ER diagram, tablas, índices críticos
  IMPLEMENTATION_AUDIT.md  ← P0/P1/P2 findings (histórico)
  QUALIFICATION_ENGINE.md  ← motor genérico: árbol condiciones, scoring, ejemplos
  METRICS_DICTIONARY.md    ← definiciones métricas: fórmula, tabla fuente, campo de tiempo
  THREAT_MODEL.md          ← 17 amenazas/mitigaciones, actores, superficies, riesgos aceptados
  PRIVACY_RETENTION.md     ← inventario PII, consentimiento, flujo erasure, DPA pendientes
  RUNBOOKS.md              ← 7 runbooks: Meta caída, token vencido, cron atascado, cola, migración, import, cifrado
  OPERATIONS_RUNBOOK.md    ← procedimientos day-2: onboarding, monitoreo, mantenimiento, gestión usuarios
  ENVIRONMENT_MATRIX.md    ← dev/preview/prod: vars, CAPI behavior, branching, rotación de key
  GO_LIVE_CHECKLIST.md     ← 27 ítems con Go/No-Go table, P0/P1, instrucciones de verificación
  META_INSIGHTS_INTERNAL_BETA.md ← acceso, limitaciones, flujo de sync
  META_CONNECTION_MODES.md ← internal_manual vs external_oauth
  meta-oauth-future.md     ← arquitectura OAuth futura (no implementado)
  examples/
    browser-form.html, server-node.ts, server-curl.sh
src/components/
  ui/  button, input, label, card, separator, badge, dialog, textarea, sheet
  app/
    DashboardNav.tsx  ← nav principal del dashboard (sidebar + links + org info)
  landing/
    CapiDemo.tsx, Hero.tsx, InView.tsx, KanbanDemo.tsx, LandingNav.tsx, Logo.tsx, Reveal.tsx, Sections.tsx
    Analytics.tsx, ProductTabs.tsx, Steps.tsx, data.ts, ui.tsx
src/proxy.ts  ← protege /dashboard/*, applySecurityHeaders() (CSP+nonce, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy)
```

## Convenciones
- **Server Actions** para todas las mutations (no API routes internas)
- **API routes** solo para: ingest externo, auth, cron
- Drizzle ORM para todas las queries
- `ZodError.issues` — no `.errors` (alias no disponible en la versión instalada)
- shadcn components en `src/components/ui/` — instalados manualmente (CLI es interactiva en v4)
- Forms en dashboard: inputs con `className` explícito dark (border-zinc-700, bg-zinc-800) — no CSS vars
- Mutations en modales: `useTransition` + `router.refresh()` al cerrar (no `useActionState`)
- Delete con confirmación inline: estado `confirmDeleteId` en el componente, sin AlertDialog separado
- `client?.id ?? "new"` como `key` en ClientDialog (y lo mismo en CampaignDialog) para forzar re-mount
- Filtros de leads via URL searchParams: LeadsView usa `useRouter().push()` + `useSearchParams()`
- LeadDrawer: `loadAll()` usa `Promise.allSettled` (5 acciones independientes) al abrir; `router.refresh()` solo en onClose
- Mutations del drawer: `useTransition` + optimistic local state; `router.refresh()` solo en onClose
- `ConversionPanel` siempre muestra botón "Registrar venta" + historial integrado de todas las conversiones (no bloqueado por conversión existente)
- Temperature cycle: cold → warm → hot → cold con un click en el badge
- Assign WhatsApp: abre `https://wa.me/{num}?text=...` + llama `assignLeadAction`; segundo click deselecciona

## Tipos de leads (schema)
- `temperature`: `"hot" | "warm" | "cold"` — todos los leads entran como `"cold"`; la calificación automática (`autoQualifyLeadInternal`) es la única que sube la temperatura. Jerarquía de promoción: venta confirmada → hot siempre; evento `purchase` → hot; regla v2/v1 → según resultado; engagement (checkout/form/cart) → warm si aún cold. **Nunca se degrada desde hot**: `refreshEffectiveQualClass` y el bloque `finally` de `autoQualifyLeadInternal` usan `ne(leads.temperature, "hot")` como guard.
- `stage`: `"new" | "contacted" | "interested" | "quoted" | "won" | "lost"` — **@deprecated**, usar `current_stage_id` + `pipeline_stages`
- Historial en tabla `lead_stage_history`: field (temperature/stage/assignedTo), fromValue, toValue, changedBy, changedAt

## Columnas y tablas deprecated (mantener hasta Prompt 14+)
| Tabla | Columna/Tabla | Reemplazada por |
|---|---|---|
| `campaigns` | `api_key` | `ingestion_credentials.key_hash` |
| `leads` | `stage`, `assigned_to`, `assigned_at`, `notes`, `converted`, `event_id` | tablas v2 |
| `clients` | `meta_pixel_id`, `meta_access_token_enc`, `meta_dataset_id` | `meta_connections` |
| `funnels` | tabla completa | `pipelines` + `pipeline_stages` |

## Variables de entorno (.env.local — nunca en repo)
| Variable | Descripción | Requerida |
|---|---|---|
| `AUTH_SECRET` | Secret de Auth.js (generar con `npx auth secret`) | ✓ |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID | OAuth |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret | OAuth |
| `DATABASE_URL` | Neon Postgres connection string (pooler, sslmode=require) | ✓ |
| `ENCRYPTION_KEY` | 64 hex chars = 32 bytes para AES-256-GCM (versión 1) | ✓ |
| `ENCRYPTION_KEY_VERSION` | Versión activa de clave (default 1). Para rotar: añadir `ENCRYPTION_KEY_2` y poner `2` | opcional |
| `ENCRYPTION_KEY_2` | Clave de rotación (64 hex). Solo necesaria si `ENCRYPTION_KEY_VERSION=2` | rotación |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL (rate limiting) | opcional |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | opcional |
| `RESEND_API_KEY` | API key de Resend | email |
| `RESEND_FROM_EMAIL` | From address | email |
| `CRON_SECRET` | Protege todos los endpoints `/api/cron/*` (generar: `openssl rand -hex 32`) | ✓ |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile server secret (bot protection Modo A) | opcional |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (en landing pages) | opcional |
| `META_GRAPH_API_VERSION` | Versión de Meta Graph API (default `v19.0`) | opcional |
| `META_TEST_EVENT_CODE` | Código de evento de prueba Meta — **NUNCA en producción** | no-prod |
| `META_OUTBOX_MAX_ATTEMPTS` | Máximo de intentos antes de dead-letter en meta_events (default 8) | opcional |
| `META_CONNECTION_MODE` | `internal_manual` (único modo funcional) \| `external_oauth` (bloqueado) | ✓ |
| `ENABLE_EXTERNAL_META_OAUTH` | `false` — bloquear hasta App Review aprobado | ✓ |
| `META_ALLOWED_AD_ACCOUNTS` | Lista separada por comas de ad_account_id autorizados para beta | opcional |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app | ✓ |
| `META_LEAD_ADS_VERIFY_TOKEN` | Token para verificar webhook Meta Lead Ads (generar: `openssl rand -hex 20`) | Lead Ads |
| `META_APP_SECRET` | App Secret de la Meta App para verificar `X-Hub-Signature-256` (Meta → Settings → Basic) | Lead Ads |

## Seguridad crítica
- `ENCRYPTION_KEY` nunca en el repo. Solo en Vercel env vars.
- **Token Meta nunca sale del servidor**: no en props, no en HTML, no en respuesta API, no en logs. Se descifra solo en server actions para llamar CAPI o verificar con Meta.
- `MetaConnectionPublic` (tipo retornado al browser) omite `accessTokenEnc` y `keyVersion`.
- Al guardar conexión Meta: token se verifica con Meta primero, luego se cifra con `encryptTokenVersioned()`. Tras guardar no se puede recuperar.
- Cifrado versionado: `v{n}:iv:tag:ciphertext`. `keyVersion` en `meta_connections` indica qué clave usó. Rotación: añadir `ENCRYPTION_KEY_N` + actualizar `ENCRYPTION_KEY_VERSION`.
- Errores de Meta CAPI sanitizados: códigos numéricos internos, nunca raw `error.message` de la API.
- **Credencial Modo A** (`pub_xxx`): segura en HTML/JS del cliente — es revocable y rate-limited
- **Credencial Modo B** (`slk_xxx`): NUNCA en código cliente — solo en env vars del servidor del cliente. Almacenada como SHA-256 hash
- Rate limiting: Modo A 20/min por token+anonIP, Modo B 1000/min por credencial, legacy 100/min por IP
- URLs en ingest solo aceptan `http://` y `https://` (Zod refine)
- `org_id` siempre resuelto desde la sesión (auth layer) o desde la credencial (ingest) — nunca del body
- Audit log en `audit_logs` para: `meta_connection.created`, `meta_connection.disconnected`, `lead.temperature.change`, `lead.stage.change`, `lead.assign`
- **`import "server-only"`** en `crypto.ts`, `meta-capi.ts`, `audit.ts` — garantía de compilación contra leaks al bundle del navegador
- **Meta Ads Insights beta**: acceso restringido por allowlist de ad accounts (`meta_ad_account_allowlist` + `META_ALLOWED_AD_ACCOUNTS`). `ENABLE_EXTERNAL_META_OAUTH=false` hasta App Review.
- **Importaciones CSV**: conversiones importadas nunca crean `meta_events`. La opción de backfill CAPI está deshabilitada.
- `META_TEST_EVENT_CODE` en producción es un error de seguridad — `preflight.ts` lo detecta y falla el deploy.

## Scripts npm
```bash
npm run dev              # desarrollo
npm run build            # build de producción
npm run lint             # ESLint
npx tsc --noEmit         # typecheck
npx vitest run           # unit tests (910 tests en 24 suites)
npm run preflight        # verifica env vars obligatorias (exit 0/1)
npm run preflight:full   # también verifica DB y migraciones aplicadas
npm run seed:launch      # seed beta: 2 orgs completas (idempotente)
npm run seed             # seed básico original
npm run create-admin     # crea usuario admin
npx drizzle-kit generate # generar migración SQL
npx drizzle-kit migrate  # aplicar migraciones (requiere DATABASE_URL en env)
npx drizzle-kit push     # sincronizar schema Drizzle → DB directamente (sin migraciones; usar cuando __drizzle_migrations está desincronizado)
npx drizzle-kit studio   # UI visual de la DB
```

## Estado del proyecto
- [x] Fase 0: Scaffold + schema Drizzle + estructura de carpetas
- [x] Fase 1: Auth + onboarding wizard
- [x] Fase 2: Gestión de clientes (CRUD, cifrado token, toggle activo)
- [x] Fase 3: Ingesta de leads (POST /api/leads/ingest + campaigns CRUD + ApiKeyModal)
- [x] Fase 4: Vista y gestión de leads (LeadsView + LeadDrawer + filtros URL)
- [x] Fase 5: Registro de ventas + Meta CAPI Purchase
- [x] Fase 6: Dashboards y gráficas (Recharts, KPIs, deltas, streaming)
- [x] Fase 7: Rendimiento de anuncios (`/dashboard/performance`)
- [x] Fase 8: Embudos Kanban (`/dashboard/funnels`, dnd-kit, tabla `funnels` deprecated)
- [x] Fase 9: Marketing site + SEO (MDX blog, sitemap, OG images, CSP con nonce)
- [x] Fase 10: Tests + launch (vitest, playwright, seed, create-admin, cron, DEPLOYMENT.md)
- [x] Prompt 11: Modelo de datos v2
  - [x] 18 nuevas tablas: `meta_connections`, `ingestion_credentials`, `pipelines`, `pipeline_stages`, `lead_notes`, `lead_activities`, `sales_reps`, `lead_assignments`, `lead_attribution_touchpoints`, `qualification_rule_sets`, `lead_qualifications`, `conversions`, `meta_events`, `ad_insights_daily`, `meta_sync_runs`, `import_batches`, `import_rows`, `audit_logs`
  - [x] 11 enums PostgreSQL (`member_role`, `meta_connection_status`, `ingestion_credential_type`, etc.)
  - [x] FK `org_members.user_id → user.id` añadida (P0 fix)
  - [x] Migración `drizzle/0002_nifty_serpent_society.sql` + backfill aplicada
  - [x] `docs/DATA_MODEL.md` — ER diagram, tablas, columnas deprecated, índices críticos
  - [x] `src/__tests__/ingest-schema.test.ts` — 28 tests de validación Zod
- [x] Prompt 12: Capa de autorización multi-tenant
  - [x] `src/lib/auth/errors.ts` — AuthError, ForbiddenError, NotFoundError
  - [x] `src/lib/auth/server.ts` — 5 funciones server-only (requireUser, requireOrganizationMembership, requireRole, requireClientAccess, requireCampaignAccess)
  - [x] Todos los Server Actions migrados a `requireOrganizationMembership()` (leads, clients, campaigns, funnels)
  - [x] `dashboard/layout.tsx` — funciona para todos los roles (no solo owner)
  - [x] `src/__tests__/auth-isolation.test.ts` — 22 tests negativos cross-tenant
  - [x] `docs/AUTHORIZATION.md` — decisión RLS, jerarquía roles, matriz permisos
- [x] Prompt 13: Ingesta segura — Modo A (formulario) y Modo B (servidor)
  - [x] `src/lib/ingest/schema.ts` — LeadDataSchema, FormPayloadSchema (honeypot/_t/Turnstile), ServerPayloadSchema; URLs solo http/https
  - [x] `src/lib/ingest/lookup.ts` — lookupCredential() con SHA-256 hash lookup
  - [x] `src/lib/ingest/normalize.ts` — normalizeLeadData, extractTrustedIp/UA, anonymizeIp, isOriginAllowed
  - [x] `src/lib/ingest/bot.ts` — verifyTurnstile, checkHoneypot, checkSubmitTime
  - [x] `src/lib/ingest/persist.ts` — persistLead() idempotente: lead + first_touch + activity; no PII en rawPayload
  - [x] `src/app/api/ingest/form/route.ts` — Modo A completo con CORS, OPTIONS, bot protection
  - [x] `src/app/api/ingest/server/route.ts` — Modo B con Authorization Bearer
  - [x] `src/app/api/leads/ingest/route.ts` — adaptador deprecated conservado
  - [x] Schema: `ingestion_credentials.allowed_origins text[]`, unique index `webhook_events(campaign_id, event_id)`
  - [x] Migración `drizzle/0003_curved_doorman.sql` aplicada
  - [x] `src/__tests__/ingest-security.test.ts` — 35 tests (honeypot, timing, IP, origin, payloads, idempotencia)
  - [x] `docs/examples/browser-form.html`, `server-node.ts`, `server-curl.sh`
- [x] Prompt 14: Conexión Meta por cliente y ciclo de credenciales
  - [x] `src/lib/crypto.ts` — formato versionado `v{n}:iv:tag:ciphertext`; `encryptTokenVersioned()` / `decryptTokenVersioned()`; fallback legacy; rotación via `ENCRYPTION_KEY_VERSION` + `ENCRYPTION_KEY_N`
  - [x] `src/__tests__/crypto.test.ts` — 11 → 22 tests: auth tag manipulation, wrong key, no plaintext en ciphertext, round-trip versioned, rotación a v2, tokens v1 aún válidos tras rotar
  - [x] `src/lib/meta-capi.ts` — hardcoded `v18.0` → `META_GRAPH_API_VERSION` env var; errores sanitizados (sin raw API messages)
  - [x] `src/domains/meta/repository.ts` — CRUD para `meta_connections` (multi-tenant safe)
  - [x] `src/domains/meta/verify.ts` — `verifyMetaConnection()` (token + pixel read), `sendTestLeadEvent()` — server-only, error codes sin mensajes raw
  - [x] `src/domains/meta/actions.ts` — `saveMetaConnectionAction` (verifica → cifra → guarda), `testMetaConnectionAction`, `disconnectMetaConnectionAction`; `MetaConnectionPublic` nunca incluye `accessTokenEnc`; audit log en `audit_logs`
  - [x] `src/app/dashboard/clients/[id]/page.tsx` — página de detalle de cliente con `requireClientAccess`
  - [x] `src/app/dashboard/clients/[id]/_components/MetaConnectionPanel.tsx` — health screen: estado, test, desconectar, formulario de nueva conexión con password input
  - [x] `src/app/dashboard/clients/page.tsx` — auth migrada a `requireOrganizationMembership()` + nombre clickeable → detalle
  - [x] `src/domains/leads/actions.ts` — `markLeadConvertedAction` migrado de `client.metaPixelId/metaAccessTokenEnc` (deprecated) → `meta_connections` WHERE `status='active'`; usa `decryptTokenVersioned`
  - [x] `.env.example` — `META_GRAPH_API_VERSION`, `META_TEST_EVENT_CODE`, `ENCRYPTION_KEY_VERSION`, `ENCRYPTION_KEY_2` (comentado)
  - [x] `docs/meta-oauth-future.md` — arquitectura OAuth futura documentada (no implementada): flujo, token lifecycle, env vars, restricciones de seguridad, archivos a crear
- [x] Prompt 15: Registro de ventas con outbox persistente (conversions + meta_events)
  - [x] `src/domains/conversions/schema.ts` — `RegisterSaleSchema` (Zod v4): amount, currency ISO-4217, orderId, convertedAt, notes
  - [x] `src/domains/conversions/payload.ts` — `buildPurchasePayload()`: PII hash SHA-256 (email/phone/name/city normalizado), fbc/fbp/ip/UA verbatim; `event_id = purchase_{conversionId}` (estable); `event_time` de `convertedAt`; sin `test_event_code` en payload
  - [x] `src/lib/meta-outbox/classify.ts` — `classifyMetaErrorCode()` / `classifyHttpStatus()`: permanent (190,102,200,273,100) vs retryable
  - [x] `src/lib/meta-outbox/backoff.ts` — `computeBackoff()` exponencial con jitter ±20%; `DEFAULT_MAX_ATTEMPTS` de env `META_OUTBOX_MAX_ATTEMPTS` (default 8)
  - [x] `src/domains/conversions/repository.ts` — `createConversionIdempotent()` (ON CONFLICT on orgId+orderId), `createMetaEventIdempotent()` (ON CONFLICT on eventId), `cancelConversion()`, `cancelPendingMetaEvents()`, `syncLeadConvertedFields()`, getters
  - [x] `src/lib/meta-outbox/worker.ts` — `sendMetaEventDirect()` (sin lock, post-registro inmediato), `processOneMetaEvent()` (claim atómico UPDATE subquery), `processMetaOutbox(batchSize)` — valida `events_received > 0`; `test_event_code` solo cuando `NODE_ENV !== 'production'`
  - [x] `src/domains/conversions/actions.ts` — `registerSaleAction()` (flujo transaccional: conversion → meta_event → sync → activity → audit → send inmediato), `fetchConversionStatusAction()`, `retryCAPIAction()`, `cancelConversionAction()`; `CAPIStatusPublic` / `ConversionStatusPublic` (sin PII)
  - [x] `src/app/api/cron/meta-outbox/route.ts` — cron endpoint con `Bearer ${CRON_SECRET}`; `maxDuration=60`; `batchSize` param (max 200)
  - [x] `src/app/dashboard/campaigns/[id]/leads/_components/LeadDrawer.tsx` — reescrito: panel venta registrada + panel estado CAPI separados; retry button; `orderId` con UUID default; estados: pending/processing/retrying/sent/failed/skipped/cancelled
  - [x] `src/domains/leads/actions.ts` — `markLeadConvertedAction` eliminado (reemplazado por `registerSaleAction`); imports huérfanos limpiados
  - [x] `drizzle/0004_meta_event_status_v2.sql` — añade valores al enum: `processing`, `retrying`, `cancelled`
  - [x] `src/__tests__/conversion-payload.test.ts` — 30 tests: normalizers, hashIfPresent, buildPurchasePayload (PII hash, verbatim fields, campos vacíos omitidos, event_id estable, amount como number, sin test_event_code)
  - [x] `src/__tests__/meta-outbox.test.ts` — 32 tests: classifyMetaErrorCode, classifyHttpStatus, computeBackoff, sendMetaEventDirect (not_found/already_sent/no_conn/decrypt_error/success/events_received=0/permanent/retryable/tenant isolation), processOneMetaEvent (concurrencia found:false, pixelId null, no connection, success, permanent, retry, dead-letter, tenant isolation)
  - [x] `.env.example` — `META_OUTBOX_MAX_ATTEMPTS=8`
  - [x] Criterio de salida: una caída de Meta no pierde la venta y un retry no duplica el evento lógico
- [x] Prompt 16: Motor de calificación automática y override manual
  - [x] `src/domains/qualification/types.ts` — `QualificationClass`, `QualificationType`, `QualificationInputs`, `QualificationEvaluation`, `SavayaRulesV1`, `isSavayaRulesV1()` type guard (acepta `unknown`)
  - [x] `src/domains/qualification/normalize.ts` — `removeAccents()` (NFD), `canonicalize()` (accents→lower→trim→null), `normalizeYesNo()` (YES_FORMS + NO_FORMS sets + regex prefix `/^si\b/` `/^no\b/`), `normalizeCityCanonical()` (CITY_ALIAS_MAP: dtf/ccs→caracas, mcbo/zulia→maracaibo, vlc/carabobo→valencia, barqui/lara→barquisimeto, mcay/aragua→maracay, puerto ordaz/guayana/bolivar→ciudad guayana, tachira→san cristobal)
  - [x] `src/domains/qualification/engine.ts` — `evaluateLead()` dispatch + `evaluateSavayaV1()`: null negocio→unqualified, no→cold, si+priorityCity→hot, si+other→warm, si+null city→warm
  - [x] `src/domains/qualification/repository.ts` — `getActiveRuleSetByClientId()` (client-scoped › org-wide fallback), `createQualification()` + `refreshEffectiveQualClass()`, `getQualificationsForLead()`, `getEffectiveQualification()`, rule set CRUD
  - [x] `src/domains/qualification/actions.ts` — `autoQualifyLeadInternal()` (fire-and-forget, no auth requerida), `submitManualQualificationAction()`, `evaluateLeadAction()`, `previewBatchReEvaluationAction()`, `applyBatchReEvaluationAction()` (preserva manual overrides), `createRuleSetAction()`, `listRuleSetsAction()`
  - [x] Schema `leads`: +`negocio_raw`, `negocio_normalized`, `city_canonical`, `effective_qual_class` (cache manual??automatic); index `leads_effective_qual_class_idx`
  - [x] Schema `lead_qualifications`: +`qual_class`, `qual_type`, `reasons jsonb`, `inputs jsonb`, `note`, `actor_id`; relaciones `leadQualificationsRelations` + `qualificationRuleSetsRelations`
  - [x] `drizzle/0005_qualification_engine.sql` — migración aditiva (IF NOT EXISTS)
  - [x] `src/lib/ingest/normalize.ts` — `NormalizedLead` + `negocioRaw`, `negocioNormalized`, `cityCanonical`; importa `normalizeYesNo` + `normalizeCityCanonical`
  - [x] `src/lib/ingest/persist.ts` — almacena `negocioRaw/Normalized/cityCanonical` en leads; dispara `autoQualifyLeadInternal()` fire-and-forget
  - [x] `src/__tests__/qualification-engine.test.ts` — 116 tests: removeAccents, canonicalize, normalizeYesNo (50 variants), normalizeCityCanonical (aliases+fallback), isSavayaRulesV1, evaluateLead (unqualified/cold/hot/warm, aliases, empty city, accent variants, empty priorityCities)
  - [x] Criterio de salida: se puede explicar por qué un lead fue clasificado y con qué versión de reglas
- [x] Prompt 16B: Motor de calificación genérico basado en score — configurable por cliente
  - [x] `src/domains/qualification/profile-types.ts` — tipos completos: `ConditionLeaf`, `ConditionGroup`, `QualificationRule`, `QualificationProfile`, `ProfileEvaluationResult`, operadores por tipo (text/number/boolean/date/enum/multi_select), Zod schemas, `buildSavayaRuleInputs()`, helpers (`clampScore`, `scoreToClass`, `getVisibleLabel`, `validateConditionTreeDepth`)
  - [x] `src/domains/qualification/field-registry.ts` — 24 `SYSTEM_FIELD_DEFINITIONS` con categorías identity/location/business/attribution/device/ecommerce; `ALL_FIELD_CATEGORIES`, `FIELD_DEFINITION_MAP`
  - [x] `src/domains/qualification/condition-evaluator.ts` — `evaluateLeaf()` / `evaluateGroup()` / `evaluateConditionTree()` puras; todos los operadores implementados; campo desconocido → null seguro
  - [x] `src/domains/qualification/score-engine.ts` — `applyNormalization()`, `buildLeadContext()` (resuelve campos por source), `evaluateProfile()` (score inicial → reglas priorizadas → stop_processing → clamp → thresholds → class)
  - [x] `src/domains/qualification/profile-repository.ts` — CRUD perfiles: `createProfile`, `updateProfile`, `publishProfile` (archive-then-publish), `archiveProfile`, `duplicateProfile`; reglas: `upsertRules` (draft-only), `getRulesByProfileId`; campos: `getFieldDefsForOrg` (system→org→client), `upsertCustomFieldDef`; eventos: `recordBehaviorEvent` (ON CONFLICT DO NOTHING), `getEventDataForLead`; evaluación: `persistProfileEvaluation`, `getActiveProfileForCampaign` (campaign.profileId → client published → null)
  - [x] `src/domains/qualification/profile-actions.ts` — 13 Server Actions: `createProfileAction`, `updateProfileAction`, `publishProfileAction`, `archiveProfileAction`, `duplicateProfileAction`, `upsertRulesAction`, `listProfilesAction`, `getProfileAction`, `upsertCustomFieldAction`, `recordBehaviorEventAction`, `evaluateLeadWithProfileAction`, `previewProfileEvaluationAction`, `batchReEvaluateAction`
  - [x] `src/domains/qualification/actions.ts` — `autoQualifyLeadInternal()` actualizado: intenta perfil v2 primero (campaign.profileId → client published), fallback a savaya_v1 rule set
  - [x] Schema: 4 nuevas tablas (`qualification_profiles`, `qualification_rules`, `qualification_field_definitions`, `lead_behavior_events`), 2 nuevos enums (`qualification_profile_status`, `qualification_rule_action`), columnas `campaigns.profile_id`, `leads.custom_data`, nuevas columnas en `lead_qualifications` (`profile_id`, `profile_version`, `score_int`, `evaluation_trigger`, `matched_rules`, `missing_fields`, `eval_duration_ms`, `snapshot`, `visible_label`)
  - [x] `drizzle/0006_qualification_profiles.sql` — migración aditiva (IF NOT EXISTS)
  - [x] `src/app/dashboard/clients/[id]/_components/QualificationProfilesPanel.tsx` — lista perfiles, crea nuevo (dialog), publica, archiva; filtrado por clientId
  - [x] `src/app/dashboard/clients/[id]/_components/ProfileRuleBuilder.tsx` — editor de reglas con LeafEditor por campo de registry, operadores tipados, grupo AND/OR/NONE, acciones (add_score/force_result/disqualify), PreviewPanel (dry-run sin persistir)
  - [x] `src/app/dashboard/clients/[id]/page.tsx` — integra `QualificationProfilesPanel` bajo MetaConnectionPanel
  - [x] `src/__tests__/qualification-condition-evaluator.test.ts` — tests condición por operador y tipo de campo
  - [x] `src/__tests__/qualification-score-engine.test.ts` — tests scoring (score inicial, clamp, stop_processing, force_result, disqualify, thresholds, 5 fixtures: Savaya/local, servicios profesionales, B2B, inmobiliaria, e-commerce)
  - [x] `docs/QUALIFICATION_ENGINE.md` — documentación completa del motor genérico
  - [x] TypeScript clean (0 errores); 438 tests en 11 suites (todos passing)
  - [x] Criterio de salida: un administrador puede crear, configurar y publicar un perfil de calificación sin tocar código
- [x] Prompt 17-24: (pendiente documentar — ver commits para detalle)
- [x] Prompt 25: Diagnóstico de conversiones (Tracking & CAPI health)
  - [x] Tablas: `tracking_sites`, `conversion_definitions`, `conversion_test_sessions`, `conversion_observations`, `conversion_issues`
  - [x] `src/domains/tracking/` — types.ts, repository.ts, actions.ts (createTrackingSiteAction, etc.)
  - [x] `src/app/dashboard/clients/[id]/tracking/` — página SSR + `_components/TrackingDashboard.tsx`
  - [x] `TrackingDashboard` — modal "Agregar sitio" (nombre, dominio URL, entorno), `HealthSummary`, `SiteSelector`, `IssuesList`, `ConversionList`
  - [x] Botón "Agregar sitio" conectado con `createTrackingSiteAction` via `useTransition`
- [x] Fixes críticos de producción (post-lanzamiento beta)
  - [x] `src/auth.ts` — `authorize` envuelto en try/catch: errores de DB devuelven null en lugar de lanzar
  - [x] `src/domains/auth/actions.ts` — `registerAction` con dos bloques try/catch separados + helper `isRedirectError()` para re-lanzar NEXT_REDIRECT
  - [x] `src/app/onboarding/actions.ts` — `ensureOwnerMembership()` llamada en `createOrgAction` para corregir bucle de onboarding
  - [x] `drizzle.config.ts` — dotenv carga `.env.local` para que drizzle-kit lea DATABASE_URL
  - [x] `src/lib/db/schema.ts` — `importRows.dedupeKey` cambiado a `.notNull().unique()` para soportar ON CONFLICT DO NOTHING
  - [x] Schema Neon sincronizado a 48 tablas via `drizzle-kit push` (wa_client_config, message_templates, cron_runs, tracking_sites, etc. faltaban tras migrate)
- [x] Diseño del dashboard y landing
  - [x] `src/components/app/DashboardNav.tsx` — nav principal con design system sg-*
  - [x] `src/components/landing/` — Hero, LandingNav, Sections, CapiDemo, KanbanDemo, Reveal, InView, Logo, Analytics, ProductTabs, Steps, data, ui
  - [x] `src/app/globals.css` — CSS custom properties sg-* (sg-app, bg-sg-bg, sg-border, sg-accent, sg-s1/s2/s3, sg-ink, sg-muted, sg-subtle, sg-radius)
  - [x] Dashboard refactorizado con DashboardNav + tokens sg-*
- [x] Hub de cliente con 4 tabs (Resumen / Leads / Configuración / Diagnóstico)
  - [x] `src/app/dashboard/clients/[id]/page.tsx` — refactorizado a tabs via `?tab=` URL param; max-w-7xl
  - [x] `_components/ClientHubTabs.tsx` — navegación de tabs con links SSR-friendly
  - [x] `_components/ClientResumenTab.tsx` — KPIs, campañas con métricas, checklist de configuración
  - [x] `_components/ClientLeadsTab.tsx` — tabla con todos los leads del cliente + filtros + campaña filter + LeadDrawer
  - [x] `src/domains/leads/repository.ts` → `getLeadsByClient(clientId, orgId, filters)` vía inArray por campaignIds
  - [x] `src/domains/campaigns/repository.ts` → `getCampaignsByClientWithCounts(clientId, orgId)` con leadCount + saleCount
  - [x] `src/domains/team/repository.ts` → `listSalesRepsByOrg(orgId)` sin filtro de clientId
- [x] Kanban CRM con click-to-edit
  - [x] `KanbanBoard.tsx` — cards clickables abren LeadDrawer; acepta `salesReps?`, `whatsappNumbers?`, `clientId?`
  - [x] `FunnelsView.tsx` — pasa datos adicionales al board
  - [x] `funnels/page.tsx` — carga client + salesReps + whatsappNumbers cuando hay `campaignId` filtrado
- [x] Fixes de tracking y Meta
  - [x] `src/domains/meta/verify.ts` — tokens CAPI ya no se bloquean por error 100/200 del pixel read (no requieren ads_read scope)
  - [x] `TrackingDashboard.tsx` — `HealthSummary` muestra "Configurado" (amber) cuando site tiene `expectedPixelId` sin observaciones aún
  - [x] Modal "Agregar sitio" — incluye campo Pixel ID opcional
  - [x] Botón "Aplicar plantilla" — conectado con `ApplyTemplateModal` (lead_gen / ecommerce / bookings)
- [x] Visibilidad de actividad y ventas en leads (Prompt 29)
  - [x] `src/app/api/behavior/route.ts` — `POST /api/behavior`: ingesta de eventos de comportamiento (begin_checkout, checkout_abandoned, add_to_cart, remove_from_cart, form_submitted, info_requested, view_product, payment_failed); auth Bearer pub_xxx via `lookupCredential()`; CORS wildcard; idempotente con `externalId`; escribe en `lead_behavior_events`
  - [x] `src/domains/leads/repository.ts` — `getLeadsByCampaignWithActivity()`: 3 queries batch (leads → conversions confirmed IN leadIds → behavior_events IN leadIds), merge en memoria; `LeadWithActivity` tipo nuevo con `saleCount/saleTotalAmount/saleCurrency/activity`
  - [x] `src/app/dashboard/campaigns/[id]/leads/_components/LeadsView.tsx` — nueva columna "Venta" con suma total de ventas; nueva columna "Actividad" con `ActivityBadges` (checkout/carrito/form/info); filtro por actividad via URL
  - [x] `src/app/dashboard/performance/page.tsx` — selector de cliente wired; `DateRangeSelector` ya tenía soporte, solo faltaba pasar `clients` y `currentClientId`
  - [x] `src/app/dashboard/campaigns/[id]/leads/_components/LeadDrawer.tsx` — `loadAll` migrado a `Promise.allSettled`; `ConversionPanel` rediseñado (siempre muestra registro + historial integrado de todas las ventas con CAPI status inline); `EditInfoPanel.handleSave` con try/catch explícito
  - [x] `src/domains/leads/actions.ts` — `updateLeadInfoAction` retorna `Promise<{ success: boolean; error?: string }>` consistentemente
  - [x] `src/domains/conversions/actions.ts` — `registerSaleAction` body en try/catch; queries de lead/campaign con `columns` selectivos
  - [x] `src/lib/db/schema.ts` — `leadStageHistoryRelations` agregada (resuelve "not enough information to infer relation 'leads.stageHistory'")
  - [x] Neon DB — `ALTER TABLE meta_connections ADD COLUMN send_lead_events / send_contact_events` aplicado via SQL directo (drizzle-kit push bloqueó por TTY interactivo)
- [x] Fix crítico: `leadStageHistoryRelations` — `leadsRelations` declaraba `stageHistory: many(leadStageHistory)` sin el bloque inverso; Drizzle fallaba en runtime causando React error #441 en toda la página de detalle de cliente; fix en commit `49063ee`
- [x] Gestión de equipo — contraseña y eliminación de miembros
  - [x] `src/domains/members/actions.ts` — `addMemberAction` lee campo `password` del form (opcional; auto-genera si vacío, valida ≥8 chars); `resetMemberPasswordAction(memberId, newPassword)` con validación de rol
  - [x] `src/app/dashboard/settings/team/_components/InviteMemberDialog.tsx` — campo contraseña opcional con show/hide
  - [x] `src/app/dashboard/settings/team/_components/ChangePasswordDialog.tsx` — dialog para cambiar contraseña de miembro existente (llama `resetMemberPasswordAction`)
  - [x] `src/app/dashboard/settings/team/_components/TeamView.tsx` — botón "Contraseña" junto a "Eliminar" para miembros editables
- [x] Notificación por email al asignar lead
  - [x] `src/lib/email.ts` — `sendLeadAssignmentEmail()` con Resend; fire-and-forget; null-safe si `RESEND_API_KEY` no está configurado
  - [x] `src/domains/team/actions.ts` — `assignLeadAction` llama `sendLeadAssignmentEmail` tras asignación exitosa
- [x] Onboarding eliminado — org se auto-crea al registrarse
  - [x] `src/domains/auth/actions.ts` — `registerAction` crea org + inserta en `org_members` con `role: "owner"` + marca onboarding completo; redirige a `/dashboard`
  - [x] `src/app/onboarding/page.tsx` — reemplazado por `redirect("/dashboard")`
  - [x] `src/proxy.ts` — `/onboarding` removido de `isProtected`
  - [x] Todos los `redirect("/onboarding")` en dashboard reemplazados por `redirect("/login")`; 4 páginas migradas de `getOrganizationByOwnerId` a `requireOrganizationMembership() + getOrganizationById()`
- [x] Filtro CAPI pendiente y eliminación masiva de leads
  - [x] `src/domains/leads/repository.ts` — `getLeadsByCampaignWithActivity()` ahora 4 queries (+ metaEvents pending/retrying); `LeadWithActivity.hasPendingCapi: boolean`; `LeadFilters.activity` incluye `"pending_capi"`; `getLeadsByClientWithActivity` y `funnels/repository.ts` devuelven `hasPendingCapi: false`
  - [x] `src/domains/leads/actions.ts` — `deleteLeadsAction(ids[])`, `deleteLeadsByCampaignAction(campaignId)`, `deleteLeadsByClientAction(clientId)`; todas validan `ctx.orgId`; FK cascade limpia tablas relacionadas automáticamente; `meta_events.leadId` queda en NULL (set null)
  - [x] `src/app/dashboard/campaigns/[id]/leads/_components/LeadsView.tsx` — checkboxes con indeterminate state, barra de selección masiva con confirmación inline, botones "Campaña" / "Cliente" en header con confirmación, opción "CAPI pendiente" en filtro de actividad, icono ⚡ (amber) en `ActivityBadges` cuando `hasPendingCapi`
- [x] Fix `action_source` para eventos Purchase
  - [x] `src/domains/conversions/payload.ts` — `PurchaseEvent.action_source` y `buildPurchasePayload()`: `"website"` → `"crm"` (ventas manuales en CRM, no actividad web real)
  - [x] `src/lib/meta-capi.ts` — `sendPurchaseEvent()`: `"website"` → `"crm"`; `sendLeadEvent()` y `sendContactEvent()` mantienen `"website"` (correcto para esos tipos)
  - [x] `src/__tests__/conversion-payload.test.ts` — expectativa actualizada a `"crm"`
- [x] Creación manual de leads
  - [x] `src/domains/leads/actions.ts` — `createLeadManuallyAction(campaignId, input)`: auth via `requireCampaignAccess`, inserta con `leadSource: "manual"`, `temperature: "cold"`, `stage: "new"`, activity `actorType: "user"`, `activityType: "created"`, llama `autoQualifyLeadInternal` fire-and-forget; retorna `{ success, leadId?, error? }`
  - [x] `src/app/dashboard/campaigns/[id]/leads/_components/CreateLeadDialog.tsx` — dialog campaña: campos name/phone/email/city/negocio (select si/no); llama `createLeadManuallyAction(campaignId, input)`
  - [x] `src/app/dashboard/clients/[id]/_components/CreateLeadDialog.tsx` — dialog cliente: mismos campos + dropdown de campaña; `defaultCampaignId` desde URL
  - [x] `LeadsView.tsx` — botón "Nuevo lead" (UserPlus icon, azul) siempre visible; badge "WA" morado para `source === "manual"`; filtro `SOURCES` incluye `"manual"`
  - [x] `ClientLeadsTab.tsx` — botón "Nuevo lead" (solo si hay campañas); badge violeta para `"manual"`
- [x] Meta Lead Ads — integración completa
  - [x] `src/lib/db/schema.ts` — tabla `metaLeadAdSources` con unique index `(page_id, form_id)`; relaciones `metaLeadAdSourcesRelations`
  - [x] `src/domains/lead-ads/repository.ts` — `getLeadAdSourceByCampaign`, `getLeadAdSourceByPage` (match específico form ó fallback null-form), `upsertLeadAdSource` (ON CONFLICT DO UPDATE), `deleteLeadAdSource`
  - [x] `src/domains/lead-ads/actions.ts` — `saveLeadAdSourceAction` (cifra Page Access Token con `encryptTokenVersioned`), `deleteLeadAdSourceAction`, `getLeadAdSourceAction` (nunca devuelve token)
  - [x] `src/app/api/webhook/meta-leads/route.ts` — GET: verifica `hub.verify_token` vs `META_LEAD_ADS_VERIFY_TOKEN`; POST: HMAC-SHA256 con `META_APP_SECRET`, routing via `getLeadAdSourceByPage`, idempotencia via `webhook_events`, fetch lead data Graph API, insert lead + touchpoint + activity + mark processed + `autoQualifyLeadInternal`; `leadSource: "meta_ads"`, `externalEventId: leadgen_id`, `metaCampaignName/metaAdsetName/metaAdName` desde webhook payload
  - [x] `src/app/dashboard/campaigns/[id]/leads/_components/LeadAdsPanel.tsx` — panel colapsable; formulario Page ID / Form ID / Page Access Token (password show/hide); instrucciones setup 6 pasos con URL webhook usando `NEXT_PUBLIC_APP_URL`; Desconectar con confirm dos pasos
  - [x] `src/app/dashboard/campaigns/[id]/leads/page.tsx` — carga `getLeadAdSourceByCampaign` en paralelo; pasa `leadAdSource` (sin token) a `LeadsView`
  - [x] `scripts/apply-lead-ads.ts` — migración aplicada a Neon: tabla + 3 índices ✓
  - [x] `.env.example` — `META_LEAD_ADS_VERIFY_TOKEN` + `META_APP_SECRET` documentados
