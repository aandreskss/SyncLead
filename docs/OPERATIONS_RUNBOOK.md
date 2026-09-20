# Operations Runbook — SyncLead

Procedimientos day-2: onboarding, mantenimiento rutinario, monitoreo y tareas operativas.  
Para incidentes activos (Meta caída, cron atascado, token vencido), ver `RUNBOOKS.md`.

---

## 1. Onboarding de un nuevo cliente beta

### 1.1 Crear cuenta y organización

1. El cliente se registra en `/register` con email y contraseña
2. Completa el wizard de onboarding: nombre de organización → primer cliente → primera campaña
3. Verificar en DB: `SELECT * FROM organizations WHERE owner_id = '<userId>'`

### 1.2 Conectar Meta (internal_manual)

```
Dashboard → Clients → [Cliente] → Meta Connections → Nueva conexión
  Pixel ID: <pixel_id_del_cliente>
  Ad Account ID: act_<account_id>
  Access Token: <token de Meta Business Settings>
  Graph API Version: v19.0
```

El token se verifica con Meta antes de guardarse. Si falla la verificación, el error mostrará un código numérico (no el mensaje raw de Meta).

**Tras conectar:** el cliente puede registrar ventas y ver CAPI status desde el drawer del lead.

### 1.3 Crear credenciales de ingesta

Para ingesta de formularios externos:
```
Dashboard → Campaigns → [Campaña] → Nueva credencial → "Formulario público"
→ Copiar la clave pub_xxx → Instalar en el formulario con el script de ejemplo (docs/examples/browser-form.html)
```

Para ingesta servidor-a-servidor:
```
Dashboard → Campaigns → [Campaña] → Nueva credencial → "Server Secret"
→ Copiar la clave slk_xxx → Guardar en env vars del servidor del cliente
→ Nunca compartir por email ni chat; rotar cada 90 días
```

---

## 2. Monitoreo rutinario

### 2.1 Health dashboard (diario)

Acceder a `/dashboard/health` (requiere rol owner o admin).

Revisar:
- **DB**: latencia < 200ms en condiciones normales
- **Meta Connections**: status debe ser `active`; `error` o `expired` requiere acción
- **CAPI Queue**: `failed` > 0 → ejecutar retry o investigar con RB-04
- **Imports**: `processing` atascado > 30 min → ejecutar retry o investigar con RB-06
- **Cron History**: últimas 30 ejecuciones; `failed` o `timeout` → ver RB-03

### 2.2 Verificar crons (semanal)

```sql
-- Últimos 7 días de ejecuciones por job
SELECT job_name, status, COUNT(*) as runs, AVG(duration_ms) as avg_ms
FROM cron_runs
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY job_name, status
ORDER BY job_name, status;
```

Valores esperados por job:
| Job | Frecuencia | Duration normal |
|-----|-----------|-----------------|
| `cleanup` | Diario (2am UTC) | < 2000ms |
| `meta-outbox` | Cada 5 min | < 10000ms |
| `meta-insights-sync` | Diario (3am UTC) | < 25000ms |
| `retention-cleanup` | Diario (4am UTC) | < 5000ms |

### 2.3 Cola CAPI (diario durante beta)

```sql
-- Estado de la cola
SELECT status, COUNT(*) FROM meta_events GROUP BY status;

-- Eventos fallidos con más de 8 intentos (dead-letter)
SELECT id, org_id, event_id, attempt_count, last_error
FROM meta_events WHERE status = 'failed' AND attempt_count >= 8;
```

Si hay eventos en dead-letter: revisar `last_error` para determinar si es un error permanente (token inválido, pixel eliminado) o transitorio.

---

## 3. Mantenimiento programado

### 3.1 Rotación de ENCRYPTION_KEY (trimestral)

Ver `ENVIRONMENT_MATRIX.md` sección "Rotación de ENCRYPTION_KEY".

### 3.2 Rotación de credenciales de ingesta (cada 90 días)

```
Dashboard → Campaigns → [Campaña] → Credenciales → Rotar
```

La clave anterior queda revocada inmediatamente. El cliente debe actualizar su endpoint.

### 3.3 Purga de audit_logs (semestral)

Los audit logs se acumulan indefinidamente. Si la tabla crece > 1M filas:

```sql
-- Purgar logs > 6 meses que no sean de seguridad
DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '6 months'
  AND action NOT IN ('meta_connection.created', 'meta_connection.disconnected',
                     'lead.temperature.change', 'lead.stage.change');
```

### 3.4 Verificar tokens Meta (mensual)

```sql
-- Conexiones activas con token; verificar cada una
SELECT id, org_id, client_id, pixel_id, last_verified_at, status
FROM meta_connections
WHERE status = 'active'
ORDER BY last_verified_at ASC NULLS FIRST;
```

Para cada conexión: `testMetaConnectionAction(connectionId)` desde el dashboard.

---

## 4. Procedimientos de importación CSV

### 4.1 Flujo estándar

1. Manager sube CSV en `/dashboard/campaigns/[id]/leads`
2. Dry-run automático: muestra preview de filas, errores y duplicados
3. Manager revisa y confirma la importación
4. Procesado en background; progreso visible en `/dashboard/health`

### 4.2 Rollback de importación

Si una importación completó pero los datos son incorrectos:

```sql
-- Ver el batch
SELECT id, status, total_rows, processed_rows, failed_rows
FROM import_batches WHERE id = '<batch_id>';

-- Leads importados en este batch (via import_rows)
SELECT ir.lead_id, l.name, l.phone
FROM import_rows ir JOIN leads l ON l.id = ir.lead_id
WHERE ir.batch_id = '<batch_id>' AND ir.status = 'imported';
```

No hay rollback automático. Los leads deben eliminarse manualmente o marcarse como inválidos. Documentar el incidente.

---

## 5. Gestión de usuarios

### 5.1 Cambiar rol de un miembro

```sql
-- Ver miembros de una org
SELECT u.email, om.role
FROM org_members om JOIN "user" u ON u.id = om.user_id
WHERE om.org_id = '<org_id>';

-- Cambiar rol (solo owner puede hacer esto en producción)
UPDATE org_members SET role = 'manager' WHERE org_id = '<org_id>' AND user_id = '<user_id>';
```

### 5.2 Remover un miembro

```sql
DELETE FROM org_members WHERE org_id = '<org_id>' AND user_id = '<user_id>';
```

El usuario conserva su cuenta; solo pierde acceso a esa organización.

### 5.3 Eliminar cuenta de usuario (erasure request)

1. Marcar lead para erasure en DB si aplica:
```sql
UPDATE leads SET deletion_requested_at = NOW() WHERE email = '<email>' AND org_id = '<org_id>';
```
2. El cron `retention-cleanup` procesará la erasure dentro de 24h
3. Eliminar cuenta de usuario:
```sql
DELETE FROM "user" WHERE email = '<email>';
-- CASCADE elimina: sessions, accounts, org_members
-- NO elimina: leads (anon), audit_logs (anon)
```

---

## 6. Acceso de emergencia a la base de datos

En caso de urgencia donde el dashboard no esté disponible:

```bash
# Conectar a Neon con Drizzle Studio (requiere DATABASE_URL en env)
npx drizzle-kit studio

# O directamente con psql
psql $DATABASE_URL
```

**Reglas de acceso de emergencia:**
- Nunca ejecutar `DELETE` o `UPDATE` masivo sin backup
- Documentar cada acción en un incident log
- Avisar al equipo antes de cualquier operación en prod

---

## 7. Monitoreo de cuotas Meta

### 7.1 Rate limits de CAPI

Meta aplica rate limits por pixel. Si los eventos empiezan a fallar con código `80004` (throttled):

```sql
-- Ver eventos con error de throttling
SELECT event_id, attempt_count, last_error
FROM meta_events WHERE last_error LIKE '%80004%';
```

Acción: reducir `META_OUTBOX_MAX_ATTEMPTS` temporalmente o aumentar el backoff base.

### 7.2 Token expiration

Los tokens de Meta expiran aproximadamente cada 60 días (tokens de larga duración). El cron `meta-insights-sync` actualiza `last_verified_at` en cada sync exitoso.

Alertas tempranas:
```sql
-- Conexiones no verificadas en > 30 días
SELECT id, org_id, pixel_id, last_verified_at
FROM meta_connections
WHERE status = 'active' AND (last_verified_at IS NULL OR last_verified_at < NOW() - INTERVAL '30 days');
```

---

## 8. Scripts útiles

```bash
# Verificar estado del entorno
npm run preflight:full

# Seed de datos de prueba (idempotente)
npm run seed:launch

# Crear usuario admin
npm run create-admin

# Typecheck
npx tsc --noEmit

# Tests
npx vitest run

# Ver migraciones pendientes
npx drizzle-kit status

# Aplicar migraciones
npx drizzle-kit migrate
```
