# Runbooks — SyncLead

> Procedimientos operativos para diagnóstico y recuperación sin editar la DB manualmente.
> Último update: 2026-09-19 (Prompt 22)
>
> Panel de salud: `/dashboard/health` (solo owner/admin)

---

## RB-01 — Meta caída (API no responde)

**Síntomas:**
- `meta_events` con status `retrying` creciendo
- Cron `meta-outbox` completado pero `items_processed > 0`, `items_failed > 0`
- `lastError` en meta_events contiene `fetch_error:` o `http:5xx`

**Diagnóstico:**
1. Verificar [status.developer.facebook.com](https://status.developer.facebook.com) — si hay incidente activo, esperar.
2. En `/dashboard/health` → Cola CAPI → ver conteo retrying/failed.
3. Revisar `meta_events` en Drizzle Studio (`npx drizzle-kit studio`) filtrando por `status='retrying'`.

**Recuperación:**
- Automática: el outbox tiene backoff exponencial (default 8 intentos, ~7h window).
- Si el incidente dura más de 8 intentos: ir a `/dashboard/health` → botón "Reintentar fallidos".
- Esto resetea `attempt_count=0` y `status='pending'` — el cron procesará en la siguiente corrida.

**Prevención:**
- El backoff con jitter (`src/lib/meta-outbox/backoff.ts`) distribuye reintentos.
- `DEFAULT_MAX_ATTEMPTS` configurable via `META_OUTBOX_MAX_ATTEMPTS` env var.

---

## RB-02 — Token Meta vencido

**Síntomas:**
- `meta_events` con `status='failed'` y `last_error` = `error:invalid_token` o `errorCode=190`
- Badge de conexión en `/dashboard/clients/[id]` muestra error

**Diagnóstico:**
1. En `/dashboard/health` → Meta Connections → buscar conexión con status ≠ active.
2. En `/dashboard/clients/[id]` → pestaña Meta → botón "Verificar" → confirma token inválido.

**Recuperación:**
1. Ir a `/dashboard/clients/[id]` → Meta Connections → "Nueva conexión".
2. Pegar el nuevo token (User Access Token o System User Token de Meta Business Manager).
3. SyncLead verifica el token con Meta antes de guardarlo — si el pixel tiene `ads_read` permission, se activa.
4. Los eventos en dead-letter (failed) pueden reintentarse desde `/dashboard/health` → "Reintentar fallidos".
5. Nota: eventos muy antiguos (>7 días) pueden ser rechazados por Meta por `event_time` fuera del window válido.

**Prevención:**
- Usar System User Tokens (no expiran) en lugar de User Access Tokens (60 días).
- Configurar alerta de expiración en Meta Business Manager.

---

## RB-03 — Cron que no corre

**Síntomas:**
- `/dashboard/health` → Historial de crons → no hay filas recientes para un job
- Un job lleva > 2× su período esperado sin aparecer

**Diagnóstico:**
1. Verificar `vercel.json` — que el cron esté configurado con path y schedule correctos.
2. Verificar que `CRON_SECRET` esté en Vercel env vars (Settings → Environment Variables).
3. En Vercel dashboard → Deployments → últimos logs del cron — buscar `401 Unauthorized` o `404 Not Found`.
4. Si hay filas `status='running'` antiguas en `/dashboard/health`, el cron puede estar stuck.

**Recuperación — cron no configurado:**
```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/meta-outbox",         "schedule": "*/10 * * * *" },
    { "path": "/api/cron/meta-insights-sync",  "schedule": "0 3 * * *" },
    { "path": "/api/cron/cleanup",             "schedule": "0 4 * * *" },
    { "path": "/api/cron/retention-cleanup",   "schedule": "0 3 * * *" }
  ]
}
```

**Recuperación — trigger manual:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://app.synclead.com/api/cron/meta-outbox
```

**Recuperación — cron stuck:**
- En `/dashboard/health` → si hay runs stuck: botón "Marcar como timeout" limpia el estado.

---

## RB-04 — Cola CAPI atascada

**Síntomas:**
- `meta_events` con `status='pending'` o `status='retrying'` acumulándose sin moverse
- Cron `meta-outbox` corre pero `items_processed=0`

**Diagnóstico posible 1 — lock expirado:**
- Filas en `status='processing'` con `locked_until` en el pasado.
- El worker libera locks huérfanos automáticamente en cada ejecución (`processOneMetaEvent`).

**Diagnóstico posible 2 — next_attempt_at en el futuro:**
- El backoff puede poner `next_attempt_at` hasta ~4h en el futuro.
- Esperar a que pase el tiempo, o resetear manualmente desde `/dashboard/health`.

**Diagnóstico posible 3 — sin conexión activa:**
- Todos los eventos están asociados a un pixel sin `meta_connections.status='active'`.
- Ir a `/dashboard/clients/[id]` → verificar conexión Meta.

**Recuperación:**
1. `/dashboard/health` → Cola CAPI → "Reintentar fallidos" (si status=failed).
2. Para retrasar `next_attempt_at`: resetear via acción admin (ver RB-02 si el token es el problema).
3. Trigger manual del cron: `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/meta-outbox`.

---

## RB-05 — Migración fallida

**Síntomas:**
- Deploy falla con error de DB schema
- `npx drizzle-kit migrate` reporta error
- Tablas o columnas esperadas no existen

**Diagnóstico:**
```bash
# Ver estado de migraciones aplicadas
npx drizzle-kit studio  # → tabla __drizzle_migrations

# Ver qué cambios pendientes hay
npx drizzle-kit generate --dry-run
```

**Recuperación:**
1. **Migración parcial**: identificar hasta qué statement falló. Las migraciones son archivos SQL — pueden aplicarse en partes.
2. Conectar a Neon console → SQL Editor → ejecutar las sentencias faltantes manualmente.
3. Si la migración es destructiva y falló a mitad: **NO hacer rollback** sin un plan de recuperación de datos. Contactar a Neon support si hay pérdida de datos.
4. Para migraciones aditivas (solo ADD COLUMN / CREATE TABLE): seguro reintentar.

**Prevención:**
- Todas las migraciones de SyncLead son aditivas (IF NOT EXISTS).
- Nunca ejecutar `DROP TABLE` o `ALTER COLUMN TYPE` sin backup previo.
- Testear migraciones en Neon branch antes de aplicar a producción.

---

## RB-06 — Importación parcial

**Síntomas:**
- Import batch en `/dashboard/health` con `status='failed'`
- `imported_rows < total_rows`
- Error al confirmar importación

**Diagnóstico:**
1. En `/dashboard/health` → Importaciones → ver batch fallido con detalle de filas.
2. Verificar `import_rows.status` por batch_id en Drizzle Studio — identificar filas con status='failed'.
3. Las filas con `warning` se importaron pero tuvieron advertencias.

**Recuperación:**
1. Ir a `/dashboard/health` → botón "Reintentar" junto al batch fallido.
2. Esto setea `batch.status='pending'` — el próximo `confirmImportAction` procesará las filas pendientes.
3. Las filas ya importadas (status='imported') no se duplican — el procesador las salta.
4. Si el error es de datos corruptos: corregir el CSV fuente y subir un archivo nuevo (nuevo batch).

**Idempotencia garantizada:**
- `dedupeKey` = SHA-256(fileHash:sheetName:rowIndex) — misma fila física nunca se duplica
- `fingerprint` = SHA-256(orgId:campaignId:name:phone:fecha) — mismo lead nunca se duplica entre archivos

**Nota CAPI:**
- Leads importados NUNCA generan `meta_events`. Esta es una invariante del sistema.
- Si necesitas reportar ventas históricas a Meta, requiere una decisión explícita separada.

---

## RB-07 — Error de cifrado / token no descifrable

**Síntomas:**
- `meta_events` con `last_error = 'decrypt_error'`
- Cron `meta-insights-sync` con `status='decrypt_error'` por alguna conexión

**Causas:**
- `ENCRYPTION_KEY` rotado sin migrar los tokens existentes
- `ENCRYPTION_KEY_VERSION` incorrecto en env vars
- Token guardado con una clave que ya no existe

**Diagnóstico:**
```bash
# Ver qué key_version usan las conexiones activas
# (ejecutar en Drizzle Studio o Neon console)
SELECT id, client_id, key_version, status FROM meta_connections WHERE status = 'active';
```

**Recuperación:**
1. Verificar que `ENCRYPTION_KEY_VERSION` en Vercel env vars coincide con las claves disponibles.
2. Si rotaste la clave y borraste la antigua: **necesitas la clave original** para descifrar.
3. Solución: pedir al cliente que re-ingrese su token Meta en `/dashboard/clients/[id]`.
4. El nuevo token se cifrará con la clave actual.

**Prevención:**
- Rotación correcta: añadir `ENCRYPTION_KEY_2` (nueva clave), cambiar `ENCRYPTION_KEY_VERSION=2`.
- **NUNCA borrar** `ENCRYPTION_KEY` (v1) mientras existan rows con `key_version=1` en `meta_connections`.
- Ver `docs/THREAT_MODEL.md` sección 17 para detalles de rotación.

---

## Referencia rápida de jobs

| Job | Ruta | Schedule | maxDuration | Time Budget |
|-----|------|----------|-------------|-------------|
| meta-outbox | `/api/cron/meta-outbox` | */10 * * * * | 60s | 50s |
| meta-insights-sync | `/api/cron/meta-insights-sync` | 0 3 * * * | 60s | 50s |
| cleanup | `/api/cron/cleanup` | 0 4 * * * | 30s | 25s |
| retention-cleanup | `/api/cron/retention-cleanup` | 0 3 * * * | 60s | 50s |

## Trigger manual de cualquier cron

```bash
# Con CRON_SECRET en .env.local:
curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/<job-name>

# Producción:
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://tu-dominio.vercel.app/api/cron/<job-name>
```
