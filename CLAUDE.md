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
- **@anthropic-ai/sdk + openai SDK** — motor LLM multi-provider: Anthropic, OpenAI, Google Gemini, DeepSeek, Groq, OpenRouter; interfaz `LLMProvider` sustituible por proveedor
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
- **`drizzle-kit push` para sincronización de schema**: `npx drizzle-kit migrate` puede reportar éxito sin crear todas las tablas cuando `__drizzle_migrations` no existe o está desincronizado. Usar `npx drizzle-kit push` para comparar el schema Drizzle actual contra la DB y aplicar diferencias directamente. Verificar tablas tras migrar: **80 tablas en Neon** después de Phase 09 aplicada (2026-10-13).
- **Drizzle relaciones: siempre declarar ambos lados**: Al añadir `many(X)` en un `relations()`, SIEMPRE añadir el `relations()` inverso para la tabla X. Si falta el lado inverso, Drizzle lanza un error en runtime al ejecutar CUALQUIER query relacional que toque ese schema — no solo las que usan la relación faltante — causando React error #441 (server component crash) en producción. El fix es añadir el bloque `relations(X, ({ one }) => ({ ... }))` correspondiente. Ver commit `49063ee`: `leadStageHistoryRelations` faltaba porque `leadsRelations` tenía `stageHistory: many(leadStageHistory)` sin su inverso.
- **`drizzle.config.ts` requiere dotenv**: `drizzle-kit` no carga `.env.local` automáticamente. Añadir `import { config } from "dotenv"; config({ path: ".env.local" })` al inicio del archivo; sin esto los comandos drizzle-kit leen `DATABASE_URL` como `undefined`.
- **`createOrgAction` DEBE llamar `ensureOwnerMembership()`**: `provisionOrganization()` crea la org pero no inserta en `org_members`. `requireOrganizationMembership()` solo consulta `org_members`, por lo que sin este insert todos los usuarios nuevos son redirigidos al onboarding en un bucle infinito. Ver `src/app/onboarding/actions.ts`.
- **`authorize` en `auth.ts` DEBE tener try/catch**: Si la DB no está disponible y `authorize` lanza una excepción, Auth.js muestra "There was a problem with the server configuration" en lugar de un error manejable. Envolver todo el cuerpo de `authorize` en try/catch y devolver `null` ante cualquier error de DB.
- **`verifyMetaConnection` no bloquea por errores 100/200 del pixel read**: Los tokens de CAPI no requieren `ads_read` scope para enviar eventos; solo verificar que el token sea válido (error 190/102 = inválido). Si el pixel read falla con 100/200 (permisos de lectura), proceder igual — el token puede enviara CAPI sin leer metadatos del pixel.
- **`registerAction` usa dos bloques try/catch separados**: El bloque DB (crear usuario) y el bloque `signIn` deben estar separados. `signIn()` de Auth.js lanza un error especial con `digest.startsWith("NEXT_REDIRECT")` que DEBE ser re-lanzado — usar el helper `isRedirectError()` para detectarlo antes de capturarlo.
- **`import_rows.dedupe_key` requiere `.notNull().unique()`**: `onConflictDoNothing({ target: importRows.dedupeKey })` necesita un índice único en Postgres o rechaza el INSERT con "no unique constraint matching the ON CONFLICT specification". La columna debe tener `.notNull().unique()` en el schema Drizzle y el constraint aplicado en DB via `drizzle-kit push`.
- **Design system del dashboard usa tokens `ops-*`**: El dashboard usa CSS custom properties `--ops-*` definidas en `globals.css` (`.sg-app` dark defaults + `html.light .sg-app` overrides). El modo por defecto es **light** (`defaultTheme="light"`, `storageKey="sl-theme-v2"`). Nuevos componentes deben usar clases `ops-*`, nunca `zinc-*` ni hex hardcodeados. Componentes compartidos en `src/components/app/ops.tsx`: `Panel` (variants white/navy/coral), `KPICard` (icon badge 40×40 rounded-xl pastel bg, valor 32px bold, delta pill), `StatusChip` (rounded-full pill + dot), `PageShell`, `PageHeader` (prop `eyebrow` para label azul uppercase), `EmptyState`, `opsTable`, `opsField`, `opsBtnPrimary` (coral rounded-full), `opsBtnSecondary` (white border rounded-full), `opsBtnNavy`. Tabla: `th` siempre usa `bg-ops-th-bg` (nunca `ops-side` ni `ops-bg`). Botones siempre `rounded-full`. `DashboardNav` en `src/components/app/DashboardNav.tsx` tiene los grupos de nav con `NAV_GROUPS`; sidebar en `DashboardSidebar.tsx` (232px, active item `bg-ops-sel text-ops-blue rounded-full`).
- **`startTransition(async () => {...})` requiere try/catch explícito**: React 19 silencia excepciones lanzadas dentro de transitions asíncronas. Sin try/catch, errores de server actions desaparecen sin mostrar nada al usuario. Siempre envolver el body async en try/catch y manejar el error con `setError(...)`.
- **Server actions complejas deben retornar `{ success, error? }` y NO lanzar**: Envolver el body principal en try/catch y devolver `{ success: false, error: "..." }` en lugar de propagar la excepción. Lanzar desde una server action causa que el cliente reciba un error genérico no manejable. Ver `registerSaleAction` y `updateLeadInfoAction`.
- **`loadAll` en LeadDrawer usa `Promise.allSettled`**: Si una de las 5 acciones paralelas falla (p.ej. `fetchLeadDetailAction` por error de relación Drizzle), las demás deben igualmente completarse. Con `Promise.all`, un fallo cancela todo y `allConversions` queda vacío. Usar siempre `Promise.allSettled` en cargas de drawer/panel con múltiples acciones independientes.
- **Queries de leads en server actions deben especificar `columns: {}`**: `db.query.leads.findFirst()` sin filtro de columnas genera SELECT de todas las columnas — si el schema Drizzle tiene columnas que no existen aún en Neon, la query falla. En acciones que solo necesitan campos específicos, usar `columns: { id: true, campaignId: true, ... }` para aislar el impacto del schema drift.
- **`leadStageHistoryRelations` es obligatoria en schema.ts**: `leadsRelations` tiene `stageHistory: many(leadStageHistory)`. Drizzle requiere que exista `leadStageHistoryRelations` con `lead: one(leads, ...)` en la otra punta, o lanza "There is not enough information to infer relation 'leads.stageHistory'" en tiempo de ejecución.
- **`meta_connections.send_lead_events` / `send_contact_events`**: Booleanos (default false) que controlan si se disparan auto-eventos Lead (al ingestar) y Contact (al cambiar stage a "contacted"). Agregados como columnas en Neon via SQL directo (`ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS ...`) porque `drizzle-kit push` bloqueó por prompt TTY interactivo en el ambiente CI/no-TTY.
- **`LeadWithActivity` agrega TODAS las ventas confirmadas**: `saleCount` = total de conversiones confirmadas; `saleTotalAmount` = suma si moneda uniforme, `null` si mixta; `saleCurrency` = moneda si uniforme. Reemplazó los campos anteriores `saleAmount / saleStatus / saleConvertedAt` (que solo reflejaban la primera conversión). El filtro `has_sale` usa `saleCount > 0`.
- **`LeadWithActivity.hasPendingCapi`**: booleano cargado en TODAS las consultas (4ª query paralela en `getLeadsByCampaignWithActivity`). Indica que el lead tiene al menos un `meta_event` con `status = 'pending' OR 'retrying'`. Activa el icono ⚡ en `ActivityBadges` y el filtro `pending_capi`. En `getLeadsByClientWithActivity` y `funnels/repository.ts` siempre se devuelve como `false` (no se cargan eventos CAPI en esas vistas).
- **Eliminar leads**: tres acciones multi-tenant en `leads/actions.ts` — `deleteLeadsAction(ids[])` (por selección), `deleteLeadsByCampaignAction(campaignId)`, `deleteLeadsByClientAction(clientId)`. Todas validan pertenencia a `ctx.orgId` antes de borrar. La DB hace cascade en `lead_stage_history`, `conversions`, `lead_qualifications`, etc.; `meta_events.leadId` queda en `NULL` (set null) para no perder el historial CAPI.
- **Meta Ad Library API — error code 10, subcode 2332002**: La API retorna `{ code: 10, error_subcode: 2332002, message: "Application does not have permission for this action", error_user_title: "Authorization and login needed" }` cuando la **app está en modo Development** o cuando el usuario del token no confirmó acceso en el portal. Diagnóstico confirmado 2026-10-06. Dos causas posibles en orden de probabilidad: (1) la app `3653638184801040` está en modo Development en `developers.facebook.com/apps/3653638184801040/settings/basic/` — cambiar a Live mode resuelve el problema; (2) la cuenta de Facebook que generó el token no confirmó en `facebook.com/ads/library/api/` — la confirmación está ligada al USUARIO, no al business. Business verificado + identidad verificada son pasos separados de este. App Token (`APP_ID|APP_SECRET`) nunca funciona porque no está asociado a un usuario que pueda confirmar. Solución definitiva: app en Live mode + User Access Token (o System User token) de cuenta que haya confirmado en el portal. Logging temporal activo en `meta.ts` y `actions.ts` para diagnóstico — remover después de resolver.
- **`searchMetaAds()` re-lanza errores conocidos**: el catch en `meta.ts` re-lanza `META_ACCESS_PENDING`, `META_TOKEN_EXPIRED` (código 190/102) y `META_API_ERROR:{code}` para que `searchAdsAction` en `actions.ts` los capture y muestre mensajes accionables al usuario. Errores de red/desconocidos devuelven `[]` silenciosamente (comportamiento intencional para no bloquear la UI).
- **App ID de la Meta App para Ad Library**: `3653638184801040` ("Synclead app"). El `META_APP_SECRET` correspondiente es `043d3c6ad53243d2c30032b0f83a34d0`. El App ID anterior `725731837196369` era incorrecto/de otra app.
- **TikTok Creative Center API (endpoint muerto)**: `POST ads.tiktok.com/creative_radar_api/v1/top_ads/list` retorna 404. `GET` requiere `session_id` de autenticación del usuario de TikTok (no disponible server-side). TikTok deshabilitado en UI con "próximamente". El código en `tiktok.ts` se conserva para futura integración cuando exista un endpoint oficial.
- **Video URL regex con query params**: Usar `/\.(mp4|webm|mov|avi|m4v)(\?|$)/i`, NO `/\.(mp4|webm|mov|avi|m4v)/i`. Las URLs de CDN de Facebook incluyen query params (`...mp4?_nc_cat=109&_nc_sid=...`); sin el grupo `(\?|$)` la regex no detecta el tipo de archivo y el video se trata como imagen.
- **Facebook CDN (fbcdn.net) CORS/Referer**: Los videos de `scontent-*.fbcdn.net` requieren `Referer: https://www.facebook.com` para ser servidos. El navegador no puede inyectar ese header desde un dominio externo → el elemento `<video>` dispara `onError`. Solución: capturar `videoError` state → mostrar `thumbnailUrl` (si existe) con play button overlay que enlaza al `snapshotUrl` o URL original; si no hay thumbnail → mostrar mensaje "Video restringido" + botón "Ver video" que abre el link original.
- **Eventos CAPI huérfanos (`leadId != null && leads.id IS NULL`)**: ocurren cuando se elimina un lead — `meta_events.leadId` queda en NULL via `SET NULL` FK, pero cuando el evento ya fue creado y la DB lo guardó antes del DELETE, el `leadId` puede quedar apuntando a un lead ya borrado. Detección: `LEFT JOIN leads ON metaEvents.leadId = leads.id WHERE leads.id IS NULL AND metaEvents.leadId IS NOT NULL`. El payload CAPI está en la columna `metaEvents.payload` (JSON auto-contenido con PII hasheado) y **se puede enviar igual** via `sendMetaEventDirect(eventId, orgId)` sin necesidad del lead. `cancelOrphanCapiEventsAction()` los cancela si se prefiere no enviarlos. El panel `HealthCapiLogPanel` muestra los primeros 8 chars del `leadId` para identificar el lead eliminado.
- **Insights Decision Center — `internalCampaignId` no se auto-popula en catalog-sync original**: el campo `metaCatalogCampaigns.internalCampaignId` es null en todos los registros históricos porque `syncAdCatalog` nunca lo seteaba. Fix bicapa: (1) `catalog-sync.ts` ahora hace name-match case-insensitive con `campaigns` del cliente en cada sync usando `COALESCE` para no pisar links manuales; (2) `decision-repository.ts` hace fallback name-match en la query para que los datos históricos funcionen sin re-sync.
- **Insights — `getActiveInsightsConnection` debe filtrar `isNotNull(adAccountId)`**: la tabla `meta_connections` contiene conexiones CAPI (pixelId set, adAccountId null) y conexiones de Insights (adAccountId set, pixelId null). Sin filtrar, la función puede devolver la conexión CAPI activa (que no sirve para Insights). Siempre usar `isNotNull(metaConnections.adAccountId)` + `orderBy(desc(metaConnections.createdAt))`.
- **Insights — `CampaignType` determina scoring y reglas de decisión**: usar `getCampaignType(objective)` para clasificar. Campañas de awareness/tráfico/engagement NO deben penalizarse por 0 conversiones ni 0 ventas — tienen métricas distintas (CPM, reach, CTR, CPC). Solo campañas de leads/sales/unknown usan el scoring de conversiones y ventas.
- **Insights — ventas reales vs checkouts Meta**: `adInsightsDaily.conversionsCount` = eventos pixel de Meta (inicios de checkout, no compras). `conversions.status='confirmed'` en SyncLead = ventas reales. Son métricas diferentes. La UI muestra "Checkouts" para los eventos Meta y "Ventas" para las confirmadas en SyncLead. El scoring pesa las ventas reales (30 pts) más que los checkouts sin venta (15 pts).
- **`hasPendingCapi` excluye Purchase events**: la query de `metaEvents pending/retrying` en `getLeadsByCampaignWithActivity()` filtra `ne(metaEvents.eventName, "Purchase")`. El filtro "CAPI pendiente" y el botón ⚡ en LeadsView solo reflejan eventos de comportamiento (Lead, Contact, etc.), no ventas pendientes de envío.
- **`sendLeadPendingCapiAction(leadId)`**: envía en paralelo todos los `meta_events` con `status = pending OR retrying AND eventName != Purchase` para un lead. Usa `Promise.allSettled` para que un fallo no cancele los demás. Llamado desde el botón ⚡ en la tabla de leads de una campaña (`LeadsView.tsx`).
- **Botón "Enviar" en LeadsView para CAPI pendiente**: el ícono ⚡ en `ActivityBadges` es un botón clickeable. `e.stopPropagation()` evita abrir el LeadDrawer. State `sendingCapiLeadId` trackea el lead en proceso. Después del send hace `router.refresh()` para refrescar `hasPendingCapi`.
- **`requireOrganizationMembership()` usa `db.query.orgMembers.findFirst`**: NO usar `db.select().from(orgMembers)` aquí. Los tests de auth (`auth-isolation.test.ts`, `permissions-matrix.test.ts`) mockean `db.query.orgMembers.findFirst` — cambiar a `db.select` rompe silenciosamente los 48+ tests de seguridad sin error visible en build. Cualquier cambio en esta función debe verificar que ambos test files siguen pasando.
- **`drizzle-kit push` puede bloquearse por prompts TTY**: cuando la CLI detecta cambios que podrían ser destructivos (ej. añadir UNIQUE constraint a tabla con datos), pide confirmación interactiva. En entornos no-TTY usar SQL directo via `neon()` client. Para agregar columnas simples con DEFAULT, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` siempre es seguro.
- **`calculateTemperature()` eliminada completamente** (2026-10-13): función removida de `src/domains/leads/normalize.ts` junto con `MAJOR_CITIES`. `NormalizedLead` ya no tiene campo `temperature`. `persist.ts` siempre guarda `temperature: "cold"` — la calificación real la hace `autoQualifyLeadInternal()` fire-and-forget. No invocar ni reimplementar esta función.
- **`leads` tabla no tiene columna `summary`**: usar `leads.notes` en cualquier query o tipo que necesite notas del lead. `LeadPanel.tsx` usa `lead.notes`, `ConversationDetail.lead` define el campo como `notes`. Error de TypeScript garantiza que `leads.summary` no existe.
- **`waConversationNotes` y `waConversationMessages` son tablas estructuralmente separadas**: las notas del equipo son siempre privadas por diseño — no existe campo `isPrivate`, la tabla misma es la garantía. `waConversationNotes` tiene `authorId` (texto FK → user.id), no `isAi`. Nunca mostrar el contenido de `waConversationNotes` en la vista de mensajes del cliente.
- **Takeover atómico de conversación (sin transacciones)**: `UPDATE waConversations SET controlMode='human' WHERE controlMode NOT IN ('human')` — si retorna 0 filas, la conversación ya fue tomada por otro agente. Compatible con neon-http PgBouncer (no requiere transacción interactiva). Cancelar también los items de `aiMessageQueue` en estado `enqueued`/`processing` con una segunda UPDATE (non-fatal con `.catch(() => undefined)`).
- **`isWithinSchedule(windows, timezone)` usa `Intl.DateTimeFormat` para DST**: convertir `now` al timezone local con `now.toLocaleString("en-US", { timeZone: timezone, hour12: false })` y luego `new Date(localStr)` para extraer hora/día locales. NUNCA hacer aritmética manual de offset — los offsets cambian con horario de verano y varían por timezone.
- **24h Meta eligibility en `replyAction`**: calcular `(now - lastMessageAt) / 1000 / 3600`; si > 24 retornar `{ success: false, error: "...", requiresTemplate: true }`. La UI muestra guidance sobre plantillas en lugar de enviar el mensaje.
- **`paused/pausedAt/pausedBy` en `ai_agent_deployments`**: un deployment pausado bloquea nuevos envíos de IA. El toggle requiere rol manager o superior (`requireRole(["owner","admin","manager"])`).
- **`ai_deployment_schedules`**: UNIQUE constraint en `deploymentId` — usar `onConflictDoUpdate` para upsert (una sola fila de horario por deployment). Timezone en IANA (ej: `"America/Caracas"`). Ventanas JSON: `Record<string, Array<{ start: string; end: string }>>` con claves `"mon"..."sun"` y valores `"HH:MM"`.
- **`autoQualifyLeadInternal` tiene try/finally como red de seguridad absoluta**: el bloque `finally` siempre consulta la tabla `conversions` al terminar (incluso si la función sale con `return` anticipado). Si existe una conversión con `status = "confirmed"`, fuerza `temperature = "hot"`. Esto garantiza que ningún camino de calificación pueda dejar en frío a un lead que ya compró. La guarda `ne(leads.temperature, "hot")` en el `finally` evita writes innecesarios.
- **`cost-utils.ts` vs `cost-calculator.ts`**: funciones de puro formato (`formatMillicentsAsUsd`, `getModelDisplayName`) viven en `cost-utils.ts` SIN `import "server-only"` — seguros para importar en Client Components. Funciones con DB queries (`getActivePricingTier`, `computeCostMillicents`, etc.) permanecen en `cost-calculator.ts` con `import "server-only"`. Nunca importar `cost-calculator.ts` desde un Client Component.
- **Crons de IA en cron-job.org, no en Vercel**: Vercel Hobby plan limita crons a 1/día. Los 4 crons de frecuencia alta (`ai-message-processor`, `ai-media-processor`, `ai-document-processor` — 1/min; `meta-outbox` — 10/min) se registran en cron-job.org como POST con `Authorization: Bearer $CRON_SECRET`. El webhook de WhatsApp dispara inmediatamente un fetch a `ai-message-processor` tras enqueue (fire-and-forget) para respuesta en ~5s; cron-job.org es el fallback de recuperación.
- **Multi-provider LLM**: `createProvider(name, apiKey?)` en `src/lib/llm/index.ts` instancia `AnthropicProvider | OpenAIProvider | GeminiProvider | DeepSeekProvider | GroqProvider | OpenRouterProvider`. Todos los constructores aceptan `apiKey?: string` opcional (si no se pasa, usan env var). El engine busca primero la clave en `ai_provider_keys` de la DB del org; si no existe, usa env var. Esto permite que cada organización configure sus propias claves sin tocar el servidor.
- **DeepSeek, Groq, OpenRouter usan el SDK de OpenAI** con `baseURL` personalizado: DeepSeek → `https://api.deepseek.com/v1`, Groq → `https://api.groq.com/openai/v1`, OpenRouter → `https://openrouter.ai/api/v1` (+ headers `HTTP-Referer` y `X-Title`). No requieren SDK adicional. **Nota operativa**: DeepSeek requiere saldo pagado (no gratis); Groq es gratis pero bloqueado en Venezuela; OpenRouter tiene modelos `:free` (sufijo en model ID) pero su disponibilidad cambia sin aviso — los modelos NVIDIA Nemotron son los actuales. Gemini 1.5 Flash vía Google AI Studio es la mejor opción gratuita y accesible desde Venezuela.
- **`ai_provider_keys`**: tabla con UNIQUE `(org_id, provider)`. `ProviderName = "anthropic" | "openai" | "google" | "deepseek" | "groq" | "openrouter"`. Claves cifradas con `encryptTokenVersioned()` (AES-256-GCM, mismo formato que `meta_connections`). `decryptTokenVersioned()` solo necesita la ciphertext (la versión está embebida en formato `v{n}:iv:tag:data`). Solo owner/admin puede guardar o eliminar claves.
- **Instrucciones de herramientas del agente son directivas**: el prompt `## Instrucciones de herramientas` en `prompts.ts` especifica CUÁNDO llamar cada tool (ej: `assign_to_rep` INMEDIATAMENTE si el lead pide hablar con un humano). Sin instrucciones directivas, los modelos débiles describen la acción verbalmente sin llamar la herramienta.
- **Greeting guard en el processor (Step 7.5)**: si no hay mensajes de assistant en el historial pero `messageCount > 1`, se inyecta sintéticamente la presentación resuelta como primer mensaje assistant. Esto evita que el modelo repita el saludo en conversaciones ya iniciadas. La presentación también se mueve a sección `## Saludo inicial` separada de `## Identidad` con instrucción explícita de usarla SOLO en el primer mensaje.
- **`{{nombre_empresa}}` se resuelve en tiempo de build del prompt**: `personalidad.presentation.replace(/\{\{nombre_empresa\}\}/gi, personalidad.internalName || "")` en `prompts.ts`. Si no se resuelve, el lead ve la plantilla literal.
- **Queries paralelas en el processor**: Steps 5+6 (historial + lead context) se ejecutan con `Promise.all` en lugar de secuencialmente. Reduce latencia ~200-500ms por conversación.
- **`campaigns.channel_type`**: campo `text NOT NULL DEFAULT 'web_form'`. Valores: `"web_form"` (pixel/landing/form — por defecto) y `"messaging"` (WhatsApp CTWA o Instagram DM). Determina el módulo de UI a mostrar y las instrucciones de setup de la campaña. Índice: `campaigns_channel_type_idx`. NO rompe campañas existentes — default seguro.
- **WhatsApp CTWA (Click-to-WhatsApp)**: leads que entran cuando alguien hace clic en un anuncio de Meta con CTA "Enviar mensaje a WhatsApp". El webhook existente `/api/webhook/wa-cloud/[wabaId]` detecta `message.referral.source_type === "ad"` → llama `processCtwaLead()` fire-and-forget. Routing: `meta_catalog_ads.meta_ad_id` → `meta_catalog_campaigns.internal_campaign_id` (requiere Catalog Sync activo). Lead creado con `leadSource: "whatsapp_ctwa"`, `platform: "whatsapp"`, `phone` del remitente, `ctwaClid` del referral. La conversación WA queda vinculada al lead vía `wa_conversations.lead_id`. El AI Agent **NO se activa automáticamente** — sigue dependiendo del deployment configurado para ese número de teléfono.
- **`leads.ctwa_clid`**: texto nullable. Click-to-WhatsApp click ID del `referral.ctwa_clid` del webhook. Se envía como `fbc` en CAPI cuando el lead no tiene `fbc` web. Solo presente en leads `leadSource: "whatsapp_ctwa"`.
- **`leads.ig_scoped_id`**: texto nullable. Instagram-Scoped ID (IGSID) para leads de Instagram DM (`leadSource: "instagram_message"`). Se hashea como `instagram_login_id` en el payload CAPI. Reservado para Sprint 2 (Instagram DM — no implementado aún).
- **`action_source: "business_messaging"` en CAPI**: `buildPurchasePayload()` acepta `actionSource?: "crm" | "business_messaging"`. `registerSaleAction` detecta `leadSource === "whatsapp_ctwa" || "instagram_message"` y pasa `business_messaging` automáticamente. Para CTWA: `user_data.fbc = ctwaClid` (si no hay fbc web) + `user_data.ph = SHA-256(phone)`. Para IG DM: `user_data.instagram_login_id = SHA-256(igScopedId)`. `event_source_url` solo se incluye cuando `action_source === "crm"`.
- **`resolveCampaignFromAdId(orgId, metaAdId)`** en `src/domains/wa-cloud/repository.ts`: lookup `meta_catalog_ads` → `meta_catalog_campaigns` para mapear un `ad_id` de Meta al `campaigns.id` interno. Requiere que el Catalog Sync (Insights) esté activo y la campaña de Meta vinculada a una campaña de SyncLead. Si no hay match, `processCtwaLead` no crea el lead (no silencia el error — simplemente retorna `null`).
- **`linkConversationToLead(conversationId, leadId, orgId)`** en `src/domains/wa-cloud/repository.ts`: UPDATE con guard `WHERE lead_id IS NULL` para evitar sobrescribir en webhooks duplicados. Non-fatal (`.catch(() => undefined)`).
- **Idempotencia CTWA**: doble guarda — (1) check `wa_conversations.lead_id IS NOT NULL` antes de procesar; (2) `webhook_events(campaign_id, event_id=wamid)` con `ON CONFLICT DO NOTHING`. Si el webhook de Meta llega dos veces para el mismo mensaje, solo se crea un lead.
- **`leadSource` valores para mensajes**: `"whatsapp_ctwa"` (WA Click-to-WhatsApp, Sprint 1 ✅) y `"instagram_message"` (Instagram DM, Sprint 2 ✅). Ambos usan `action_source: "business_messaging"` en CAPI. Ambos visibles con badge de fuente en LeadsView (Sprint 3 ✅).
- **Sprint 3 UI Mensajes (✅ 2026-10-25)**: Diferenciación visual completa entre campañas de mensajes y campañas web/form en el dashboard.
  - **`CampaignsView` — selector de canal**: barra de tabs "Todas / Web / Formularios / Mensajes" debajo de los chips de cliente. Filtra `campaigns` por `channelType === "web_form"` (default) o `channelType === "messaging"`. Muestra conteo por canal. Se combina con el filtro de cliente existente. Íconos: `Globe` para Web, `MessageSquare` para Mensajes, `Layers` para Todas.
  - **`LeadsView` — `SourceBadge`**: 2 nuevas variantes — `"whatsapp_ctwa"` → badge esmeralda `MessageSquare` + "WA"; `"instagram_message"` → badge rosa `Camera` + "IG". `"manual"` renombrado de "WA" a "Manual" para evitar confusión.
  - **`LeadsView` — filtro `SOURCES`**: añadidos `"WA Mensaje"` y `"IG Mensaje"` al select de fuente (posición 2-3, antes de "Orgánico"). `sourceLabel()` mapeado para el export XLSX.
  - `lucide-react` en este proyecto no exporta `Instagram` — usar `Camera` como ícono para IG. Verificar disponibilidad de íconos con `node -e "Object.keys(require('lucide-react')).filter(...)"` antes de usar íconos poco comunes.
- **Instagram DM ads — `instagram_message_sources`**: tabla que mapea `ig_page_id` → `(org_id, campaign_id?)`. `campaign_id` nullable — si es null, el webhook hace catalog-lookup por `ad_id` igual que CTWA. `verify_token` único por fila (usado en la verificación GET del webhook). `page_access_token_enc` cifrado con AES-256-GCM igual que otros tokens Meta. Requiere permisos: `instagram_manage_messages` + `instagram_basic`.
- **Instagram DM webhook** (`/api/webhook/instagram-messages`): `object: "instagram"` (distinto al `"page"` de Lead Ads y al `"whatsapp_business_account"` de WA). Solo procesa `messaging[]` con `referral.source === "ADS"`. Filtra `message.is_echo === true` (mensajes propios de la página). Routing: `ad_id` → catalog → `internalCampaignId`; fallback a `instagramMessageSources.campaignId`. Idempotencia: `webhookEvents(campaign_id, event_id=mid)`. Fetch de perfil IG (`/IGSID?fields=name,username`) es best-effort — si falla, nombre = `"Instagram {últimos 6 del IGSID}"`. No crea ni vincula `wa_conversation` (Instagram DMs son externos a SyncLead). AI Agent no aplica.
- **`getIgMessageSourceByPageId(igPageId)`** en `src/domains/ig-messages/repository.ts`: lookup por `ig_page_id + is_active = true`. Devuelve `{ orgId, campaignId, pageAccessTokenEnc, keyVersion, verifyToken }`.
- **`resolveIgCampaignFromAdId(orgId, metaAdId)`** en `src/domains/ig-messages/repository.ts`: mismo patrón que el homólogo CTWA en `wa-cloud/repository.ts`. Ambas funciones son independientes por dominio — no compartir.

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
        page.tsx + _components/         ← CRUD clientes; layout full-screen con chips de estado (Todos/Activos/Inactivos), grid de ClientCards (indicadores CAPI/Pixel/WA, toggle activo, ver cliente/editar/eliminar), KPIs strip
        [id]/page.tsx + _components/    ← MetaConnectionPanel + MetaInsightsPanel + QualificationProfilesPanel + SalesTeamPanel + WhatsAppConfigPanel
      campaigns/
        page.tsx + _components/         ← CRUD campañas; layout full-screen con chips de cliente (router.push), grid de CampaignCards (leads count 4xl, toggle activo, ver leads/scripts/editar/eliminar), KPIs strip, card "Nueva campaña" dashed al final
        [id]/leads/
          page.tsx + _components/       ← LeadsView (+ LeadAdsPanel + CreateLeadDialog) + LeadDrawer (AssignmentPanel + WhatsAppPanel + VentaPanel + CAPIPanel)
      performance/
        page.tsx + _components/         ← tabla rendimiento + SummaryCards + CSV export con sanitizeCsv; 2 tabs: Rendimiento / Insights Meta; ?tab=visitantes redirige automáticamente a /dashboard/visitors
        _components/InsightsDecisionCenter.tsx ← Centro de Decisiones Meta Ads: HealthScoreCard, KpiCards, RecommendationsPanel, CampaignDecisionTable (con Checkouts/Ventas/Tipo), AdPerformanceTable, LeadQualityPanel, SyncInfoFooter; usa Promise.allSettled para resiliencia
      funnels/
        page.tsx + _components/         ← Kanban dnd-kit (tabla funnels deprecated; rollback optimista)
      import/
        page.tsx + _components/         ← ImportWizard (upload → ColumnMapper → DryRunPreview → ImportProgress)
      ad-research/
        page.tsx                        ← SSR; carga collections + savedAds; requiere org membership
        _components/
          AdResearchDashboard.tsx       ← tabs Buscar/Guardados; banner pendingAccess con link al portal Meta
          AdSearchForm.tsx              ← Meta activo + TikTok disabled "próximamente"
          AdCard.tsx                    ← renderiza AdResult|SavedAd; video/imagen/CORS fallback; save/delete/move
          AdLibrary.tsx                 ← grid guardados; toggle ImportFromUrlForm; empty state con CTA
          ImportFromUrlForm.tsx         ← import manual URL; OG autofetch 800ms debounce; MediaPreview CORS-aware
      agents/
        page.tsx + _components/AgentsListView.tsx ← listado + crear (desde cero o plantilla) + duplicar + archivar
        [id]/page.tsx                   ← editor del agente: carga versiones, phones, knowledge sources, campaigns
        [id]/_components/AgentEditor.tsx ← editor 6 tabs (objetivo/personalidad/conocimiento/acciones/reglas/despliegue); save draft + publish version; historial versiones
        [id]/_components/Tab{Objetivo,Personalidad,Conocimiento,Acciones,Reglas,Despliegue}.tsx ← tabs del editor
        [id]/simulator/page.tsx         ← SSR; requireRole owner/admin; hasApiKey prop
        [id]/simulator/_components/SimulatorView.tsx ← chat UI + debug panel (tools ejecutadas, stop reason, costo estimado, badge sandbox, advertencia API key)
      inbox/
        page.tsx + _components/InboxView.tsx ← bandeja con filtros (mine/unassigned/ai_active/waiting_human/closed); polling con backoff exponencial (5→10→20→30s, reset en actividad del usuario)
        [conversationId]/page.tsx            ← SSR; notFound() si conversación no existe o no pertenece a la org
        [conversationId]/_components/
          ConversationView.tsx  ← polling 10s; mensajes + barra de acciones + panel lead/notas lateral
          MessageList.tsx       ← burbujas AI (azul) / humano (verde) / cliente (gris); estados de entrega
          ReplyBox.tsx          ← deshabilitado fuera de modo human; aviso 24h para plantillas (requiresTemplate)
          ActionBar.tsx         ← take/release/return-to-ai/resolve/reopen; role-gated; useTransition
          LeadPanel.tsx         ← campos lead (usa lead.notes — NUNCA lead.summary, campo inexistente)
          NotesPanel.tsx        ← notas privadas del equipo; NUNCA visibles al contacto (tabla separada)
      settings/channels/page.tsx        ← SSR, requireRole owner/admin; estado real adaptador Meta (WA_CLOUD_APP_SECRET + URL + sendingEnabled); WABA accounts + phone numbers; NUNCA simula conexión exitosa
      health/
        page.tsx                        ← SSR; requireRole owner/admin
        _components/HealthDashboard.tsx ← status dots, CAPI queue, imports, cron history, botones retry; monta HealthCapiLogPanel al final
        _components/HealthCapiLogPanel.tsx ← historial eventos CAPI: tabs all/pending/failed/sent; botón "Enviar" por evento; detecta huérfanos (leadId != null && leadName == null); botón "Cancelar huérfanos"; muestra leadId truncado para eventos huérfanos
    api/
      ingest/
        form/route.ts                   ← Modo A: token público, CORS, Turnstile, honeypot
        server/route.ts                 ← Modo B: Authorization Bearer, hash lookup
      behavior/route.ts                 ← POST: eventos de comportamiento (begin_checkout/checkout_abandoned/add_to_cart/remove_from_cart/form_submitted/info_requested/view_product/payment_failed/purchase); auth: Bearer pub_xxx; CORS wildcard; escribe en lead_behavior_events; idempotente con externalId; evento "purchase" → temperature=hot directo (awaited, sin motor de calificación)
      leads/ingest/route.ts             ← @deprecated: legacy X-Campaign-Key adapter; temperature="cold" hardcoded; llama autoQualifyLeadInternal fire-and-forget
      auth/[...nextauth]/route.ts       ← Auth.js handler
      webhook/whatsapp/[clientId]/route.ts ← webhook proveedor WA (verificación de firma)
      webhook/meta-leads/route.ts         ← GET: hub.verify_token challenge; POST: HMAC-SHA256 verify + processEntries fire-and-forget
      cron/
        cleanup/route.ts                ← limpia webhook_events >30 días
        meta-outbox/route.ts            ← procesa cola CAPI (batchSize param, maxDuration=60)
        meta-insights-sync/route.ts     ← sync diario de ad_insights_daily
        retention-cleanup/route.ts      ← nullifica IP/UA expirados; borra PII de erasure requests
        ai-message-processor/route.ts   ← worker IA: claim atómico dos-paso, runEngine, inserta reply AI, usage record, dead-letter tras 5 intentos
  domains/
    ad-research/    types.ts (AdResult, SavedAd, AdCollection, AdPlatform), repository.ts, actions.ts, fetch-preview.ts ("use server" Googlebot OG scrape)
    auth/           actions.ts
    organizations/  repository.ts
    clients/        repository.ts, actions.ts, types.ts
    campaigns/      repository.ts, actions.ts, types.ts
    leads/
      normalize.ts  ← normalizePhone, normalizeCity (calculateTemperature y MAJOR_CITIES eliminados completamente en 2026-10-13)
      repository.ts ← getLeadsByCampaign, getLeadsByCampaignWithActivity (4 queries: leads+conversions+behavior+metaEvents pending/retrying EXCLUDING Purchase via ne()), getLeadDetail, updateLeadTemperature/Stage/Notes/assign; LeadWithActivity: saleCount/saleTotalAmount/saleCurrency/hasPendingCapi/activity
      actions.ts    ← mutations + writeAuditLog (temperature.change, stage.change, assign); updateLeadInfoAction retorna { success, error? }; deleteLeadsAction(ids[]), deleteLeadsByCampaignAction(campaignId), deleteLeadsByClientAction(clientId); createLeadManuallyAction(campaignId, input); sendLeadPendingCapiAction(leadId): envía todos los eventos pending/retrying no-Purchase del lead directamente
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
      sync-engine.ts ← runInsightsSync() con lock via lockedUntil/lockedBy en meta_sync_runs; fetchea currency de la cuenta al inicio via verifyAdsAccess() y guarda en ad_insights_daily
      catalog-sync.ts ← syncAdCatalog(): sync de campaigns/adsets/ads; auto-vincula metaCatalogCampaigns.internalCampaignId por nombre (case-insensitive) usando COALESCE para no pisar links manuales
      decision-repository.ts ← getActiveInsightsConnection (filtra isNotNull adAccountId + orderBy desc), getCampaignMetrics (incluye objective, realSales via bridge internalCampaignId con fallback por nombre), getAccountMetrics, getAdMetrics, getLeadCampaignData, getLastSyncInfo
      decision-engine.ts ← computeCampaignDecision (scoring adaptado por CampaignType), getCampaignType/getCampaignTypeLabel, generateRecommendations (recomendaciones por tipo), computeAccountHealth
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
    ai-agents/
      types.ts      ← schemas Zod + interfaces: AgentConfig (6 tabs), AgentTemplate, versiones, episodios, queue, tool executions, usage records
      templates.ts  ← AGENT_TEMPLATE_LIST (qualify_leads, sales_advisor, appointment_request, support_faq), getDefaultAgentConfig()
      repository.ts ← CRUD agentes, versiones, knowledge sources/revisions, episodes, queue (claimNextQueueItem), tool executions, usage records
      actions.ts    ← createBlankAgentAction, createAgentFromTemplateAction, duplicateAgentAction, archiveAgentAction, saveAgentDraftAction, publishAgentConfigAction, revertToVersionAction
      simulator-action.ts ← simulatorRunAction (sandbox engine, estimación de costo $3/$15 por 1M tokens Sonnet / $0.25/$1.25 Haiku)
      inbox-repository.ts ← InboxFilter (mine/unassigned/ai_active/waiting_human/closed); listInboxConversations (paginado + lastMessage preview en JS); getConversationDetail (conversation+messages+notes+lead+assignedUser); takeConversation (atómico: WHERE controlMode != 'human' + cancel aiMessageQueue entries); releaseConversation; returnToAi (llama resolveEpisodeForConversation); resolveConversation (→ closed + paused); reopenConversation (→ active + waiting_human); addNote; listNotes; isWithinSchedule(windows, timezone) — DST-safe via Intl.DateTimeFormat toLocaleString("en-US")
      inbox-actions.ts    ← takeConversationAction; releaseConversationAction; returnToAiAction; resolveConversationAction; reopenConversationAction; replyAction (busca phone creds via JOIN waPhoneNumbers→waBusinessAccounts + decryptTokenVersioned + CloudApiClient; 24h elegibilidad → { requiresTemplate: true } si > 24h); addNoteAction; upsertScheduleAction (regex HH:MM + onConflictDoUpdate unique deploymentId); toggleDeploymentPauseAction (requireRole manager+)
      engine/
        prompts.ts  ← buildSystemPrompt(config, leadContext?, conversationSummary?): 7 secciones (Identidad/Saludo inicial/Objetivo/FAQ/Reglas/Resumen anterior/Contexto lead/Herramientas). Presentación en sección separada "Saludo inicial" con instrucción explícita de no repetir. `{{nombre_empresa}}` se resuelve con internalName. Tool instructions son directivas (CUÁNDO llamar cada tool).
        knowledge.ts ← loadKnowledgeChunks (8000-char budget trim), formatKnowledgeForPrompt
        tools.ts    ← 7 tool definitions CRM, executeTool dispatcher, sandbox=no DB writes, getEnabledTools
        index.ts    ← runEngine(EngineContext): loop ≤5 turnos, tool execution, 2000-char trim, transfer detection; EngineContext/EngineResult
    health/
      repository.ts ← getHealthSnapshot(orgId): DB ping, meta connections, CAPI queue, imports, cron runs, stuck runs; getOrgMetaEvents(orgId, clientId?, limit): LEFT JOIN leads para obtener leadName (null si lead eliminado = huérfano); getClientMetaEvents(orgId, clientId, limit)
      actions.ts    ← retryFailedCapiEventsAction(), retryFailedImportAction(batchId), resolveStuckCronRunsAction(); sendSingleCapiEventAction(eventId): envía evento individual directo (funciona incluso si el lead fue eliminado — payload en DB); cancelOrphanCapiEventsAction(): marca como "cancelled" eventos pending/retrying cuyo lead fue borrado; getOrgMetaEventsAction(clientId?, limit); getClientMetaEventsAction(clientId, limit)
  lib/
    auth/
      errors.ts     ← AuthError, ForbiddenError, NotFoundError
      server.ts     ← requireUser, requireOrganizationMembership, requireRole, requireClientAccess, requireCampaignAccess
    ingest/
      schema.ts, lookup.ts, normalize.ts, bot.ts, persist.ts
    jobs/
      runner.ts     ← withJobRun(jobName, fn): registra en cron_runs, captura error.name (no message), isOverBudget(ms)
      registry.ts   ← JOB_REGISTRY: 4 jobs con schedule, maxDurationSec, timeBudgetMs (buffer ≥ 5000ms)
    ad-research/
      meta.ts       ← searchMetaAds(); META_USER_ACCESS_TOKEN primero, fallback APP_ID|APP_SECRET; lanza 'META_ACCESS_PENDING' en error code 10
      tiktok.ts     ← searchTikTokTopAds(); endpoint muerto 404; conservado para futura integración
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
    llm/
      provider.ts   ← import "server-only"; interfaz LLMProvider + tipos LLMMessage, LLMContentBlock, LLMTool, LLMUsage, LLMStopReason, LLMResponse, LLMChatParams
      anthropic.ts  ← import "server-only"; AnthropicProvider(apiKey?): lee ANTHROPIC_API_KEY o apiKey param, AbortController timeout, disable_parallel_tool_use:true
      openai.ts     ← import "server-only"; OpenAIProvider(apiKey?): GPT-4o/mini/O1, tool_calls, stop reasons
      gemini.ts     ← import "server-only"; GeminiProvider(apiKey?): Gemini 2.0 Flash/1.5 Pro/Flash, history split, functionCall/Response mapping
      deepseek.ts   ← import "server-only"; DeepSeekProvider(apiKey?): OpenAI SDK con baseURL deepseek.com/v1; modelos deepseek-chat/reasoner
      groq.ts       ← import "server-only"; GroqProvider(apiKey?): OpenAI SDK con baseURL api.groq.com/openai/v1; modelos llama-3.3-70b-versatile/llama-3.1-8b-instant/gemma2-9b-it/mixtral-8x7b-32768
      openrouter.ts ← import "server-only"; OpenRouterProvider(apiKey?): OpenAI SDK con baseURL openrouter.ai/api/v1 + headers HTTP-Referer/X-Title; modelos NVIDIA Nemotron (:free suffix)
      index.ts      ← createProvider(name, apiKey?) factory para los 6 providers; LlmProviderName = "anthropic"|"openai"|"google"|"deepseek"|"groq"|"openrouter"; re-exports de tipos LLM
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
    ai-agents-phase03.test.ts         ← 66 tests: getDefaultAgentConfig, templates, schemas Zod (objetivo/personalidad/reglas/despliegue/conocimiento), SaveAgentDraftSchema, merge config
    ai-agents-engine.test.ts          ← 18 tests: prompt injection (mensajes+fuentes), esquema inválido, tool desconocida, turn limit, sandbox isolation (sin writes DB), API key faltante, recorte output, transfer detection, tools deshabilitadas, budget conocimiento
    inbox-phase08.test.ts             ← 29 tests: isWithinSchedule (DST, timezone boundaries, ventanas múltiples), takeover atómico (race condition simultánea — 0 rows = ya tomado), separación de notas (waConversationNotes nunca aparece como waConversationMessage), permisos por rol (viewer bloqueado en mutations), pausa global deployments, elegibilidad respuesta 24h (requiresTemplate: true), returnToAi, resolve/reopen, upsertSchedule (validación HH:MM + onConflictDoUpdate)
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
| `META_AD_LIBRARY_APP_ID` | App ID de la Meta App para Ad Library API. App activa: `3653638184801040` ("Synclead app") | Ad Research |
| `META_USER_ACCESS_TOKEN` | User Access Token con `ads_read` para Meta Ad Library API. Si no está seteado, el código usa `APP_ID\|APP_SECRET` como App Token. Tokens de Graph API Explorer duran 1h — para prod usar System User Token (no expira). Exchange `fb_exchange_token` falla para esta app (causa desconocida). | Ad Research |
| `ANTHROPIC_API_KEY` | API key de Anthropic (Claude). Fallback global si el org no configura su propia clave en `/dashboard/settings/ai-providers`. | Agentes IA |
| `OPENAI_API_KEY` | API key de OpenAI (GPT-4o, GPT-4o Mini, O1 Mini). Fallback global. | Agentes IA |
| `GOOGLE_AI_API_KEY` | API key de Google AI Studio (Gemini). Fallback global. Obtener en aistudio.google.com. Accesible desde Venezuela. | Agentes IA |
| `DEEPSEEK_API_KEY` | API key de DeepSeek. Fallback global. Requiere saldo pagado — NO es gratis. | Agentes IA |
| `GROQ_API_KEY` | API key de Groq. Fallback global. Gratis (14,400 req/día) pero bloqueado en Venezuela. | Agentes IA |
| `OPENROUTER_API_KEY` | API key de OpenRouter. Fallback global. Modelos `:free` disponibles pero inestables — disponibilidad cambia sin aviso. | Agentes IA |
| `CRON_SECRET` | Protege todos los endpoints `/api/cron/*`. Requerido también para el trigger inmediato desde el webhook WA. cron-job.org debe enviarlo como `Authorization: Bearer $CRON_SECRET`. | ✓ |

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
npx vitest run           # unit tests (1377 tests en 36 suites)
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
- [x] Meta Ads Insights Decision Center (`/dashboard/performance?tab=insights`)
  - [x] **Tab "Insights Meta"** en `performance/page.tsx` — disponible cuando `tab=insights`; muestra grid de accesos directos a clientes cuando no hay clientId seleccionado
  - [x] **`InsightsDecisionCenter.tsx`** — server component con `Promise.allSettled` para resiliencia individual; banner "no data" con link a config cuando no hay datos; sin conexión → estado vacío con link a configuración
  - [x] **`decision-repository.ts`** — `getActiveInsightsConnection`: filtra `isNotNull(adAccountId)` + `orderBy desc` para no devolver conexiones CAPI sin adAccountId; `CampaignMetricsRow` incluye `objective`, `realSales`, `realRevenue`, `revenueCurrency`, `costPerSale`; bridge Meta→SyncLead con fallback por nombre cuando `internalCampaignId` es null
  - [x] **`decision-engine.ts`** — `CampaignType` (`leads|sales|traffic|awareness|engagement|unknown`); scoring adaptado por tipo (awareness→CPM+reach, traffic→CTR+CPC, leads/sales→checkouts+ventas reales); reglas de decisión diferenciadas; recomendaciones tipo-específicas; `computeAccountHealth` usa `scoreForCampaign()` por tipo
  - [x] **`catalog-sync.ts`** — auto-vincula `internalCampaignId` por nombre al hacer sync usando `COALESCE` para respetar links manuales
  - [x] **`sync-engine.ts`** — fetcha currency de la cuenta vía `verifyAdsAccess()` al inicio del sync; guarda en cada fila de `ad_insights_daily` y en `onConflictDoUpdate`
  - [x] **Columna "Ventas"** en tabla de decisiones: ventas reales de SyncLead (`conversions` con `status=confirmed`), no eventos pixel. "Conv." renombrado a "Checkouts". Badge de tipo de campaña (Leads/Ventas/Tráfico/Alcance) sobre el nombre
  - [x] **Bug crítico**: `internalCampaignId` siempre era `null` porque `catalog-sync` nunca lo seteaba → ventas siempre 0. Fix bicapa: (1) catalog-sync auto-vincula en cada sync; (2) decision-repository fallback por nombre en query (funciona sin re-sync)
  - [x] **Bug**: `getActiveInsightsConnection` devolvía la conexión CAPI (sin adAccountId) en lugar de la de Insights. Fix: `isNotNull(metaConnections.adAccountId)`
  - [x] **Bug**: `currency: null` siempre en `ad_insights_daily`. Fix: `verifyAdsAccess()` al inicio del sync
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
  - [x] Schema Neon sincronizado a 48 tablas via `drizzle-kit push` (wa_client_config, message_templates, cron_runs, tracking_sites, etc. faltaban tras migrate). **2026-10-13: Phase 09 aplicada via `scripts/apply-phase09.ts` → 80 tablas total** (ai_pricing_tiers, ai_budget_limits, ai_budget_reservations + extensión ai_usage_records)
- [x] Diseño del dashboard y landing
  - [x] `src/components/app/DashboardNav.tsx` — nav principal con design system sg-*
  - [x] `src/components/landing/` — Hero, LandingNav, Sections, CapiDemo, KanbanDemo, Reveal, InView, Logo, Analytics, ProductTabs, Steps, data, ui
  - [x] `src/app/globals.css` — CSS custom properties sg-* (sg-app, bg-sg-bg, sg-border, sg-accent, sg-s1/s2/s3, sg-ink, sg-muted, sg-subtle, sg-radius)
  - [x] Dashboard refactorizado con DashboardNav + tokens sg-*
- [x] Hub de cliente con 4 tabs (Resumen / Leads / Configuración / Diagnóstico)
  - [x] `src/app/dashboard/clients/[id]/page.tsx` — refactorizado a tabs via `?tab=` URL param; max-w-7xl
  - [x] `_components/ClientHubTabs.tsx` — navegación de tabs con links SSR-friendly
  - [x] `_components/ClientResumenTab.tsx` — KPIs, campañas con métricas, checklist de configuración
  - [x] `_components/ClientLeadsTab.tsx` — tabla con todos los leads del cliente + filtros + campaña filter + LeadDrawer; chips de landing page por URL path; columna "Landing" clickeable; filtro `landingPage` via URL param
  - [x] `src/domains/leads/repository.ts` → `getLeadsByClient(clientId, orgId, filters)` vía inArray por campaignIds; filtro `landingPage` (ilike para path, isNull para "(sin seguimiento)"); `getClientLandingBreakdown(orgId, clientId)` agrupa TODOS los leads del cliente por pathname de `landing_url` (sin filtro de fechas)
  - [x] **`pixel.js` bug fix — `landing_url` faltaba**: la función `lead()` no incluía `landing_url: location.href` por defecto. Leads de `/lp/promo50` se almacenaban como `/` porque los formularios no pasaban la URL. Fix: `landing_url` ahora es parte del `Object.assign` base en `lead()`, no depende del caller.
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
- [x] Historial CAPI + envío directo por lead
  - [x] `src/domains/health/repository.ts` — `getOrgMetaEvents(orgId, clientId?, limit)` + `getClientMetaEvents(orgId, clientId, limit)`: LEFT JOIN leads para `leadName`; `ClientMetaEventRow` type incluye `leadId` para detectar huérfanos
  - [x] `src/domains/health/actions.ts` — `sendSingleCapiEventAction(eventId)`: envía evento individual via `sendMetaEventDirect`; `cancelOrphanCapiEventsAction()`: cancela pending/retrying cuyo lead fue eliminado; `getOrgMetaEventsAction(clientId?, limit)` y `getClientMetaEventsAction(clientId, limit)`
  - [x] `src/app/dashboard/health/_components/HealthCapiLogPanel.tsx` — panel historial CAPI con tabs all/pending/failed/sent; per-event "Enviar" button (funciona incluso para huérfanos — payload en DB); "Cancelar huérfanos" button; huérfanos con fondo rojo + muestra primeros 8 chars del leadId eliminado; state `sendingEventId` por evento
  - [x] `src/app/dashboard/health/_components/HealthDashboard.tsx` — monta `<HealthCapiLogPanel clientId={selectedClientId} />` al final del dashboard
  - [x] `src/domains/leads/repository.ts` — query `hasPendingCapi` ahora filtra `ne(metaEvents.eventName, "Purchase")` — el flag solo refleja eventos de comportamiento, no ventas pendientes
  - [x] `src/domains/leads/actions.ts` — `sendLeadPendingCapiAction(leadId)`: envía en paralelo todos los pending/retrying no-Purchase via `Promise.allSettled`
  - [x] `src/app/dashboard/campaigns/[id]/leads/_components/LeadsView.tsx` — ⚡ convertido en botón clickeable; `sendingCapiLeadId` state; `handleSendLeadCapi()` llama `sendLeadPendingCapiAction`; `e.stopPropagation()` evita abrir drawer
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
- [x] Rastreo de visitantes — visitor tracking + Visitantes de Meta
  - [x] **Columnas nuevas en `conversion_observations`**: `visitor_id` (text), `utm_source`, `utm_medium`, `utm_campaign`, `referrer` (text), `fbc`, `fbp` — persisten contexto de atribución por observación; `visitor_id` es la clave para agrupar sesiones
  - [x] **`/api/collect/[token]/route.ts`**: campos `fbc`/`fbp` en schema Zod cambiados de `.optional()` a `.nullish()` (CRÍTICO: `.optional()` rechaza `null` silenciosamente → 400 sin log); lógica de atribución tardía: si el payload trae `fbc` y no hay `utm_source` de otro origen, se inferyen `utmSource: "facebook"` y `utmMedium: "cpc"` automáticamente
  - [x] **`buildDiagnosticScript` (TestWizard) y `buildScript` (ScriptInstallPanel)**: ambos actualizados con el mismo snippet unificado — `getCookie()`, `getVisitorId()` (localStorage `_sl_vid`), IIFE de captura first-touch UTMs (`_sl_utm_source/medium/campaign/content`), fbclid → `_sl_fbc` localStorage, payload completo con `visitorId/utmSource/utmMedium/utmCampaign/referrer/fbc/fbp`, `sendToDiagnostic('PageView', {})` automático al cargar; patrón `|| undefined` para omitir claves ausentes del JSON (nunca `null`)
  - [x] **`ScriptInstallPanel`**: script de Configuración del cliente es ahora el script canónico de instalación — rastrea todos los visitantes (orgánico, directo, paid) y eventos del pixel; FIXES array actualizado con "Rastreo de visitantes" y "Atribución de tráfico"
  - [x] **`InstallationDrawer` (SyncLead Pixel tab)**: `siteId` prop + `useEffect` que llama `getOrCreateSiteCollectTokenAction(siteId)` al montar; inyecta el token real en el snippet (`TU_TOKEN_AQUI` → token real); `fbc`/`fbp` en snippet usan `|| undefined`
  - [x] **`ConversionList`**: prop `siteId?: string | null` propagada hasta `InstallationDrawer`
  - [x] **`/tracking/visitors` (Visitantes de Meta)**: página SSR que muestra solo visitantes de campañas Meta; filtro en `getVisitorSessionsByClient()` via `or(ilike(utmSource, "%facebook%"), ilike(utmSource, "%instagram%"), ilike(utmSource, "%whatsapp%"))` — cubre todos los placements de Meta Ads Manager incluyendo WhatsApp; stats de fuentes en el header
  - [x] **`/tracking/visitors/[visitorId]`**: página de detalle con journey completo del visitante (eventos cronológicos, UTMs, fbc/fbp, país/ciudad, primera y última visita)
  - [x] **`getVisitorSessionsByClient()` en `repository.ts`**: consulta con filtro Meta (ilike), agrupa por `visitor_id`, devuelve `VisitorSessionRow` con `visitorId`, `firstSeen`, `lastSeen`, `eventCount`, `firstEventName`, `utmSource/Campaign`, `referrer`, `visitorCity/Country`
  - [x] **`CheckoutFunnelWidget`** (nuevo en `tracking/_components/`): widget de abandono de checkout — ratio `begin_checkout` vs completed; barra de progreso con color según tasa de abandono; desglose por fuente de tráfico; selector 7/30/90 días con `useTransition`
  - [x] **`getCheckoutFunnelAction(clientId, days)`** en `actions.ts` + `getCheckoutFunnelMetrics(orgId, clientId, days)` en `repository.ts`: agrega eventos `begin_checkout` y `purchase` de `lead_behavior_events` por `utm_source`, calcula tasa de abandono
  - [x] **`TrackingDashboard`**: pasa `selectedSiteId` a `ConversionList`; recibe `checkoutFunnel` prop; sección "Visitantes de Meta" con link a `/tracking/visitors`
  - [x] **`tracking/page.tsx` y `clients/[id]/page.tsx`**: ambas páginas cargan `getCheckoutFunnelAction(id, 30)` en paralelo y pasan `checkoutFunnel` a `TrackingDashboard`
  - [x] **Decisiones críticas de este módulo**:
    - `z.string().nullish()` para `fbc`/`fbp` en el schema Zod del endpoint collect — `.optional()` acepta `undefined` pero rechaza `null`; `JSON.stringify({fbc: undefined})` omite la clave pero `{fbc: null}` la incluye → llegaba `null` al servidor → 400 silencioso → TODOS los eventos sin fbc eran descartados → el feed siempre mostraba solo visitantes de Facebook (tenían fbc real)
    - Patrón `|| undefined` en snippets: `getCookie('_fbc') || localStorage.getItem('_sl_fbc') || undefined` — garantiza que el valor sea `string | undefined`, nunca `null`; `JSON.stringify` omite claves `undefined`
    - `ilike` de `drizzle-orm` para matching case-insensitive de fuentes Meta — cubre variantes "facebook", "Facebook", "Facebook Ads", etc.
    - `sendToDiagnostic('PageView', {})` al final del IIFE — registra TODO visitante (orgánico, directo, paid) inmediatamente al cargar la página, habilitando el feed en vivo y la sección Visitantes
- [x] Investigador de Anuncios (`/dashboard/ad-research`)
  - [x] **Dominio `src/domains/ad-research/`**: `types.ts` (`AdResult`, `SavedAd`, `AdCollection`, `AdPlatform`), `repository.ts` (saveAd, getSavedAds, deleteSavedAd, createCollection, getCollections, deleteCollection, updateSavedAdNotes, moveToCollection, importAdFromUrl), `actions.ts` (searchAdsAction, saveAdAction, deleteAdAction, createCollectionAction, getSavedAdsAction, deleteCollectionAction, moveAdToCollectionAction, importAdFromUrlAction), `fetch-preview.ts` (fetchAdPreviewAction — Googlebot OG scraping server-side)
  - [x] **`src/lib/ad-research/meta.ts`**: `searchMetaAds()` via Graph API `ads_archive`; usa `META_USER_ACCESS_TOKEN` primero (fallback a `APP_ID|APP_SECRET`); re-lanza `META_ACCESS_PENDING:subcode` (code 10), `META_TOKEN_EXPIRED` (code 190/102) y `META_API_ERROR:{code}` para que el caller los maneje; logging temporal de `{ code, subcode, message, title }` en console.error para diagnóstico; parámetro `ad_type: 'ALL'`. **Estado 2026-10-06**: error confirmado como `code 10, subcode 2332002` — causa más probable: app en modo Development. Pendiente verificar en `developers.facebook.com/apps/3653638184801040/settings/basic/` y cambiar a Live mode. Business verificado ✅, identidad verificada ✅, `ads_read` en App Review ✅ — falta solo el modo Live y/o confirmación en portal del usuario del token.
  - [x] **`src/lib/ad-research/tiktok.ts`**: `searchTikTokTopAds()` — endpoint `ads.tiktok.com/creative_radar_api/v1/top_ads/list` retorna 404 (dead); TikTok deshabilitado en UI con badge "próximamente"
  - [x] **DB**: tablas `adResearchCollections` + `adResearchItems` en `schema.ts`; ambos lados de relaciones declarados; migración aplicada en Neon via `scripts/apply-ad-research.ts`
  - [x] **`AdResearchDashboard.tsx`**: tabs Buscar / Guardados; estado `pendingAccess` muestra banner con link a `facebook.com/ads/library/api/` cuando Meta retorna access-pending
  - [x] **`AdSearchForm.tsx`**: búsqueda Meta + TikTok (checkbox deshabilitado); default platforms: `["meta"]`
  - [x] **`AdCard.tsx`**: renderiza anuncios de búsqueda y guardados; tres estados de media: (1) video directo → `<video>` inline con `controls`, (2) video CORS + thumbnailUrl → imagen + play overlay, (3) video CORS sin thumbnail → "Ver video" link; `isDirectVideo = /\.(mp4|webm|mov|avi|m4v)(\?|$)/i.test(firstMedia)`; botón "Guardar" con dropdown de colección; botón mover entre colecciones para guardados
  - [x] **`AdLibrary.tsx`**: grid de anuncios guardados; filtros por plataforma/colección; botón "Importar desde URL"
  - [x] **`ImportFromUrlForm.tsx`**: formulario manual URL→SavedAd; auto-detect plataforma por URL; auto-fetch OG metadata 800ms debounce (`fetchAdPreviewAction`); `MediaPreview` con fallback CORS; campo "Imagen de portada" para videos; campos: url/advertiser/title/body/mediaUrl/thumbnailUrl/notes/tags/collection
  - [x] **Decisiones de video**: regex `/\.(mp4|webm|mov|avi|m4v)(\?|$)/i` requerido para URLs con query params (`...mp4?_nc_cat=109...`); `fbcdn.net` videos bloqueados por Referer restriction del CDN de Facebook — no se pueden reproducir desde dominio externo sin el header correcto; solución: mostrar thumbnail + play button como overlay que enlaza al original
- [x] Mejoras de visitantes y vínculo leads ↔ sesiones
  - [x] **Banderas de conversión en `VisitorsTab`**: `VisitorSessionRow` ahora tiene `hasFormSubmit`, `hasPurchase`, `hasInfoRequest` además de `hasCheckout/hasAddToCart/hasViewProduct`. Todos los badges se muestran simultáneamente (sin exclusión por prioridad). Orden: compra (emerald) → checkout (orange) → lead/form (green) → carrito (amber) → info (indigo) → producto (sky). Nuevos filtros en la barra de acciones: "Con compra" y "Envió formulario". El filtro "Solo navegación" excluye todos los tipos.
  - [x] **`leads.visitor_id` (nueva columna)**: `text("visitor_id")` nullable en la tabla `leads`; aplicada en Neon via `ALTER TABLE leads ADD COLUMN IF NOT EXISTS visitor_id text`.
  - [x] **`pixel.js` envía `visitor_id`**: la función `lead()` usa `ctx()` para incluir `visitor_id` (= `_sl_vid` de localStorage), `fbc` y `fbp` en el payload de cada submit de formulario. Antes solo enviaba UTMs. Esto vincula cada lead nuevo a su sesión de visitante.
  - [x] **Pipeline de ingest actualizado**: `LeadDataSchema` acepta `visitor_id`; `NormalizedLead` tiene `visitorId: string | null`; `normalizeLeadData` lo propaga; `persistLead` lo guarda en DB.
  - [x] **`getLeadsLinkedToVisitor(orgId, clientId, visitorId)`** en `tracking/repository.ts`: busca leads por `visitor_id` dentro de las campañas del cliente; retorna `LinkedLeadRow[]` con nombre, teléfono, email, campaña, temperatura, stage y fecha.
  - [x] **Página de detalle del visitante** (`/tracking/visitors/[visitorId]`): muestra tarjeta "Lead vinculado" (fondo verde) cuando hay leads asociados — nombre, temperatura badge, teléfono, email, campaña, fecha y botón "Ver lead" (link a tab leads filtrado por nombre). Solo aplica a leads creados desde que se deployó el fix.
  - [x] **Decisión crítica**: `pixel.js` `lead()` usaba solo `utms()` (source/medium/campaign/content desde localStorage) — sin `visitor_id`, `fbc` ni `fbp`. El vínculo visitor→lead era imposible. Fix: `lead()` llama `ctx()` y hace `Object.assign` con `visitor_id: c.visitorId` y condicionales `c.fbc?{fbc:c.fbc}:{}` / `c.fbp?{fbp:c.fbp}:{}`. Leads anteriores no tienen `visitor_id` — son datos perdidos que no se pueden retroactivamente enlazar.
- [x] Drill-down de leads, exportación XLSX y correcciones de visitantes
  - [x] **`PerformanceView.tsx` — número de leads clickeable**: en la tabla de Rendimiento, el campo `totalLeads` de cada fila ahora es un `<Link>` que navega a `/dashboard/campaigns/${row.campaignId}/leads` (abre en nueva pestaña). `e.stopPropagation()` previene interferencia con el sort de columna. Permite ir directamente a los leads de cualquier campaña desde la vista de rendimiento.
  - [x] **`LeadsView.tsx` — exportación XLSX con WhatsApp**: botón "Exportar" (ícono `Download`) visible cuando `leads.length > 0`. Llama `exportLeadsXlsx(leads, campaign.name)` que usa la librería `xlsx` (v0.18.5). 15 columnas: Nombre/Teléfono/Email/Ciudad/Temperatura/Etapa/Fuente/Conjunto/Anuncio/Asignado/Ventas/Monto/Moneda/WhatsApp/Fecha. La columna "WhatsApp" contiene `https://wa.me/{phone_digits}` y además se inyecta un hyperlink real en cada celda vía `ws[cellRef].l = { Target: url }`. Nombre de archivo: `leads_{campaign_name}_{fecha}.xlsx`.
  - [x] **`VisitorsTab.tsx` — badge "lead ↗" clickeable (card-link pattern)**: cada fila de sesión en el tab Visitantes usa un patrón de card-link CSS: un `<Link>` absoluto cubre toda la fila (destino: detalle del visitante), el contenido tiene `pointer-events-none` para que los clicks pasen al link de fondo. El badge "lead" (form submit) tiene `pointer-events-auto relative z-10` para capturar su propio click. Si la sesión tiene `linkedLeadId` + `linkedCampaignId`, el badge se convierte en `<Link href={leadSearchUrl}>lead ↗</Link>` que abre la página de leads de esa campaña con el nombre del lead precargado en el buscador. Si no hay lead vinculado, muestra el badge estático sin link.
  - [x] **`tracking/repository.ts` — vinculación leads ↔ sesiones (Step 3)**: `getVisitorSessionsByClient()` amplía `VisitorSessionRow` con tres campos: `linkedLeadId: string | null`, `linkedCampaignId: string | null`, `linkedLeadName: string | null`. Después del loop de agregación de sesiones, un paso batch adicional: obtiene todos los `visitor_id` con `hasFormSubmit=true`, consulta `leads` filtrando por `inArray(leads.visitorId, submitVisitorIds)` y `inArray(leads.campaignId, clientCampaignIds)` con `eq(leads.orgId, orgId)`, construye un Map `visitorId → {leadId, campaignId, leadName}` (primer lead ganador), y enriquece cada sesión del map. Solo vincula leads de campañas del cliente actual para garantizar aislamiento multi-tenant.
  - [x] **`pixel.js` — `landing_url` con sessionStorage (fix SPA)**: en SPAs (Next.js), `location.href` refleja la ruta actual en el momento que se ejecuta `lead()`, no la URL original de aterrizaje. Fix: al cargar el pixel, se guarda `location.href` en `sessionStorage._sl_lp` si no existe (`sessionStorage` se resetea por tab). La función `lead()` lee `sessionStorage.getItem('_sl_lp') || location.href` para capturar siempre la primera URL de la sesión. Esto corrige el bug donde leads de `/lp/promo50` se registraban como `/` al navegar a otra ruta antes de enviar el formulario.
- [x] Rediseño visual completo — sistema `ops-*` (commit `f0a6aa1`)
  - [x] **`src/app/globals.css`** — paleta light-mode nueva en `html.light .sg-app`: coral #F0684D, navy #12142A, teal/green #12B48A, blue #3E5CFA; tokens `--ops-coral-bg`, `--ops-blue-bg`, `--ops-green-bg`, `--ops-amber-bg`; `--ops-card-shadow`; `--ops-th-bg` (#FAFAFC para headers de tabla). Dark mode (`.sg-app` sin `html.light`) conservado intacto. `defaultTheme="light"`, `storageKey="sl-theme-v2"` (reset de preferencia antigua `sl-theme=dark`).
  - [x] **`src/components/app/ops.tsx`** — reescrito: `Panel` (variantes white/navy/coral, `rounded-[20px]`, `shadow-ops-card`), `KPICard` (icon badge 40×40 `rounded-xl` pastel, valor 32px bold, delta pill `rounded-full`), `StatusChip` (`rounded-full` con borde y punto), `PageHeader` (prop `eyebrow`), `EmptyState` (`rounded-[20px]`), `opsBtnPrimary` (coral `rounded-full`), `opsBtnSecondary` (blanco borde `rounded-full`), `opsBtnNavy`, `opsTable` con `bg-ops-th-bg` en `.th`.
  - [x] **`DashboardSidebar.tsx`** — sidebar clara (sin `ops-always-dark`), 232px, active item `bg-ops-sel text-ops-blue rounded-full`, workspace badge `rounded-xl bg-ops-blue-bg`, botones footer `rounded-full`.
  - [x] **`DashboardNav.tsx`** — añadidos Visitantes (`/dashboard/visitors`, `ScanEye`) e Insights Meta (`/dashboard/insights-meta`, `Sparkles`) al grupo Análisis.
  - [x] **`ThemeToggle.tsx`** — `rounded-full` (era `rounded-md`), `hover:bg-ops-hover` (era `hover:bg-ops-raised`).
  - [x] **Páginas rediseñadas (solo visual, sin cambios de lógica)**:
    - Dashboard home: eyebrow "PANORAMA GENERAL", KPIStrip con tarjetas independientes + icon badges, SummaryPanel navy, CampaignTable con `opsTable`, QualityPanel con chips `rounded-full`
    - Performance: eyebrow "RENDIMIENTO", tab switcher pill `rounded-full`, SummaryCards con `rounded-[20px]` y `bg-ops-*-bg`, PerformanceView con `rounded-full` segmented control
    - Campaigns: eyebrow "CAMPAÑAS", `opsBtnPrimary`, `StatusChip` para estado activo/pausado
    - Clients: eyebrow "CLIENTES", `opsBtnPrimary`, `StatusChip` para activo/inactivo
    - Funnels: eyebrow "EMBUDOS", lead cards `rounded-[20px] bg-ops-s1 shadow-ops-card`, columnas kanban `rounded-[20px]`, column header uppercase tracking, botones `opsBtnPrimary`; FunnelDialog zinc-* → ops-*
    - Health: eyebrow "DIAGNÓSTICO", `opsBtnSecondary`/`opsBtnPrimary`, HealthCapiLogPanel con `Panel` wrapper, tabs `rounded-full`, orphan rows `bg-ops-coral-bg`
    - Import: eyebrow "IMPORTAR", wizard steps `rounded-[20px] shadow-ops-card`, dropzone `rounded-[20px] border-2 border-dashed`, `opsBtnPrimary`/`opsBtnSecondary`
    - Team settings: eyebrow "EQUIPO", role chips `StatusChip` (owner=blue/admin=coral/manager=amber/agent=green/viewer=neutral), `opsField` inputs, `opsBtnPrimary`
    - Account settings: eyebrow "CUENTA", `opsField` inputs, `opsBtnPrimary`/`opsBtnSecondary`, dropzone `rounded-[20px]`
    - Reports: eyebrow "REPORTES", Panel wrapping, `opsTable`, pill buttons
    - Ad Research: eyebrow "INVESTIGADOR DE ANUNCIOS", tabs pill `rounded-full`, card borders ops tokens
  - [x] **`/dashboard/visitors`** (rediseñado como sección principal potenciada): fusiona `/dashboard/visitors` y `/dashboard/performance?tab=visitantes` (tab eliminado + redirect). Layout full-screen con chips de cliente (router.push), selector 7/30/90 días, 7 KPIs (únicos/con intención/leads vinculados/checkouts/carritos abandonados/compras/avg sesión), 3 capas de filtros instantáneos por estado (fuente/landing/acción), filtro "Carrito abandonado" nuevo (hasCheckout && !hasPurchase), strip de leads generados por landing, lista de sesiones con card-link al detalle del visitante. `VisitorsTab.tsx` eliminado.
  - [x] **`/dashboard/insights-meta`** (nueva página): estado "no conectado" con `Panel` + `EmptyState`, chip "No conectado", botones "Conectar Meta" y "Ver diagnóstico". Sección de vista previa borrosa (backdrop-blur) con ribbon "VISTA PREVIA" + datos de ejemplo estáticos (tarjetas canales, tabla señales, panel navy Radar de intención). Sin API wiring, sin tablas nuevas.
- [x] Agentes IA — Fase 08: Bandeja real y controles de despliegue (2026-10-10)
  - [x] Schema: tabla `wa_conversation_notes` (notas privadas, `authorId → user.id`, `conversationId → wa_conversations`); tabla `ai_deployment_schedules` (IANA timezone + windows JSONB, UNIQUE deploymentId); columnas `paused/paused_at/paused_by` en `ai_agent_deployments`
  - [x] Migración: `drizzle/0021_phase08_inbox.sql`
  - [x] `inbox-repository.ts`: filtros bandeja, paginación, lastMessage preview batch, takeover atómico (WHERE controlMode != 'human' + cancel queue), returnToAi, resolve/reopen, notas privadas, `isWithinSchedule` DST-safe
  - [x] `inbox-actions.ts`: todas las acciones de la bandeja; `replyAction` con lookup phone creds + 24h eligibility (requiresTemplate); `upsertScheduleAction` con validación HH:MM + onConflictDoUpdate; `toggleDeploymentPauseAction` (manager+)
  - [x] `TabDespliegue.tsx` + `AgentEditor.tsx`: panel pausa/activar deployment + editor de horario IANA con ventanas por día de semana
  - [x] UI: `/dashboard/inbox` (InboxView + ConversationCard + filtros + polling backoff); `/dashboard/inbox/[conversationId]` (ConversationView + MessageList + ReplyBox + ActionBar + LeadPanel + NotesPanel)
  - [x] `DashboardNav.tsx`: enlace "Bandeja" (`Inbox` icon) añadido al grupo Agentes IA
  - [x] `inbox-phase08.test.ts`: 29 tests pasando — race condition takeover, DST timezone, separación de notas, permisos por rol, pausa global, elegibilidad 24h, returnToAi, resolve/reopen, upsertSchedule
- [x] Agentes IA — Fase 09: Consumo real y analíticas (2026-10-10)
  - [x] Migración: `drizzle/0022_phase09_usage_budget.sql` — tablas `ai_pricing_tiers` (tarifas versionadas Anthropic published), ALTER `ai_usage_records` (+10 cols: cacheReadTokens, cacheWriteTokens, totalCostMillicents, isSandbox, callType, inputCostMillicents, outputCostMillicents, cacheReadCostMillicents, cacheWriteCostMillicents, pricingTierId), `ai_budget_limits` (UNIQUE orgId, alertThresholdPct), `ai_budget_reservations` (UNIQUE queueItemId, status enum, settledAt). Seed: Sonnet 4.6 (300/1500/30/375 mc/1000tok), Haiku 4.5 (80/400/8/100 mc/1000tok)
  - [x] Schema: 3 nuevas tablas + relaciones + 6 tipos exportados (AiPricingTier, AiBudgetLimit, AiBudgetReservation + New*)
  - [x] `LLMUsage`: +`cacheReadTokens?`, `cacheWriteTokens?` — mapeados desde SDK Anthropic `cache_read_input_tokens`/`cache_creation_input_tokens` con safe cast + `?? 0`
  - [x] `EngineResult`: +`totalCacheReadTokens`, `totalCacheWriteTokens` — acumulados en loop del engine
  - [x] **Bug fix crítico**: `recordUsage()` sobreescribía `tokenCountIn/Out` en `aiEpisodes` en lugar de acumular — corregido a `sql\`token_count_in + ${n}\``
  - [x] `cost-calculator.ts`: `getActivePricingTier`, `resolveModelPricingTier` (exact + fuzzy family), `computeCostMillicents` (millicents/1000tokens — no floats), `computeConservativeReservationMillicents` (+20% buffer), `formatMillicentsAsUsd` ("N/D" si null), `getModelDisplayName`
  - [x] `budget-repository.ts`: `getBudgetLimits`, `upsertBudgetLimits` (onConflictDoUpdate UNIQUE orgId), `getOrgSpendMillicents` (confirmed + active reservations), `getConversationSpendMillicents`, `checkBudgetAndReserve` (discriminated union, onConflictDoNothing UNIQUE queueItemId), `settleReservation` (WHERE status='reserved' — no double-settle), `releaseOrphanedReservations` (30min cutoff), `getDailyBudgetAlertStatus`
  - [x] `analytics-repository.ts`: `getEpisodeSummary` (multi-step, cero denominadores → null, filtro agentId via versiones), `listConversationsWithEpisodes` (paginado, batch-load), `getDailyUsageSeries` (GROUP BY DATE)
  - [x] `repository.ts`: `recordUsage()` ahora persiste los 9 campos nuevos de Phase 09; bug fix tokenCount accumulation
  - [x] `ai-message-processor/route.ts`: Step 0.5 (orphan cleanup), Step 3.5 (pricing tier → conservative estimate → budget check → deny: waiting_human + endEpisode(budget)), Step 11 (compute real cost → recordUsage con costos → settleReservation consumed), catch (settleReservation released)
  - [x] `simulator-action.ts`: usa `resolveModelPricingTier + computeCostMillicents + formatMillicentsAsUsd` (real pricing de DB); `SimulatorDebugInfo.estimatedCost` con cacheTokens y pricingSource
  - [x] `budget-actions.ts`: `getBudgetLimitsAction`, `upsertBudgetLimitsAction` (owner/admin only), `getBudgetStatusAction` (daily + monthly spend + alert)
  - [x] `analytics-actions.ts`: `getEpisodeSummaryAction`, `listConversationsAction`, `getDailyUsageSeriesAction` — Server Actions con validación Zod
  - [x] UI: `/dashboard/agents/analytics/` — `AnalyticsDashboard` (filtros fecha/agente), `UsageSummaryCards` (12 KPIs en 3 rows), `EpisodesTable` (paginada, definición de métricas en footer), `BudgetStatusBar` (progress bar + alert threshold)
  - [x] `DashboardNav.tsx`: enlace "Analíticas" (`ChartColumn` icon) añadido al grupo Agentes IA; `isActive` actualizado para prefer longest match (evita conflicto /agents vs /agents/analytics)
  - [x] `ai-agents-phase09.test.ts`: 35 tests — costo Sonnet/Haiku (formula mc/1000tokens), cache barato vs caro, zero tokens, null cache rates, reserva conservadora (+20%), formatMillicentsAsUsd (null→N/D, boundary 0.00001), multi-tenant isolation, denominador cero, exit reasons sin duplicar, unique leads deduplication, tokenCount acumulativo (bug fix), isSandbox, millicents precision, concurrencia de presupuesto
- [x] Agentes IA — Fase 13: Multi-provider + crons externos + respuesta rápida (2026-10-11)
  - [x] **Fix error de build Vercel**: `formatMillicentsAsUsd` y `getModelDisplayName` extraídas a `cost-utils.ts` (sin `server-only`) — `EpisodesTable.tsx`, `UsageSummaryCards.tsx` y `budget-actions.ts` importan desde ahí. `cost-calculator.ts` conserva el `import "server-only"` para DB queries.
  - [x] **Crons Vercel eliminados**: removidos 4 crons de frecuencia alta de `vercel.json` (`* * * * *` y `*/10 * * * *`) que causaban fallo en Hobby plan. Solo quedan 3 crons diarios (`cleanup`, `meta-insights-sync`, `retention-cleanup`). Los 4 crons de IA se manejan externamente via cron-job.org.
  - [x] **Respuesta inmediata (~5s)**: `api/webhook/wa-cloud/[wabaId]/route.ts` dispara un fetch fire-and-forget a `/api/cron/ai-message-processor` tras enqueue — el agente responde en el tiempo de procesamiento de Claude (~5s) en lugar de esperar el siguiente cron (hasta 60s).
  - [x] **Multi-provider LLM**: `OpenAIProvider` (`src/lib/llm/openai.ts`) — GPT-4o, GPT-4o Mini, O1 Mini; `GeminiProvider` (`src/lib/llm/gemini.ts`) — Gemini 2.0 Flash, 1.5 Pro, 1.5 Flash. Ambos implementan `LLMProvider`. `createProvider(name, apiKey?)` factory en `index.ts`.
  - [x] **`AgentPersonalidadConfig`**: +`llmProvider: AgentLlmProvider` + `llmModel: string`. `LLM_MODELS` catalog en `types.ts` con opciones por proveedor. `TabPersonalidad.tsx` muestra RadioGroup de proveedor + grid de modelo.
  - [x] **AI Provider API Keys** (`/dashboard/settings/ai-providers`): tabla `ai_provider_keys` (migración `0025`), cifradas AES-256-GCM por `(org_id, provider)`. Repository `provider-keys-repository.ts` + actions `provider-keys-actions.ts` (owner/admin). UI con tarjeta por proveedor: badge estado, show/hide key, guardar, eliminar, link a docs. Nav link "Proveedores IA" (KeyRound, adminOnly) bajo Agentes IA.
  - [x] **Engine usa clave de DB**: `runEngine()` llama `getProviderApiKey(orgId, provider)` → si existe en DB la usa, si no usa env var. Constructores de los tres providers aceptan `apiKey?: string` opcional.
  - [x] **`CRON_SECRET` generado**: `da52bf7c0c9cc8dff28735ca7811d91a2f97d5ad4b765bde9f9a21cde4b94802` — guardado en `.env.local`; pendiente agregar en Vercel → Settings → Environment Variables.
  - [x] Decisiones críticas: millicents = 1/100_000 USD (bigint, sin floats); rates almacenadas mc/1000tokens (tokens < 1mc cada uno); source `anthropic_published` ≠ tarifas Callbell; costos WhatsApp siempre "N/D" (sin datos verificados, nunca cero supuesto); budget exhaustion → `waiting_human` + endEpisode("budget") (nunca chat invisible)
- [x] Fixes de bugs y limpieza de código muerto (2026-10-13)
  - [x] **Bug crítico auth**: `requireOrganizationMembership()` en `server.ts` usaba `db.select()` en lugar de `db.query.orgMembers.findFirst` — los mocks de ambas suites de seguridad solo interceptan `findFirst`, por lo que los 48 tests de auth/permisos fallaban silenciosamente. Restaurado a `findFirst`. Tests: 1377/1377 pasando.
  - [x] **`calculateTemperature` eliminada**: función en `src/domains/leads/normalize.ts` junto con `MAJOR_CITIES`. `NormalizedLead` ya no tiene campo `temperature` — `persist.ts` siempre guarda `"cold"` y delega calificación real a `autoQualifyLeadInternal`. 12 tests de la función también eliminados.
  - [x] **Phase 09 migration aplicada**: `scripts/apply-phase09.ts` → Neon DB tiene **80 tablas**. `ai_pricing_tiers` (rates Sonnet 4.6 + Haiku 4.5 seeded), `ai_budget_limits`, `ai_budget_reservations`, 10 columnas nuevas en `ai_usage_records`. El sistema de presupuestos de IA está ahora operativo en DB.
- [x] Rediseño full-screen campañas, clientes y visitantes (2026-10-13)
  - [x] **`CampaignsView.tsx`** reescrito: layout `flex min-h-full flex-col` (sin PageShell), chips de cliente horizontal scrollable con `router.push` para cambio de datos, KPIs strip (total/activas/pausadas/leads/ventas), grid `CampaignCard` (leads count 4xl, status badge, toggle activo, "Ver leads" primary, scripts/editar/eliminar), card "Nueva campaña" dashed al final, delete confirm inline
  - [x] **`ClientsView.tsx`** reescrito: mismo patrón full-screen, chips de estado (Todos/Activos/Inactivos) con useState (sin reload), KPIs strip (total/activos/inactivos/con CAPI), grid `ClientCard` (indicadores CAPI/Pixel/WA con CheckCircle2/XCircle, toggle activo, "Ver cliente" primary, editar/eliminar), card "Nuevo cliente" dashed al final
  - [x] **`/dashboard/visitors` + `VisitorsView.tsx`** creados (sección potenciada fusionando ambos orígenes): ver entrada anterior en rediseño visual
  - [x] **`/dashboard/performance?tab=visitantes` eliminado**: `VisitorsTab.tsx` borrado; `?tab=visitantes` hace `redirect()` server-side hacia `/dashboard/visitors` (con `clientId` si estaba en la URL)
  - [x] **Patrón de diseño canonizado**: todas las secciones principales del dashboard usan `flex min-h-full flex-col`, chips de filtro horizontal scrollable (`bg-ops-blue text-white` activo), KPIs strip con dividers `h-4 w-px bg-ops-line`, card grid `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4`, cards `rounded-[20px] border-ops-line shadow-ops-card`, delete confirm inline (`confirmDeleteId` state)
- [x] Agentes IA — Fase 13 (cont.): DeepSeek + Groq + OpenRouter + fixes de prompt (2026-10-11)
  - [x] **DeepSeek provider** (`src/lib/llm/deepseek.ts`): OpenAI SDK con `baseURL: "https://api.deepseek.com/v1"`; modelos `deepseek-chat` y `deepseek-reasoner`. `ProviderName` actualizado en `provider-keys-repository.ts` para incluir `"deepseek"`.
  - [x] **Groq provider** (`src/lib/llm/groq.ts`): OpenAI SDK con `baseURL: "https://api.groq.com/openai/v1"`; modelos `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `gemma2-9b-it`, `mixtral-8x7b-32768`. Gratis pero inaccesible desde Venezuela.
  - [x] **OpenRouter provider** (`src/lib/llm/openrouter.ts`): OpenAI SDK con `baseURL: "https://openrouter.ai/api/v1"` + headers `HTTP-Referer: $NEXT_PUBLIC_APP_URL` y `X-Title: SyncLead`. Modelos actuales gratuitos: NVIDIA Nemotron series (`nvidia/nemotron-3-ultra-550b-a55b:free`, `nvidia/nemotron-3-super-120b-a12b:free`, `nvidia/nemotron-3.5-lightning:free`, `thinkingmachines/inkling:free`). Los modelos Llama 3.3 70B, DeepSeek y Qwen YA NO son gratis en OpenRouter.
  - [x] **`LLM_MODELS` catalog en `types.ts`** actualizado para los 6 providers; `AGENT_LLM_PROVIDERS` incluye todos; `DEFAULT_LLM_MODEL` por provider; `TabPersonalidad.tsx` con `PROVIDER_LABELS` completo; `AiProvidersView.tsx` con estados para los 6 providers.
  - [x] **Fix `{{nombre_empresa}}`**: `prompts.ts` resuelve el placeholder con `internalName` vía `.replace(/\{\{nombre_empresa\}\}/gi, ...)` antes de incluir la presentación en el prompt.
  - [x] **Fix repetición de saludo**: sección `## Saludo inicial` separada de `## Identidad` con instrucción explícita; + Step 7.5 en el processor inyecta el saludo resuelto como mensaje sintético de assistant cuando ya existe historial real pero no hay mensajes AI previos cargados.
  - [x] **Instrucciones de tools directivas**: `## Instrucciones de herramientas` reescrito con regla CUÁNDO por tool — especialmente `assign_to_rep: INMEDIATAMENTE si el lead pide hablar con un humano`. Commit `9f28ed3`.
  - [x] **Queries paralelas en processor**: Steps 5+6 (historial + lead context) con `Promise.all` — reduce latencia ~200-500ms.
