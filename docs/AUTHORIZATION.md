# AUTHORIZATION.md — SyncLead v2
**Actualizado:** 2026-09-19

---

## Decisión: Aislamiento a nivel de aplicación (no RLS)

**Razón técnica:** Neon usa un pooler de conexiones (PgBouncer) en modo `transaction`. PostgreSQL RLS depende de variables de sesión (`SET app.user_id = ...`), que en modo `transaction` NO persisten entre transacciones — cada transacción puede correr en una conexión diferente. Activar RLS con el pooler de Neon produciría falsos positivos de seguridad: las políticas no se aplicarían consistentemente.

**Alternativa implementada:** Toda consulta que accede a datos de negocio incluye explícitamente `WHERE org_id = ?`, donde `?` proviene siempre de la sesión verificada (JWT), nunca del request. Esta es la garantía central del sistema.

**Documentación de referencia:** [Neon Pooling + RLS](https://neon.tech/docs/connect/connection-pooling#connection-pooling-and-row-level-security)

---

## Jerarquía de roles

```
owner > admin > manager > agent > viewer
```

| Rol | Descripción |
|---|---|
| `owner` | Dueño de la organización. Creado durante onboarding. |
| `admin` | Administrador delegado. Puede gestionar usuarios y configuración. |
| `manager` | Gerente. Puede crear/editar campañas y clientes, pero no eliminar. |
| `agent` | Agente de ventas. Puede ver y gestionar leads asignados. |
| `viewer` | Solo lectura. No puede realizar mutaciones. |

---

## Funciones de la capa de autorización

Todas en `src/lib/auth/server.ts` (marcado `import "server-only"`).

| Función | Garantía | Lanza |
|---|---|---|
| `requireUser()` | Sesión JWT válida; `userId` de token verificado | `AuthError` si no hay sesión |
| `requireOrganizationMembership()` | Membresía activa en `org_members`; `orgId` y `role` de DB | `AuthError` / `ForbiddenError` |
| `requireRole(roles[])` | Todo lo anterior + rol del usuario dentro de `roles` | `ForbiddenError` si rol insuficiente |
| `requireClientAccess(clientId)` | Membresía + `clients.org_id = ctx.orgId` | `NotFoundError` si cliente en otro org |
| `requireCampaignAccess(campaignId)` | Membresía + `campaigns.org_id = ctx.orgId` | `NotFoundError` si campaña en otro org |

**Garantía crítica:** `requireOrganizationMembership()` no acepta parámetros. `org_id` y `role` SIEMPRE provienen de la DB, nunca del request. El navegador no puede influir en estos valores.

---

## Matriz de roles × acciones

### Leads

| Acción | owner | admin | manager | agent | viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver leads de su org | ✓ | ✓ | ✓ | ✓ | ✓ |
| Actualizar temperatura | ✓ | ✓ | ✓ | ✓ | — |
| Actualizar etapa | ✓ | ✓ | ✓ | ✓ | — |
| Actualizar notas | ✓ | ✓ | ✓ | ✓ | — |
| Asignar lead | ✓ | ✓ | ✓ | ✓ | — |
| Marcar como vendido (CAPI) | ✓ | ✓ | ✓ | — | — |

### Clientes

| Acción | owner | admin | manager | agent | viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver clientes | ✓ | ✓ | ✓ | ✓ | ✓ |
| Crear cliente | ✓ | ✓ | ✓ | — | — |
| Editar cliente | ✓ | ✓ | ✓ | — | — |
| Eliminar cliente | ✓ | ✓ | — | — | — |
| Toggle activo | ✓ | ✓ | ✓ | — | — |

### Campañas

| Acción | owner | admin | manager | agent | viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver campañas | ✓ | ✓ | ✓ | ✓ | ✓ |
| Crear campaña | ✓ | ✓ | ✓ | — | — |
| Editar campaña | ✓ | ✓ | ✓ | — | — |
| Eliminar campaña | ✓ | ✓ | — | — | — |
| Rotar API Key | ✓ | ✓ | — | — | — |
| Toggle activo | ✓ | ✓ | ✓ | — | — |

> **Nota:** La restricción por rol (`requireRole()`) está disponible en la capa de auth y lista para activarse. La fase actual implementa la verificación de membresía para todos (ningún rol es rechazado), priorizando la corrección del aislamiento por `org_id`. Activar restricciones granulares por rol es el siguiente paso cuando el producto tenga múltiples tipos de usuario activos.

### Embudos (Funnels — deprecated, migrar a Pipelines en Prompt 13+)

| Acción | owner | admin | manager | agent | viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver embudos | ✓ | ✓ | ✓ | ✓ | ✓ |
| Crear embudo | ✓ | ✓ | ✓ | — | — |
| Editar embudo | ✓ | ✓ | ✓ | — | — |
| Eliminar embudo | ✓ | ✓ | — | — | — |

---

## Flujo de autorización por request

```
Browser request
    │
    ▼
proxy.ts (JWT verification — no DB)
    │
    ▼
Server Action / Server Component
    │
    ▼
requireOrganizationMembership()
    │  ├─ auth() → read JWT → userId
    │  └─ db.query.orgMembers → orgId, role
    │
    ▼
Business query scoped by orgId
    WHERE org_id = ctx.orgId   ← always from DB, never from request
    │
    ▼
Response
```

---

## Endpoints con auth propia (no sesión)

| Endpoint | Mecanismo |
|---|---|
| `POST /api/leads/ingest` | `X-Campaign-Key` → SHA-256 lookup en `ingestion_credentials` |
| `GET /api/cron/cleanup` | Header `Authorization: Bearer CRON_SECRET` |

Estos endpoints no usan `requireUser()` ni `requireOrganizationMembership()`. El `org_id` se resuelve desde el registro de la campaña/credential en DB, nunca del request.

---

## Errores exportados

`src/lib/auth/errors.ts`:

| Clase | HTTP equivalente | Cuándo |
|---|---|---|
| `AuthError` | 401 | Sin sesión o JWT inválido |
| `ForbiddenError` | 403 | Sin membresía o rol insuficiente |
| `NotFoundError` | 404 | Recurso no encontrado o en otro org |

Los Server Actions capturan estos errores y retornan `{ error: string }` al cliente. Los Server Components redirigen (`/login` para `AuthError`, `/onboarding` para `ForbiddenError`).
