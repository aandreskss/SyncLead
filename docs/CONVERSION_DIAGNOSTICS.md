# Conversion Diagnostics

## Resumen

El módulo de Diagnóstico de Conversiones permite a los equipos de marketing y técnicos de SyncLead verificar que el tracking de conversiones está correctamente instalado y funcionando en los sitios web de sus clientes. El módulo centraliza tres diagnósticos complementarios:

1. **Diagnóstico estático de Pixel**: escanea el HTML de la URL de destino en busca del código base de Meta Pixel, detecta duplicados e inconsistencias entre el pixel esperado y el encontrado.
2. **Diagnóstico de eventos en tiempo real**: a través de sesiones de prueba, verifica que los eventos de conversión llegan correctamente desde el navegador (Pixel) y desde el servidor (CAPI).
3. **Diagnóstico de deduplicación**: verifica que el `event_id` sea consistente entre el Pixel y CAPI para evitar doble conteo en Meta.

**Para quién es**: agencias de marketing, equipos técnicos de clientes y administradores de SyncLead que necesitan diagnosticar y corregir problemas de tracking sin acceder directamente al código fuente del sitio.

---

## Arquitectura

### Modelos de datos y relaciones

```
organizations
    │
    └── clients
            │
            └── tracking_sites ──────────────── conversion_definitions
                      │                                    │
                      │                          ┌─────────┴──────────┐
                      │                          │                    │
                      │                 conversion_observations  conversion_issues
                      │                          │
                      │                 test_sessions
                      │                 (token_hash, status, expires_at)
                      │
                      └── scan_results (resultado del scanner estático)
```

### Tablas principales

| Tabla | Propósito |
|---|---|
| `tracking_sites` | Dominio registrado por cliente. Tiene `expectedPixelId`, `allowedOrigins`, `diagnosticsEnabled` |
| `conversion_definitions` | Definición de cada evento de conversión: qué esperar, de qué fuente, con qué parámetros |
| `conversion_observations` | Registro de cada vez que el collector detectó el evento (browser o servidor) |
| `conversion_issues` | Problemas abiertos detectados: duplicado, sin value, mismatch de event_id, etc. |
| `test_sessions` | Sesiones de prueba en tiempo real. Solo se almacena el `token_hash` (SHA-256), nunca el token en texto plano |

### Flujo collector → observation → status

```
[Sitio del cliente]                    [SyncLead backend]
       │                                       │
       │  POST /api/collect/:token             │
       │  { event_name, event_id,              │
       │    parameters_present }               │
       │──────────────────────────────────────►│
       │                                       │
       │                              Valida token (SHA-256 hash)
       │                              Verifica CORS (allowedOrigins)
       │                              Sanitiza URL (remueve PII de query params)
       │                              Hashea event_id → event_id_hash
       │                              Inserta en conversion_observations
       │                              Actualiza diagStatus en conversion_definitions
       │                              Detecta issues (dedup, value, etc.)
       │◄──────────────────────────────────────│
       │  { status: "received" }               │
```

---

## Estados de diagnóstico

El campo `diagStatus` en `ConversionWithStatus` puede tener 13 valores posibles:

| Estado | Significado | Cuándo ocurre |
|---|---|---|
| `not_configured` | No hay tracking site activo asociado | El cliente no tiene ningún `tracking_site` con `diagnosticsEnabled=true` |
| `code_not_detected` | El pixel base no se encontró en el HTML | Issue `pixel_base_missing` abierto; el scanner no encontró `fbq('init', ...)` |
| `code_detected` | El pixel está en el HTML pero sin observaciones confirmadas | El scanner encontró el pixel pero el collector aún no recibió eventos reales |
| `awaiting_test` | Hay una sesión de prueba activa esperando eventos | `test_sessions.status = 'active'` o `'pending'` |
| `observed_browser` | El evento fue detectado via Pixel del navegador | Observación reciente con `source = 'browser_pixel'`, dentro del freshness |
| `observed_server` | El evento fue detectado via CAPI del servidor | Observación reciente con `source = 'server_capi'`, dentro del freshness |
| `observed_both` | Detectado tanto en browser como en servidor | Observaciones recientes de ambas fuentes, dentro del freshness |
| `accepted_by_meta` | Meta confirmó que recibió y procesó el evento en CAPI | `meta_events.status = 'sent'` con `events_received > 0` en respuesta de Meta |
| `misconfigured` | El evento llega de la fuente incorrecta o con configuración inválida | `source` no coincide con `expectedSource`, o issue critical distinto de `pixel_base_missing` |
| `duplicate_risk` | Se detectaron múltiples inicializaciones del pixel | `duplicatePixel = true` en scan; mismo evento enviado dos veces sin `event_id` |
| `stale` | La última observación es más antigua que `freshnessPolicyDays` | `lastObservation.observedAt < now - freshnessPolicyDays` |
| `failed` | Una sesión de prueba terminó sin detectar el evento | La sesión expiró y el evento nunca llegó al collector |
| `unknown` | Sin datos suficientes para determinar el estado | Sin observaciones, sin issues abiertos, sin sesión activa |

**Prioridad de evaluación** (mayor a menor):
1. `not_configured` (sin tracking site)
2. `code_not_detected` (pixel_base_missing issue)
3. `misconfigured` (issue critical)
4. `stale` (observaciones viejas)
5. `observed_browser` / `observed_server` / `observed_both`
6. `unknown`

---

## Tipos de eventos soportados

### Meta Standard Events

| Evento Meta | internalKey recomendado | Parámetros clave | Criticidad típica |
|---|---|---|---|
| `PageView` | `page_view` | — | low |
| `ViewContent` | `view_content` | `content_name`, `content_category` | low |
| `Lead` | `lead` | `event_id` | critical |
| `Contact` | `contact` | `event_id` (recomendado) | high |
| `CompleteRegistration` | `complete_registration` | `event_id` | high |
| `SubmitApplication` | `submit_application` | — | medium |
| `AddToCart` | `add_to_cart` | `content_ids`, `value`, `currency` | medium |
| `InitiateCheckout` | `initiate_checkout` | `value`, `currency`, `num_items` | high |
| `Purchase` | `purchase` | `event_id`, `value`, `currency`, `order_id` | critical |
| `Search` | `search` | `search_string` | low |
| `AddPaymentInfo` | `add_payment_info` | — | medium |
| `AddToWishlist` | `add_to_wishlist` | `content_ids` | low |
| `StartTrial` | `start_trial` | `value`, `currency` | high |
| `Subscribe` | `subscribe` | `value`, `currency` | high |

### Eventos internos con mapeo a Meta

Los eventos internos tienen un `internalKey` descriptivo del negocio pero se reportan a Meta usando un `providerEventName` estándar:

| internalKey | providerEventName Meta | Razón del mapeo |
|---|---|---|
| `appointment_booked` | `Lead` | Meta no tiene evento estándar para citas; `Lead` es el recomendado |
| `quote_requested` | `Lead` | Solicitud de cotización equivale a un lead cualificado |
| `demo_scheduled` | `Lead` | Demo agenda = intención de compra |
| `trial_started` | `StartTrial` | Mapeo directo |
| `membership_purchased` | `Purchase` | Compra de membresía es una compra |

**Cómo configurar un evento interno:**
```typescript
{
  internalKey: "appointment_booked",  // snake_case, solo a-z0-9_
  displayName: "Cita Agendada",
  providerEventName: "Lead",          // el nombre que ve Meta
  expectedSource: "both",
  criticality: "critical",
}
```

---

## Plantillas por tipo de negocio

SyncLead ofrece tres plantillas predefinidas para acelerar la configuración inicial.

### `lead_gen` — Generación de leads

Ideal para: servicios profesionales, inmobiliarias, educación, salud.

| internalKey | providerEventName | expectedSource | criticality |
|---|---|---|---|
| `page_view` | `PageView` | browser | low |
| `view_content` | `ViewContent` | browser | low |
| `lead` | `Lead` | both | critical |
| `contact` | `Contact` | both | high |
| `complete_registration` | `CompleteRegistration` | both | high |
| `submit_application` | `SubmitApplication` | both | medium |

### `ecommerce` — Comercio electrónico

Ideal para: tiendas online, D2C, marketplaces.

| internalKey | providerEventName | expectedSource | criticality |
|---|---|---|---|
| `page_view` | `PageView` | browser | low |
| `view_content` | `ViewContent` | browser | low |
| `add_to_cart` | `AddToCart` | browser | medium |
| `initiate_checkout` | `InitiateCheckout` | browser | high |
| `purchase` | `Purchase` | both | critical |

### `bookings` — Reservas y citas

Ideal para: clínicas, restaurantes, hoteles, servicios con agenda.

| internalKey | providerEventName | expectedSource | criticality |
|---|---|---|---|
| `page_view` | `PageView` | browser | low |
| `view_content` | `ViewContent` | browser | low |
| `contact` | `Contact` | both | medium |
| `lead` | `Lead` | both | high |
| `appointment_booked` | `Lead` | both | critical |

---

## Instalación del script diagnóstico

El script diagnóstico es un fragmento de JavaScript liviano que el sitio del cliente debe incluir para reportar eventos al collector de SyncLead en tiempo real.

### JavaScript directo

```html
<!-- SyncLead Diagnostics Collector -->
<script>
(function(w, token) {
  w._slDiag = function(eventName, params) {
    var data = {
      event_name: eventName,
      event_id: (params && params.eventID) || null,
      page_url: window.location.href,
      parameters_present: params ? Object.keys(params).reduce(function(acc, k) {
        acc[k] = true; return acc;
      }, {}) : {}
    };
    fetch('https://app.synclead.io/api/collect/' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true
    });
  };
})(window, 'TU_SESSION_TOKEN_AQUI');
</script>
```

Para reportar un evento:
```javascript
// Junto con el fbq() call, agregar:
fbq('track', 'Lead', leadData, { eventID: myEventId });
window._slDiag('Lead', { eventID: myEventId, value: 0 });
```

### Google Tag Manager

1. En GTM, crear una nueva etiqueta de tipo **HTML personalizado**.
2. Pegar el script diagnóstico completo.
3. Configurar el **Activador**: "Todas las páginas" para PageView; activadores específicos para otros eventos.
4. Para eventos de conversión, usar variables de capa de datos:

```javascript
// En GTM — Etiqueta HTML personalizada para Lead
<script>
window._slDiag && window._slDiag('Lead', {
  eventID: {{dlv - event_id}},
  value: {{dlv - lead_value}}
});
</script>
```

5. Publicar el contenedor GTM para que los cambios surtan efecto.

**Nota**: GTM carga scripts de forma asíncrona. Si el evento se dispara antes de que el script diagnóstico cargue, puede no registrarse. Cargar el script diagnóstico con prioridad alta en el orden de etiquetas.

### Next.js / React

**Opción A — Hook `useEffect` en un componente de conversión:**

```tsx
// components/ConversionTracker.tsx
'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    _slDiag?: (eventName: string, params?: Record<string, unknown>) => void
  }
}

export function trackConversionEvent(
  eventName: string,
  params?: Record<string, unknown>
) {
  if (typeof window !== 'undefined' && window._slDiag) {
    window._slDiag(eventName, params)
  }
}

export function SyncLeadDiagScript({ token }: { token: string }) {
  useEffect(() => {
    if (window._slDiag) return // Ya cargado
    const script = document.createElement('script')
    script.innerHTML = `(function(w,t){w._slDiag=function(e,p){fetch('/api/collect/'+t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_name:e,event_id:p&&p.eventID||null,page_url:window.location.href,parameters_present:p?Object.keys(p).reduce(function(a,k){a[k]=true;return a},{}):{}}),keepalive:true})}})(window,'${token}')`
    document.head.appendChild(script)
  }, [token])
  return null
}
```

**Opción B — `_app.tsx` (Pages Router):**

```tsx
// pages/_app.tsx
import { SyncLeadDiagScript } from '@/components/ConversionTracker'

export default function App({ Component, pageProps }) {
  return (
    <>
      <SyncLeadDiagScript token={process.env.NEXT_PUBLIC_SYNCLEAD_DIAG_TOKEN!} />
      <Component {...pageProps} />
    </>
  )
}
```

### Shopify (theme.liquid)

Agregar antes del cierre `</head>` en `layout/theme.liquid`:

```liquid
{% comment %} SyncLead Diagnostics {% endcomment %}
<script>
(function(w, token) {
  w._slDiag = function(eventName, params) {
    fetch('https://app.synclead.io/api/collect/' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        event_id: params && params.eventID || null,
        page_url: window.location.href,
        parameters_present: params ? Object.keys(params).reduce(function(a, k) {
          a[k] = true; return a;
        }, {}) : {}
      }),
      keepalive: true
    });
  };
})(window, '{{ settings.synclead_diag_token }}');
</script>
```

Configurar `synclead_diag_token` en **Personalización del tema → Configuración del tema**.

Para reportar Purchase en Shopify:
```liquid
{% if first_time_accessed %}
<script>
  window._slDiag && window._slDiag('Purchase', {
    eventID: '{{ order.id }}',
    value: {{ order.total_price | divided_by: 100.0 }},
    currency: '{{ order.currency }}'
  });
</script>
{% endif %}
```

### WooCommerce (wp_footer hook)

```php
// En functions.php del tema hijo
function synclead_diag_script() {
    $token = get_option('synclead_diag_token', '');
    if (empty($token)) return;
    ?>
    <script>
    (function(w, token) {
        w._slDiag = function(eventName, params) {
            fetch('https://app.synclead.io/api/collect/' + token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_name: eventName,
                    event_id: params && params.eventID || null,
                    page_url: window.location.href,
                    parameters_present: params ? Object.keys(params).reduce(function(a, k) {
                        a[k] = true; return a;
                    }, {}) : {}
                }),
                keepalive: true
            });
        };
    })(window, '<?php echo esc_js($token); ?>');
    </script>
    <?php
}
add_action('wp_footer', 'synclead_diag_script');
```

Para WooCommerce, reportar el Purchase en la página `thank-you`:
```php
function synclead_track_purchase($order_id) {
    $order = wc_get_order($order_id);
    if (!$order) return;
    $event_id = 'wc_order_' . $order_id;
    ?>
    <script>
    window._slDiag && window._slDiag('Purchase', {
        eventID: '<?php echo esc_js($event_id); ?>',
        value: <?php echo $order->get_total(); ?>,
        currency: '<?php echo get_woocommerce_currency(); ?>'
    });
    </script>
    <?php
}
add_action('woocommerce_thankyou', 'synclead_track_purchase');
```

---

## Diagnóstico de Pixel

### Cómo funciona el scanner

El scanner realiza un fetch server-side del HTML de la URL indicada (sin ejecutar JavaScript) y analiza:

- **Código base del Pixel**: busca `fbq('init', 'PIXEL_ID')` con regex.
- **Pixel duplicado**: detecta múltiples llamadas a `fbq('init', ...)` con IDs diferentes.
- **GTM**: detecta `GTM-XXXXXXX` en el HTML.
- **Pixel esperado**: si se configura `expectedPixelId` en el tracking site, verifica que el ID encontrado coincida.

### Cómo interpretar resultados

| Campo | Descripción |
|---|---|
| `pixelFound` | `true` si se encontró al menos una llamada `fbq('init', ...)` |
| `pixelIds` | Lista de IDs de pixel encontrados |
| `expectedPixelIdMatch` | `true`/`false` si se configuró `expectedPixelId`; `null` si no se configuró |
| `gtmFound` | `true` si GTM está presente |
| `duplicatePixel` | `true` si hay más de un `fbq('init', ...)` |
| `fbqCalls` | Todos los nombres de eventos encontrados en el HTML |
| `issues` | Lista de problemas detectados |
| `limitations` | Lista de limitaciones del escaneo estático |

### Limitaciones del scanner

- El scanner es **estático**: no ejecuta JavaScript. Los píxeles cargados de forma diferida (lazy load, `setTimeout`, eventos `DOMContentLoaded`) pueden no detectarse.
- **GTM oculta eventos**: si el pixel se carga via GTM, el scanner detecta GTM pero no puede ver qué eventos están configurados dentro.
- **SPAs**: en aplicaciones React/Vue/Angular el HTML inicial puede no incluir el pixel si se inyecta dinámicamente.
- **Protecciones anti-bot**: algunos sitios devuelven HTML diferente a los scrapers, lo que puede producir falsos negativos.
- El campo `limitations` en la respuesta siempre está presente y documenta estas restricciones.

---

## Diagnóstico de CAPI

### Cómo leer eventos del outbox

Los eventos CAPI se procesan a través del outbox de `meta_events`. Cada evento tiene un `status` que indica su estado en el ciclo de vida:

| Status | Significado |
|---|---|
| `pending` | En cola, esperando ser procesado |
| `processing` | Siendo enviado actualmente |
| `sent` | Enviado exitosamente; Meta devolvió `events_received > 0` |
| `retrying` | Falló temporalmente; reintento programado con backoff exponencial |
| `failed` | Falló permanentemente (error de autenticación, dataset inválido, etc.) |
| `cancelled` | Cancelado manualmente o porque la conversión fue anulada |
| `skipped` | Omitido por configuración (no hay conexión Meta activa) |

### Estados de respuesta Meta

Meta responde a las llamadas CAPI con un payload que incluye el campo `events_received`. SyncLead clasifica los errores Meta en dos categorías:

**Errores permanentes** (no reintentar):
- Código `190`: token de acceso inválido o vencido
- Código `102`: sesión expirada
- Código `200`: permisos insuficientes
- Código `273`: dataset no encontrado
- HTTP 400 con código de error de autenticación

**Errores retryable** (reintentar con backoff):
- Errores de red (timeout, conexión rechazada)
- HTTP 429 (rate limit)
- HTTP 500, 502, 503, 504 (error de servidor Meta)

---

## Deduplicación browser + servidor

### El invariante del event_id

El `event_id` es el mecanismo de deduplicación de Meta. **El mismo event_id debe aparecer tanto en la llamada del Pixel del navegador como en la llamada CAPI del servidor para el mismo evento de conversión.**

```
[Servidor]
  1. Genera event_id = "order_" + order.id  (ej: "order_12345")
  2. Crea la conversión en DB
  3. Envía CAPI con event_id = "order_12345"
  4. Devuelve event_id al cliente en la respuesta

[Navegador]
  5. Recibe event_id = "order_12345" del servidor
  6. Llama fbq('track', 'Purchase', data, { eventID: "order_12345" })
  7. Reporta a SyncLead collector con event_id = "order_12345"
```

Meta detecta que ambos eventos comparten el mismo `event_id` y los deduplica, contando solo una conversión.

### Cómo verificarlo en SyncLead

SyncLead almacena el `event_id_hash` (SHA-256 del event_id original) en cada observación. Para verificar deduplicación:

1. Ver `ConversionObservationPublic.eventIdHash` en la observación browser.
2. Ver `ConversionObservationPublic.eventIdHash` en la observación server.
3. Si ambos hashes son iguales → deduplicación correcta.
4. Si son diferentes → issue `dedup_mismatch` se abre automáticamente.

**El valor real del event_id nunca se almacena, solo su hash.**

### Advertencias

- Nunca generar el `event_id` en el frontend: debe generarse en el servidor antes de la respuesta.
- Para compras, usar el `order_id` de la base de datos como `event_id`.
- Para leads, usar el UUID del lead en la DB o un UUID generado en el momento del formulario (enviado via formulario).
- Un `event_id` igual a un timestamp o `Math.random()` en el frontend puede no coincidir con el del servidor.

---

## Sesiones de prueba en tiempo real

### Flujo paso a paso

1. **Crear sesión**: el agente llama `startTestSessionAction({ clientId, conversionDefinitionId })`.
2. **SyncLead genera token**: un UUID aleatorio. Solo se almacena el `SHA-256(token)` en la DB. El token en texto plano se retorna una sola vez.
3. **Instalar el script con el token**: el agente instala temporalmente el script diagnóstico usando el token de la sesión.
4. **Activar sesión**: `test_sessions.status` pasa a `'active'`.
5. **Disparar el evento**: el agente navega al sitio y ejecuta la acción de conversión.
6. **Collector recibe el evento**: `POST /api/collect/:token` llega al backend con el nombre del evento y parámetros.
7. **SyncLead registra observación**: crea una `ConversionObservation` con `source = 'diagnostic_collector'`.
8. **Sesión completa**: `status` pasa a `'completed'`; el `diagStatus` del evento se actualiza.

### Duración y expiración

- Las sesiones tienen una duración máxima configurable (default: 30 minutos).
- Una sesión expirada (`expiresAt < now`) rechaza eventos con HTTP 410 Gone.
- Las sesiones pueden revocarse manualmente (`status = 'cancelled'`); una sesión cancelada rechaza todos los requests.

### Revocación

```typescript
// El token se invalida inmediatamente
await revokeTestSession(sessionId, orgId)
// Cualquier request posterior con ese token → 410
```

---

## Guías de instalación automáticas

Cada issue detectado tiene un `remediationKey` que apunta a una guía de corrección:

| Código de issue | Guía disponible | Impacto |
|---|---|---|
| `pixel_base_missing` | Instalación del código base del Pixel | Sin pixel = cero tracking |
| `purchase_no_value` | Agregar `value` y `currency` a Purchase | Sin ROAS optimizable |
| `lead_on_form_open` | Mover el evento al callback de éxito | Leads falsos inflados |
| `dedup_mismatch` | Sincronizar `event_id` entre Pixel y CAPI | Doble conteo de conversiones |
| `capi_rejected` | Verificar token y permisos Meta | Sin señal de servidor |
| `event_id_missing` | Implementar `eventID` en todos los eventos críticos | Sin deduplicación posible |
| `duplicate_pixel` | Remover inicializaciones duplicadas | Duplicación de todos los eventos |
| `gtm_event_not_visible` | Verificar configuración de GTM | Scanner no puede confirmar |
| `token_expired` | Renovar el token de acceso Meta | CAPI bloqueado |

Cada guía contiene:
- `title`: nombre del problema
- `impact`: consecuencia del problema en el tracking
- `steps`: pasos ordenados para resolver el problema
- `codeExample` (opcional): fragmento de código de referencia

---

## Limitaciones sin permisos avanzados de Meta

Algunas funciones de diagnóstico requieren permisos adicionales de Meta que solo están disponibles tras el App Review:

| Funcionalidad | Disponible sin App Review | Requiere App Review |
|---|---|---|
| Enviar eventos CAPI | Sí (con token manual) | — |
| Verificar que Meta recibió el evento (`events_received`) | Sí | — |
| Ver el Event Match Quality (EMQ) score | No | `ads_management` + dataset permissions |
| Acceder a estadísticas de deduplicación de Meta | No | `ads_management` |
| Ver eventos en el Administrador de Eventos de Meta | Manual (el usuario lo verifica) | — |
| Leer insights de campañas (ROAS, CPA) | Sí (con allowlist interna) | App Review para escala |
| Verificar que el pixel de un tercero está activo | No | — |

**Mientras `ENABLE_EXTERNAL_META_OAUTH=false`**: solo está disponible el modo `internal_manual`. El usuario configura manualmente el token de acceso, el Pixel ID y el Dataset ID. El modo `external_oauth` (OAuth flow completo) queda bloqueado hasta que Meta apruebe la App.

---

## Troubleshooting

| Problema | Posible causa | Solución |
|---|---|---|
| Scanner retorna `pixelFound=false` pero el pixel funciona en producción | Pixel cargado via GTM o de forma diferida | Verificar con Meta Pixel Helper en Chrome; revisar configuración GTM |
| `diagStatus = 'stale'` aunque el pixel funcione | `freshnessPolicyDays` muy corto para la frecuencia real | Ajustar `freshnessPolicyDays` en la definición; para eventos poco frecuentes (Purchase), aumentar a 7-14 días |
| Collector no recibe eventos en sesión de prueba | Script diagnóstico no instalado o token equivocado | Verificar que el script usa el token exacto de la sesión activa; revisar CORS en `allowedOrigins` |
| `dedup_mismatch` aunque el `event_id` parece igual | Espacios, mayúsculas o caracteres extra en el event_id | Normalizar el event_id antes de hashearlo: trim + lowercase si se usa como identificador |
| CAPI `status=failed` con código de error `190` | Token de acceso Meta vencido | Renovar el token en la página de cliente (`/dashboard/clients/[id]`) |
| `duplicate_risk` pero el pixel solo está una vez | La página tiene fragmentos de código duplicados por error | Buscar múltiples `fbq('init', ...)` en el HTML fuente; revisar plugins de terceros |
| Session token rechazado con 410 | Sesión expirada o cancelada | Crear una nueva sesión de prueba; verificar que la URL del collector es la correcta |
| `observed_browser` pero no `observed_server` | CAPI no configurado o token inválido | Verificar la conexión Meta en el panel del cliente; revisar logs del cron `meta-outbox` |
| `expectedPixelIdMatch=false` | El sitio usa un pixel diferente al configurado | Actualizar `expectedPixelId` en el tracking site, o corregir el pixel en el sitio |

---

## Seguridad

### Tokens de sesión de prueba

- El token de sesión se genera como un UUID v4 aleatorio (128 bits de entropía).
- **Solo se almacena `SHA-256(token)` en la base de datos**. El token en texto plano solo existe en memoria durante la respuesta de creación y nunca vuelve a recuperarse.
- Un token comprometido puede invalidarse inmediatamente con `revokeTestSession()`.
- Los tokens expiran automáticamente (`expiresAt`). El endpoint collector devuelve HTTP 410 Gone para tokens expirados o cancelados.

### SSRF (Server-Side Request Forgery)

El scanner de pixel realiza fetch server-side. Para proteger la infraestructura:

- Se bloquean URLs que resuelven a IPs privadas: `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, `127.x.x.x`, `169.254.x.x` (metadata AWS), `::1`, `fc00::/7`, `fe80::/10`.
- Se bloquean hostnames reservados: `localhost`.
- El User-Agent del scanner identifica a SyncLead para transparencia.
- Los redirects se siguen pero se re-valida la IP destino en cada hop.

### No PII en observaciones

- `page_url` se sanitiza antes de almacenar: se remueven query params que coincidan con nombres sensibles (`email`, `phone`, `tel`, `name`, `user`, `pass`, `token`, `key`).
- `event_id_hash`: solo se almacena el SHA-256 del event_id original. Nunca el valor en texto plano.
- `parameters_present`: solo almacena las **keys** de los parámetros como booleanos `true`. Nunca los valores (que pueden contener nombres, emails, teléfonos, montos).

### CORS del collector

El endpoint `POST /api/collect/:token` valida el header `Origin` contra el campo `allowedOrigins` del tracking site asociado a la sesión. Requests desde orígenes no permitidos son rechazados con HTTP 403.

---

## Retención de datos

| Tipo de dato | Retención | Cleanup |
|---|---|---|
| `conversion_observations` | 90 días | Cron `retention-cleanup` nullifica campos sensibles; borrado físico después de 90 días |
| `test_sessions` | 7 días post-expiración | Cleanup automático de sesiones expiradas hace más de 7 días |
| `conversion_issues` | Hasta resolución + 30 días | Issues resueltos se archivan después de 30 días |
| `scan_results` | 30 días | Los resultados del scanner se limpian junto con `webhook_events` viejos |
| `token_hash` en `test_sessions` | Igual que la sesión | El hash no es reversible; su retención es irrelevante para privacidad |

El cron `retention-cleanup` (`/api/cron/retention-cleanup`) se encarga de todas las operaciones de limpieza. Se ejecuta diariamente. Los registros de ejecución están disponibles en el Health Dashboard bajo `cron_runs`.
