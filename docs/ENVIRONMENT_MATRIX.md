# Environment Matrix — SyncLead

Diferencias de comportamiento entre entornos. Actualizar cuando cambie cualquier env var relevante.

---

## Variables por entorno

| Variable | Development | Preview (Vercel) | Production |
|----------|-------------|------------------|------------|
| `NODE_ENV` | `development` | `production` | `production` |
| `VERCEL_ENV` | *(no set)* | `preview` | `production` |
| `DATABASE_URL` | Neon dev branch | Neon preview branch | Neon main branch |
| `AUTH_SECRET` | Cualquier 32+ chars | Secret de staging | Secret de producción (distinto) |
| `ENCRYPTION_KEY` | Cualquier 64 hex | Key de staging | Key de producción (distinto, irreversible) |
| `ENCRYPTION_KEY_VERSION` | `1` | `1` | `1` (o `2` si se ha rotado) |
| `META_TEST_EVENT_CODE` | Sí (para pruebas) | Sí (para pruebas) | **NUNCA** |
| `META_CONNECTION_MODE` | `internal_manual` | `internal_manual` | `internal_manual` |
| `ENABLE_EXTERNAL_META_OAUTH` | `false` | `false` | `false` |
| `CRON_SECRET` | Cualquier 32+ chars | Secret de staging | Secret de producción |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | URL de preview de Vercel | `https://app.synclead.io` |
| `UPSTASH_REDIS_*` | Opcional | Opcional | Recomendado |
| `RESEND_API_KEY` | Opcional | Opcional | Recomendado |
| `META_OUTBOX_MAX_ATTEMPTS` | `3` (para probar dead-letter) | `8` | `8` |

---

## Comportamiento por entorno

### Meta CAPI

| Condición | Comportamiento |
|-----------|----------------|
| `NODE_ENV=development` | `test_event_code` incluido en payload si `META_TEST_EVENT_CODE` está set |
| `VERCEL_ENV=preview` | `test_event_code` incluido aunque `NODE_ENV=production` |
| `VERCEL_ENV=production` | `test_event_code` **nunca** incluido; `preflight.ts` lo detecta |

Esta distinción existe porque Vercel marca `NODE_ENV=production` en *todos* los deployments (incluyendo preview). El check en `worker.ts`:
```typescript
const isNonProdEnv = process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview"
```

### Rate limiting

| Entorno | Redis disponible | Comportamiento |
|---------|-----------------|----------------|
| Development | No (por defecto) | Sin rate limiting; `getRedis()` devuelve `null` |
| Preview | Opcional | Sin rate limiting si no configurado |
| Production | Recomendado | Rate limiting activo; degradación segura si cae |

### Crons

| Entorno | Crons ejecutan | Notas |
|---------|----------------|-------|
| Development | No (manual: `curl /api/cron/... -H "Authorization: Bearer $CRON_SECRET"`) | Simular con HTTP directo |
| Preview | Sí (si configurados en `vercel.json`) | Pueden ejecutar contra DB de preview |
| Production | Sí | 4 crons registrados; health dashboard muestra historial |

---

## Branching y DB

```
main branch ──────────────────────────────── Vercel Production ── Neon main
                                                                    ↓
feature/* branches ───────────────────────── Vercel Preview ──── Neon dev branch (recomendado)
                                                                    ↓
localhost ─────────────────────────────────────────────────────── .env.local → Neon dev branch
```

**Importante:** Nunca conectar `localhost` o features branches a la DB de producción. Usar branches de Neon para aislar los entornos.

---

## Rotación de ENCRYPTION_KEY

Para rotar la clave de cifrado de tokens Meta sin downtime:

1. Generar nueva clave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Añadir a Vercel: `ENCRYPTION_KEY_2=<nueva_clave>`
3. Subir: `ENCRYPTION_KEY_VERSION=2`
4. Deploy → los tokens nuevos usan v2; tokens existentes (v1) siguen siendo legibles
5. Script de re-cifrado (a crear en sprint 2): re-cifrar todos los tokens v1 con v2
6. Cuando todos sean v2: remover `ENCRYPTION_KEY` (o mantener para tokens legados)

El `preflight.ts` valida que `ENCRYPTION_KEY_${VERSION}` exista cuando `VERSION > 1`.

---

## Checklist de env antes de deploy

```bash
# Verificar que el env de producción está correcto
npm run preflight:full

# Output esperado:
# ✓ AUTH_SECRET is set
# ✓ DATABASE_URL is set
# ✓ ENCRYPTION_KEY is 64 hex chars
# ✓ CRON_SECRET is set
# ✓ NEXT_PUBLIC_APP_URL is set
# ✓ ENCRYPTION_KEY_VERSION consistency  version=1
# ✓ META_CONNECTION_MODE is valid       mode=internal_manual
# ✓ META_TEST_EVENT_CODE not set in production
# ✓ DB connection  <latencia>ms
# ✓ cron_runs table exists
# ✓ leads.consent_given column exists
# ✓ leads.erased_at column exists
# ✓ All required checks passed
# ✓ Safe to deploy
```
