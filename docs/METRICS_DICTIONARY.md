# Metrics Dictionary

Definiciones explícitas para todas las métricas del dashboard de SyncLead.

**N/D** significa "No Disponible" — el dato no puede calcularse por falta de información o denominador cero. Es distinto de cero: cero es un valor real; N/D es ausencia de dato.

---

## Métricas de KPI (panel superior)

### Leads creados

| Campo | Valor |
|---|---|
| **Fórmula** | `COUNT(leads.id)` |
| **Tabla fuente** | `leads` |
| **Campo de tiempo** | `leads.created_at` |
| **Zona horaria** | UTC (el cliente configura el ajuste visual) |
| **Limitaciones** | Cuenta el momento de creación en el sistema, no el momento de envío del formulario (puede diferir hasta segundos) |

### Ventas del periodo

| Campo | Valor |
|---|---|
| **Fórmula** | `COUNT(conversions.id) WHERE status = 'confirmed'` |
| **Tabla fuente** | `conversions` |
| **Campo de tiempo** | `conversions.converted_at` |
| **Zona horaria** | UTC |
| **Limitaciones** | Solo conversiones con `status = 'confirmed'`. Las canceladas y reembolsadas no se cuentan. Una venta puede provenir de un lead captado en un periodo anterior. |

### Tasa de conversión

| Campo | Valor |
|---|---|
| **Fórmula** | `(Ventas del periodo / Leads creados) × 100` |
| **Tabla fuente** | `leads`, `conversions` |
| **Campos de tiempo** | Leads: `leads.created_at`; Ventas: `conversions.converted_at` |
| **Zona horaria** | UTC |
| **N/D cuando** | No hay leads en el periodo (`totalLeads = 0`) |
| **Limitaciones** | Numerador y denominador pueden provenir de cohortes distintas (el lead puede haberse captado antes que la conversión). Esto es intencional — es una métrica de actividad del periodo, no de cohorte pura. |

### Ingresos del periodo

| Campo | Valor |
|---|---|
| **Fórmula** | `SUM(conversions.amount) WHERE status = 'confirmed'` |
| **Tabla fuente** | `conversions` |
| **Campo de tiempo** | `conversions.converted_at` |
| **Zona horaria** | UTC |
| **N/D cuando** | No hay ventas confirmadas en el periodo |
| **Limitaciones** | Sin normalización de moneda. Si hay conversiones en múltiples monedas, el monto se suma sin conversión; el uso de moneda única es responsabilidad del operador. |

### Ticket promedio

| Campo | Valor |
|---|---|
| **Fórmula** | `Ingresos del periodo / Ventas del periodo` |
| **Tabla fuente** | `conversions` |
| **Campo de tiempo** | `conversions.converted_at` |
| **Zona horaria** | UTC |
| **N/D cuando** | No hay ventas en el periodo (`totalSales = 0`) |

---

## Métricas de rendimiento por campaña × anuncio

### Tabla de rendimiento (`/dashboard/performance`)

Cada fila corresponde a una combinación única de `campaign_id × utm_content`.

| Métrica | Fórmula | Campo de tiempo | N/D |
|---|---|---|---|
| **Leads** | `COUNT(DISTINCT leads.id)` | `leads.created_at` | Nunca (0 es válido) |
| **Ventas** | `COUNT(DISTINCT conversions.id)` donde la conversión fue en el periodo | `conversions.converted_at` | Nunca (0 es válido) |
| **Conversión %** | `Ventas / Leads × 100` | Mixto (ver abajo) | Cuando `Leads = 0` |
| **Ingresos** | `SUM(conversions.amount)` para las conversiones en el periodo | `conversions.converted_at` | Nunca (0 es válido; ausencia de conversiones = $0.00) |

**Semántica mixta en la tabla de rendimiento**: los leads son filtrados por `leads.created_at`; las ventas de cada fila corresponden a conversiones cuyo `converted_at` cae en el mismo periodo, para el mismo `campaign_id`. Esto permite ver la actividad del periodo por campaña, no la cohorte pura.

---

## Vista de cohorte (futura)

La vista de cohorte atribuye conversiones al periodo en que se captó el lead:

| Métrica | Fórmula | Campo de tiempo |
|---|---|---|
| **Leads captados** | `COUNT(leads.id)` | `leads.created_at` |
| **Conversiones de cohorte** | `COUNT(conversions.id)` para esos leads | `leads.created_at` (del lead) |
| **Tasa de cohorte** | `Conversiones / Leads × 100` | `leads.created_at` |

La diferencia: un lead captado en enero y convertido en marzo aparece en la cohorte de enero, no de marzo.

---

## Gráficas del dashboard

### Leads por día

- **Eje X**: día (`YYYY-MM-DD`)
- **Serie "Leads"**: `COUNT(leads.id)` agrupado por `date_trunc('day', leads.created_at)`
- **Serie "Ventas"**: `COUNT(conversions.id)` agrupado por `date_trunc('day', conversions.converted_at)`
- **Nota**: las dos series usan fechas distintas — un pico de ventas el día 15 no implica un pico de leads el mismo día.

### Leads por campaña

- **Barras "Leads"**: por `leads.created_at`
- **Barras "Ventas"**: conversiones con `converted_at` en el periodo, para leads de esa campaña

---

## KPIs de Meta Ads Insights (requiere conexión activa)

Documentados en `docs/META_INSIGHTS_INTERNAL_BETA.md`.

| KPI | Fórmula | N/D cuando |
|---|---|---|
| **CPL** | `Gasto / COUNT(leads tipo 'lead')` | Gasto ≤ 0 o leads = 0 |
| **CPA** | `Gasto / COUNT(conversiones Meta)` | Gasto ≤ 0 o conversiones = 0 |
| **ROAS** | `Ingresos atribuidos / Gasto` | Gasto ≤ 0 |

**Seguridad de moneda**: si los datos contienen múltiples monedas, CPL/CPA/ROAS devuelven N/D para evitar sumas incorrectas.

---

## Convenciones de código

| Valor | Significado |
|---|---|
| `null` | N/D — dato no disponible o denominador cero |
| `0` | Cero real y explícito |
| `Metric` | Tipo TypeScript = `number \| null` |

Ver `src/domains/analytics/types.ts` para la definición de `Metric` y `DashboardKPIs`.
