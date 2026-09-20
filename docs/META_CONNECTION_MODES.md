# Meta Connection Modes

SyncLead soporta dos modos de conexión con Meta Ads:

## Modos

### `internal_manual` (Activo — Beta interna)

El administrador provee manualmente un **System User Access Token** de una cuenta Business Manager que ya controla. No requiere ningún proceso de aprobación de Meta.

**Requisitos:**
- Token de System User con permiso `ads_read`
- Ad Account ID en la allowlist de la organización
- El System User debe ser administrador de la cuenta publicitaria

**Cuándo usar:** Durante la beta interna, para cuentas propias o de clientes en las que el administrador tiene acceso directo al Business Manager.

**Cómo activar:**
```bash
META_CONNECTION_MODE=internal_manual
ENABLE_EXTERNAL_META_OAUTH=false
```

---

### `external_oauth` (Bloqueado — Requiere App Review)

Flujo OAuth estándar donde el cliente autoriza a la app de SyncLead a acceder a sus cuentas publicitarias mediante el diálogo de permisos de Facebook.

**Estado actual:** `BLOQUEADO`

Para habilitar este flujo se necesita:
1. Completar Meta App Review para los permisos `ads_read` y `ads_management`
2. Completar Business Verification de Meta
3. Implementar el flujo OAuth (ver `docs/meta-oauth-future.md`)
4. Cambiar `ENABLE_EXTERNAL_META_OAUTH=true` en producción

**Por qué está bloqueado:**
- Meta requiere App Review antes de que apps externas puedan solicitar permisos de anuncios a usuarios fuera del Business Manager
- Sin App Review, solo funcionan los tokens generados por el propio dueño del Business Manager
- Evadir este proceso viola los Términos de Servicio de Meta

**Cuándo estará disponible:** Después de completar el proceso oficial de Meta App Review.

---

## Código relevante

| Archivo | Descripción |
|---|---|
| `src/domains/meta-insights/actions.ts` | `saveInsightsConnectionAction` — verifica allowlist + token |
| `src/domains/meta-insights/allowlist.ts` | Gestión de la allowlist (DB + env) |
| `src/lib/meta-ads/client.ts` | Cliente HTTP de Meta Ads API con retry |
| `src/domains/meta-insights/sync-engine.ts` | Motor de sincronización con locking |
| `src/app/api/cron/meta-insights-sync/route.ts` | Cron diario de sync incremental |
| `docs/meta-oauth-future.md` | Arquitectura del flujo OAuth futuro |

## Decisión de diseño: separación CAPI vs Insights

SyncLead tiene dos tipos de conexiones Meta distintas:

| Tipo | Tabla | Propósito | Token necesario |
|---|---|---|---|
| CAPI | `meta_connections` (pixelId set) | Enviar eventos de conversión al Pixel | System User con `ads_management` |
| Insights | `meta_connections` (adAccountId set) | Leer datos de gasto e insights | System User con `ads_read` |

Ambos tipos usan la misma tabla `meta_connections` para evitar duplicar la infraestructura de cifrado de tokens. Se distinguen por la presencia de `pixel_id` vs `ad_account_id`.
