# Meta Ads Insights — Beta Interna

LeadSync puede sincronizar datos de rendimiento de Meta Ads (gasto, impresiones, clics, CPL, CPA) para cuentas publicitarias **explícitamente autorizadas**, sin depender de App Review para clientes externos.

## Acceso y elegibilidad

El acceso se otorga por **token + permisos + cuenta + allowlist** — no por el estado de aprobación de la Meta App.

Condiciones que deben cumplirse simultáneamente:
1. El token de acceso es válido (no expirado ni revocado)
2. El token tiene el permiso `ads_read`
3. El Ad Account ID está en la allowlist (DB o variable de entorno)

Si alguna condición falla, la conexión es rechazada con un error específico.

## Modos de conexión

| Modo | Estado | Descripción |
|---|---|---|
| `internal_manual` | ✅ Activo | System User Token provisto manualmente por el dueño de la cuenta |
| `external_oauth` | 🔒 Bloqueado | OAuth para clientes externos — requiere App Review de Meta |

Para activar `external_oauth`: ver `docs/META_CONNECTION_MODES.md`.

## Variables de entorno

```bash
META_CONNECTION_MODE=internal_manual     # Modo activo
ENABLE_EXTERNAL_META_OAUTH=false         # Mantener false hasta App Review
META_ALLOWED_AD_ACCOUNTS=act_111,act_222 # Allowlist (o vacío si solo usas la UI)
```

## Flujo de conexión (modo internal_manual)

1. El administrador abre la página de detalle del cliente
2. En la sección **Meta Ads Insights (Beta)**, hace clic en "Conectar cuenta"
3. Ingresa el Ad Account ID y un System User Access Token con permiso `ads_read`
4. SyncLead verifica: token válido → tiene `ads_read` → cuenta en allowlist
5. El token se cifra AES-256-GCM antes de guardarse (igual que las conexiones CAPI)
6. La conexión queda activa y puede sincronizar manualmente o vía cron

## Sincronización de insights

### Tipos de sync

| Tipo | Rango | Cuándo usar |
|---|---|---|
| `initial` | Últimos 90 días | Primera sincronización de una cuenta |
| `incremental` | Últimos 7 días | Sync diario automático (cron) |
| `manual` | Cualquier rango | Re-sincronizar un período específico |

### Cron diario

Agregar a `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/meta-insights-sync",
    "schedule": "0 6 * * *"
  }]
}
```

El endpoint requiere `Authorization: Bearer $CRON_SECRET`.

### Niveles de sync

Cada ejecución sincroniza en tres niveles (campaign, adset, ad) para máxima granularidad:
- Los datos a nivel `campaign` se usan para KPI agregados
- Los datos a nivel `ad` permiten atribución por anuncio específico

### Idempotencia

Los upserts usan la clave `(org_id, ad_account_id, date, level, object_id)`. Re-sincronizar el mismo período sobreescribe los valores previos sin crear duplicados.

## Catálogo de anuncios

Junto con los insights, se sincronizan los objetos del catálogo:
- `meta_catalog_campaigns` — campañas con estado, objetivo y presupuesto
- `meta_catalog_adsets` — conjuntos de anuncios con targeting
- `meta_catalog_ads` — anuncios individuales con nombre del creativo

## KPIs calculados

| KPI | Fórmula | Observaciones |
|---|---|---|
| CPL | Gasto ÷ Leads | Leads = conversiones tipo `lead` reportadas por Meta |
| CPA | Gasto ÷ Conversiones | Conversiones reportadas por Meta |
| ROAS | Ingresos ÷ Gasto | Requiere datos de conversión en la misma moneda |

**Seguridad de moneda**: si los datos contienen múltiples monedas, los KPIs devuelven `null` en lugar de valores incorrectos.

## Allowlist — gestión

### Vía variable de entorno (sin DB)
```bash
META_ALLOWED_AD_ACCOUNTS=act_12345678,act_87654321
```
Útil para entornos de staging o para añadir cuentas sin UI.

### Vía UI (admin/owner)
- Disponible desde la página de la organización (próximamente)
- También vía `addToAllowlistAction()` en `meta-insights/actions.ts`

## Restricciones de seguridad

- **Nunca** usar scraping de Ads Manager, automatización de navegador o cookies de sesión
- **Nunca** evadir App Review, Business Verification ni restricciones de Meta
- El token nunca se retorna al browser después de guardarse
- CI nunca consulta cuentas reales de Meta (todos los tests usan mocks)
- Las conexiones de clientes externos permanecen bloqueadas hasta App Review completo

## Estado de tests

```
src/__tests__/meta-insights-kpi.test.ts    — 25 tests: CPL, CPA, ROAS, moneda, parseSpend, extractLeads
src/__tests__/meta-insights-sync.test.ts   — 23 tests: allowlist, schemas, mock client, feature flags, seguridad
```

Todos los tests usan mocks. `fetch` nunca se llama en CI contra cuentas reales.
