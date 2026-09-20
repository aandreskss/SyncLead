# Motor de Calificación de Leads — Documentación técnica

> Versión del documento: septiembre 2026  
> Aplica a: SyncLead Prompt 17+

---

## 1. Visión general

El motor de calificación convierte los atributos de un lead en una **clase de calidad** (hot / warm / cold / unqualified) y un **puntaje numérico** (0–100), usando reglas configurables sin modificar código.

### Diferencias con el enfoque anterior (SavayaV1)

| Aspecto | SavayaV1 (anterior) | Motor genérico (actual) |
|---|---|---|
| Lógica | Hardcoded en `engine.ts` para negocio + ciudad | Configurable desde base de datos |
| Configuración | `qualification_rule_sets` + JSON fijo | `qualification_profiles` + `qualification_rules` |
| Tipos de reglas | Solo `force_result` implícito | `add_score`, `force_result`, `disqualify` |
| Campos | Solo `negocio_normalized` + `city_canonical` | 20+ campos sistema + campos custom |
| Versioning | `version` en `qualification_rule_sets` | `version` en `qualification_profiles` |
| Multi-perfil | Un perfil activo por cliente | Varios perfiles; uno published por scope |
| Evaluación | Solo al ingestar y en batch manual | Ingest, field_change, manual_request, batch, rule_change |

---

## 2. Modelo de datos

### Tablas principales

#### `qualification_profiles`

Contiene los perfiles de calificación. Cada perfil agrupa un conjunto de reglas y define los umbrales de puntuación.

```
id             UUID PK
org_id         TEXT NOT NULL
client_id      UUID NULL         -- null = perfil a nivel de organización
name           TEXT NOT NULL
description    TEXT NULL
status         enum('draft','published','archived')
version        INTEGER DEFAULT 1
initial_score  INTEGER DEFAULT 0 -- puntaje de partida antes de aplicar reglas
thresholds     JSONB             -- {hot:{min},warm:{min,max},cold:{max}}
result_labels  JSONB             -- etiquetas personalizadas por clase
published_at   TIMESTAMPTZ NULL
published_by   TEXT NULL
created_at     TIMESTAMPTZ
updated_at     TIMESTAMPTZ
```

#### `qualification_rules`

Reglas individuales ordenadas por `priority`. Cada regla tiene condiciones y una acción.

```
id              UUID PK
org_id          TEXT NOT NULL
profile_id      UUID → qualification_profiles.id
name            TEXT NOT NULL
description     TEXT NULL
priority        INTEGER          -- menor = se evalúa primero
active          BOOLEAN DEFAULT true
conditions      JSONB            -- ConditionTree (ver §3)
action          enum('add_score','force_result','disqualify')
score_delta     INTEGER DEFAULT 0
forced_result   enum('hot','warm','cold','unqualified') NULL
reason          TEXT             -- texto que se muestra en el detalle del lead
stop_processing BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

#### `qualification_field_definitions`

Extiende el catálogo de campos sistema (`field-registry.ts`) con campos personalizados por organización o cliente.

```
id                  UUID PK
org_id              TEXT NOT NULL
client_id           UUID NULL
key                 TEXT NOT NULL    -- snake_case, usado en condition trees
label               TEXT NOT NULL    -- etiqueta legible para el UI
data_type           TEXT NOT NULL    -- text | number | boolean | date | enum | multi_select
source              TEXT NOT NULL    -- standard | utm | device | event | custom | ecommerce
category            TEXT NOT NULL    -- identity | location | business | ...
is_sensitive        BOOLEAN DEFAULT false
allowed_operators   JSONB            -- array de strings de operador
normalization       JSONB            -- array de NormalizationStep
enum_options        JSONB            -- array de string para enum/multi_select
is_required_for_eval BOOLEAN DEFAULT false
event_config        JSONB NULL
leads_column        TEXT NULL
```

#### `lead_behavior_events`

Eventos de comportamiento del lead (e-commerce, tracking).

```
id           UUID PK
org_id       TEXT NOT NULL
lead_id      UUID NULL
event_type   TEXT NOT NULL    -- 'add_to_cart', 'begin_checkout', 'payment_failed', ...
external_id  TEXT NULL        -- para idempotencia
product_id   TEXT NULL
variant_id   TEXT NULL
category     TEXT NULL
quantity     INTEGER NULL
value        TEXT NULL        -- decimal como string
currency     TEXT NULL
cart_items   JSONB DEFAULT '[]'
metadata     JSONB DEFAULT '{}'
platform     TEXT NULL
source       TEXT NULL
occurred_at  TIMESTAMPTZ
created_at   TIMESTAMPTZ
UNIQUE (org_id, external_id)  -- idempotencia por external_id
```

---

## 3. Árbol de condiciones (Condition Tree)

El campo `conditions` en cada regla almacena un JSON AST con dos tipos de nodos: hoja (`ConditionLeaf`) o grupo (`ConditionGroup`).

### ConditionLeaf

```json
{
  "type": "condition",
  "field": "negocio_normalized",
  "operator": "equals",
  "value": "si"
}
```

```json
{
  "type": "condition",
  "field": "ecom_cart_value",
  "operator": "between",
  "value": 50,
  "value2": 200
}
```

### ConditionGroup

```json
{
  "type": "group",
  "operator": "all",
  "conditions": [
    { "type": "condition", "field": "negocio_normalized", "operator": "equals", "value": "si" },
    { "type": "condition", "field": "city_canonical", "operator": "in_list", "value": ["caracas", "maracaibo"] }
  ]
}
```

### Operadores de grupo

| Operador | Semántica |
|---|---|
| `all` | Todas las condiciones deben cumplirse (AND) |
| `any` | Al menos una condición debe cumplirse (OR) |
| `none` | Ninguna condición debe cumplirse (NOR) |

### Límites

- Profundidad máxima: 3 niveles de grupos anidados
- Máximo de condiciones por grupo: 20
- Los grupos pueden contener hojas u otros grupos

---

## 4. Sistema de puntuación

### Flujo de evaluación

```
score = clamp(initialScore, 0, 100)

para cada regla activa (orden ascendente por priority):
  si condiciones matchean:
    si action = "disqualify":
      retornar {class: "unqualified", score: 0}
    si action = "force_result":
      guardar forcedResult
    si action = "add_score":
      score = clamp(score + scoreDelta, 0, 100)
    si stopProcessing = true: parar
  
finalClass = forcedResult ?? scoreToClass(score, thresholds)
```

### Umbrales por defecto

```json
{
  "hot":  { "min": 70 },
  "warm": { "min": 40, "max": 69 },
  "cold": { "max": 39 }
}
```

### Clampeo del puntaje

El puntaje siempre se mantiene en `[0, 100]`. Si `initialScore=90` y una regla suma `+50`, el puntaje queda en `100` (no `140`).

### Resultado forzado vs. basado en puntaje

Si una regla `action="force_result"` hace match, el `forcedResult` prevalece sobre el puntaje acumulado. El puntaje se registra tal cual, pero la clase se asigna desde `forcedResult`.

---

## 5. Tipos de campo y operadores válidos

### text

```
equals, not_equals, contains, not_contains, starts_with, ends_with,
is_empty, is_not_empty, in_list, not_in_list
```

### number

```
equals, not_equals, greater_than, greater_than_or_equal,
less_than, less_than_or_equal, between, is_empty, is_not_empty
```

> `is_not_empty` con valor `0` devuelve `true` — cero es un número válido.

### boolean

```
is_true, is_false, is_unknown
```

### date

```
before, after, between, within_next_n_days, within_last_n_days, is_empty, is_not_empty
```

### enum

```
equals, not_equals, in_list, not_in_list, is_empty, is_not_empty
```

### multi_select

```
contains_any, contains_all, is_empty, is_not_empty
```

---

## 6. Estrategias de normalización

Definidas en `NormalizationStep[]` en cada `FieldDefinition`. Se aplican en orden.

| Estrategia | Descripción |
|---|---|
| `trim` | Elimina espacios al inicio y final |
| `lowercase` | Convierte a minúsculas |
| `remove_accents` | NFD → elimina diacríticos (é→e, ñ→n, ç→c) |
| `collapse_whitespace` | Múltiples espacios → un espacio |
| `parse_number` | `parseFloat(String(value))` → null si NaN |
| `parse_boolean` | Compara con `trueValues`/`falseValues` (case-insensitive) |
| `city_alias_map` | Mapea alias de ciudades al nombre canónico (ver tabla §12) |
| `enum_aliases` | Mapea variantes de enum a su valor canónico |

### Ejemplo — campo `negocio_normalized`

```json
"normalization": [
  { "strategy": "trim" },
  { "strategy": "lowercase" }
]
```

Entrada: `"  Sí  "` → `"  Sí  "` → trim → `"Sí"` → lowercase → `"sí"`.

---

## 7. Ciclo de vida de perfiles (versionado)

```
draft → published → archived
```

- **draft**: editable (reglas, umbrales, etiquetas). No afecta evaluaciones activas.
- **published**: activo para evaluación. Al publicar un nuevo perfil, el anterior se archiva automáticamente en el mismo scope (client_id / null).
- **archived**: read-only, no se aplica a nuevas evaluaciones. Historial preservado en `lead_qualifications`.

### Publicar un perfil

La función `publishProfile()` en `profile-repository.ts`:
1. Verifica que el perfil existe y está en `draft`.
2. Archiva el perfil `published` actual para el mismo scope.
3. Establece `status='published'`, incrementa `version`, registra `publishedAt` y `publishedBy`.

> neon-http no soporta transacciones interactivas — las dos operaciones son secuenciales no atómicas. Si falla el paso 3, el scope queda sin perfil publicado (estado recuperable: re-publicar el nuevo perfil).

---

## 8. Precedencia de perfiles

Al evaluar un lead, el motor resuelve el perfil activo siguiendo esta cadena:

```
1. campaign.profile_id (override explícito por campaña)
   ↓ si null
2. Perfil published con client_id = campaign.client_id
   ↓ si no existe
3. Perfil published con client_id IS NULL (org-wide)
   ↓ si no existe
4. Sin calificación automática (solo manual posible)
```

> La función `getActiveProfileForCampaign()` implementa esta cadena.

### Calificación legacy (SavayaV1)

Si no existe ningún perfil del motor genérico pero sí un `qualification_rule_set` con `is_active=true`, se usa el evaluador legacy `evaluateSavayaV1()`. Ambos sistemas coexisten durante la migración.

---

## 9. Override manual

```
effective_qualification = manual ?? automatic
```

Cada lead tiene una columna `effective_qual_class` que se actualiza automáticamente tras cada evaluación. Cuando un operador aplica una calificación manual (`submitManualQualificationAction`), esta tiene precedencia sobre la automática.

Los re-barridos en batch (`batchReEvaluateAction`) respetan esta precedencia: los leads con override manual se saltan automáticamente.

---

## 10. Plantilla Savaya — Mapeo a reglas del motor

El conjunto de reglas Savaya v1 se puede replicar con `buildSavayaRuleInputs(priorityCities)`:

### Regla 1 — Datos insuficientes (priority 10)

```json
{
  "name": "Datos insuficientes",
  "priority": 10,
  "conditions": { "type": "condition", "field": "negocio_normalized", "operator": "is_empty" },
  "action": "disqualify",
  "reason": "Respuesta de negocio ausente o no reconocida.",
  "stopProcessing": true
}
```

### Regla 2 — Sin negocio (priority 20)

```json
{
  "name": "Sin negocio",
  "priority": 20,
  "conditions": { "type": "condition", "field": "negocio_normalized", "operator": "equals", "value": "no" },
  "action": "force_result",
  "forcedResult": "cold",
  "reason": "El lead indicó que no tiene negocio.",
  "stopProcessing": true
}
```

### Regla 3 — Negocio + ciudad prioritaria (priority 30)

```json
{
  "name": "Negocio + ciudad prioritaria",
  "priority": 30,
  "conditions": {
    "type": "group",
    "operator": "all",
    "conditions": [
      { "type": "condition", "field": "negocio_normalized", "operator": "equals", "value": "si" },
      { "type": "condition", "field": "city_canonical", "operator": "in_list", "value": ["caracas", "maracaibo", "valencia"] }
    ]
  },
  "action": "force_result",
  "forcedResult": "hot",
  "reason": "El lead tiene negocio y está en una ciudad prioritaria.",
  "stopProcessing": true
}
```

### Regla 4 — Negocio fuera de ciudad prioritaria (priority 40)

```json
{
  "name": "Negocio fuera de ciudad prioritaria",
  "priority": 40,
  "conditions": { "type": "condition", "field": "negocio_normalized", "operator": "equals", "value": "si" },
  "action": "force_result",
  "forcedResult": "warm",
  "reason": "El lead tiene negocio, pero la ciudad no es prioritaria o no fue especificada.",
  "stopProcessing": true
}
```

---

## 11. Crear un perfil paso a paso (sin modificar código)

1. Ir a **Dashboard → Clientes → [Cliente] → Perfiles de calificación**.
2. Click en **"Nuevo perfil"** → ingresar nombre y descripción → **Crear perfil**.
3. El perfil se crea en estado `draft`. Click en **"Editar reglas"**.
4. Click en **"Añadir regla"** para cada regla:
   - Asignar **nombre** y **prioridad** (menor = se evalúa primero).
   - En la sección **Condiciones**, elegir campo, operador y valor. Click en "Añadir condición" para condiciones adicionales.
   - Elegir operador de grupo (AND / OR / NONE) si hay varias condiciones.
   - Elegir **Acción**: sumar puntos, forzar resultado, o descalificar.
   - Ingresar la **Razón** (visible al revisar el lead).
   - Activar **"Detener evaluación"** si no se deben evaluar reglas posteriores.
5. Click en **"Guardar reglas"**.
6. Usar la sección **Preview** para probar con valores de prueba antes de publicar.
7. Cerrar el panel de reglas. Click en **"Publicar"** en la tarjeta del perfil.
8. El perfil queda activo. Los próximos leads ingresados se calificarán con este perfil.

---

## 12. Ejemplos por modelo de negocio

### Negocio local (tienda física)

**Objetivo**: identificar leads con negocio en ciudades donde hay distribución.

| Regla | Condiciones | Acción |
|---|---|---|
| Sin datos | negocio_normalized is_empty | disqualify |
| Sin negocio | negocio_normalized = "no" | force_result cold |
| Negocio + ciudad clave | negocio="si" AND city in [ccs, mcbo] | force_result hot |
| Negocio fuera de área | negocio="si" | force_result warm |

### Servicios profesionales (B2B)

**Objetivo**: puntuar por presupuesto (campo custom) + urgencia.

| Regla | Condiciones | Acción |
|---|---|---|
| Alto presupuesto | budget_range = "alto" | add_score +40 |
| Urgencia alta | urgency_level = "inmediato" | add_score +30 |
| Email corporativo | email not_contains "@gmail" | add_score +15 |
| Device desktop | device = "desktop" | add_score +10 |

Score inicial: 0. Thresholds: hot≥60, warm≥30.

### E-commerce (recuperación de carrito)

| Regla | Condiciones | Acción |
|---|---|---|
| Pago fallido | ecom_payment_failed is_true | force_result cold |
| Carrito alto valor | ecom_cart_value > 100 | add_score +25 |
| Checkout iniciado | ecom_checkout_started is_true | add_score +20 |
| Carrito abandonado | ecom_cart_abandoned is_true | add_score +15 |
| Recurrente | ecom_is_returning is_true | add_score +10 |

### Bienes raíces

| Regla | Condiciones | Acción |
|---|---|---|
| Ciudad objetivo | city_canonical in [caracas, valencia] | add_score +30 |
| Campaña inmuebles | utm_campaign contains "bienes_raices" | add_score +20 |
| Tiene negocio/empleo | negocio_normalized = "si" | add_score +20 |
| Facebook | platform = "facebook" | add_score +10 |

---

## 13. Eventos de comportamiento (E-commerce)

### Tipos de eventos soportados

| `event_type` | Campo derivado | Agregación |
|---|---|---|
| `add_to_cart` | `ecom_cart_value` | SUM(value) |
| `begin_checkout` | `ecom_checkout_started` | ANY |
| `checkout_abandoned` | `ecom_cart_abandoned` | ANY |
| `payment_failed` | `ecom_payment_failed` | ANY |
| `view_product` | `ecom_view_count` | COUNT |
| `view_product` | `ecom_product_id` | latest value |
| `view_product` | `ecom_category` | latest value |

### Idempotencia

Los eventos se insertan con `ON CONFLICT DO NOTHING` usando un `external_id` único por organización. Enviar el mismo evento dos veces no genera duplicados.

### Ventanas temporales

El campo `eventConfig.windowDays` en la definición de campo permite limitar los eventos a una ventana de días. Sin él, se agregan todos los eventos del lead sin importar la fecha.

### Cómo registrar un evento

```typescript
// Desde una server action o API interna:
await recordBehaviorEventAction(leadId, {
  eventType: "add_to_cart",
  externalId: "cart_abc123",  // para idempotencia
  value: "149.99",
  currency: "USD",
  productId: "SKU-001",
  category: "zapatos",
})
```

---

## 14. Seguridad

### Aislamiento por org_id

- `qualification_profiles.org_id` — toda consulta filtra por `org_id` del usuario autenticado.
- `qualification_rules.org_id` — ídem.
- `qualification_field_definitions.org_id` — ídem.
- El motor de evaluación (`evaluateProfile`) es puro: no accede a DB. El aislamiento se aplica antes de llamarlo.

### Sin eval / SQL injection

- Los árboles de condición son AST en JSONB. El evaluador los interpreta en TypeScript usando `switch/case` sobre tipos conocidos.
- No hay interpolación de strings en SQL. Drizzle ORM usa queries parametrizadas.

### Whitelist de campos

Solo los campos definidos en `SYSTEM_FIELD_DEFINITIONS` o en `qualification_field_definitions` para la org son evaluables. Un `field` desconocido en un `ConditionLeaf` se trata como `null` → operador `is_empty` devuelve `true`, todo lo demás devuelve `false`.

### Campos sensibles

Los campos marcados `isSensitive: true` (email, phone) no se incluyen en el snapshot de evaluación almacenado en `lead_qualifications.snapshot`.

---

## 15. Límites del motor

| Parámetro | Valor |
|---|---|
| Máximo de reglas por perfil | 50 |
| Máximo de condiciones por grupo | 20 |
| Profundidad máxima de grupos anidados | 3 |
| Longitud máxima de valor en condición | 500 chars |
| Máximo de valores en lista | 100 |
| Rango de puntaje | 0 – 100 |
| Rango de scoreDelta por regla | -100 – +100 |
| Perfiles published por scope | 1 (el anterior se archiva al publicar) |

---

## Archivos clave

| Archivo | Responsabilidad |
|---|---|
| `src/domains/qualification/profile-types.ts` | Todos los tipos TypeScript del motor genérico |
| `src/domains/qualification/field-registry.ts` | Catálogo de campos sistema (`SYSTEM_FIELD_DEFINITIONS`) |
| `src/domains/qualification/condition-evaluator.ts` | `evaluateLeaf`, `evaluateGroup`, `evaluateConditionTree` |
| `src/domains/qualification/score-engine.ts` | `evaluateProfile`, `buildLeadContext`, `applyNormalization` |
| `src/domains/qualification/profile-repository.ts` | CRUD perfiles, reglas, field defs, eventos |
| `src/domains/qualification/profile-actions.ts` | Server actions para UI |
| `src/app/dashboard/clients/[id]/_components/QualificationProfilesPanel.tsx` | Lista y creación de perfiles |
| `src/app/dashboard/clients/[id]/_components/ProfileRuleBuilder.tsx` | Editor visual de reglas |
| `src/__tests__/qualification-condition-evaluator.test.ts` | Tests del evaluador de condiciones |
| `src/__tests__/qualification-score-engine.test.ts` | Tests del motor de puntuación |
