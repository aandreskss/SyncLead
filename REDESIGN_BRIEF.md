# Brief de implementación — SyncLead: rediseño claro + Visitantes + Insights Meta

Este archivo es el brief para que Claude Code (con el repo abierto y contexto completo) implemente lo que se diseñó en la sesión de Cowork. No es una decisión final cerrada en dos puntos — están marcados abajo como **DECISIÓN ABIERTA** porque durante la investigación aparecieron cosas que la sesión de diseño no sabía que ya existían en el repo.

**Canvas de diseño de referencia:** https://claude.ai/artifact/ME4PCW2UszGmupN6RiBHer (14 tableros: Resumen, Rendimiento, Visitantes, Insights Meta, Campañas, Clientes, Leads, Funnels, Salud, Importar, Equipo, Cuenta, Sistema, Móvil). Es un canvas de diseño estático (`.dc.html` con estilos inline) — sirve como referencia visual pixel a pixel, no como código a copiar literalmente.

## 0. Antes de tocar nada

Dos cosas que la sesión de diseño (Cowork) no tenía en su contexto y que aparecieron al inspeccionar el repo real. Resuélvanlas antes de escribir CSS:

**DECISIÓN ABIERTA #1 — Ya existe un sistema de tema claro/oscuro.**
`components/app/ThemeProvider.tsx` (next-themes) + `app/globals.css` ya definen `.sg-app` (oscuro, tokens `--ops-*`) y `html.light .sg-app` (una variante clara del MISMO lenguaje visual: paneles planos, radio pequeño, sombra sutil `--ops-card-shadow`). `dashboard/layout.tsx` tiene `defaultTheme="light"`.

El diseño nuevo (tarjetas blancas de 20px de radio, sombra suave, insignias de icono pastel, chips en píldora, color primario coral) es un lenguaje visual **distinto**, no solo una repintada de colores — cambia forma, no solo color. Dos caminos:
- (a) El nuevo diseño de tarjetas reemplaza también la variante `html.light .sg-app` existente (se pierde el modo claro "plano" que ya hicieron), y el oscuro (`.sg-app` sin `html.light`) se queda como está o se retira el toggle.
- (b) Se agrega un tercer tema (ej. `html.cards .sg-app`) y el toggle pasa a tener 3 estados, o el nuevo diseño de tarjetas reemplaza el toggle por completo.
El usuario pidió "reemplaza todo" el tema oscuro por este; probablemente (a) es lo que quiere, pero confírmalo con él antes de borrar el toggle o el modo oscuro, porque otra sesión invirtió trabajo real en construirlo.

**DECISIÓN ABIERTA #2 — "Visitantes" ya existe, pero por cliente, no a nivel de organización.**
`app/dashboard/clients/[id]/tracking/visitors/page.tsx` y `visitors/[visitorId]/page.tsx` YA implementan casi exactamente lo que el canvas diseñó para "Visitantes": usan `getVisitorSessionsByClient` de `domains/tracking/repository.ts` (mismo `VisitorSessionRow`: `visitorId`, `eventCount`, `firstSeen/lastSeen`, `sessionDurationMs`, `utmSource/Medium/Campaign`, `referrer`, `visitorCity/Country`, `hasCheckout/AddToCart/ViewProduct/FormSubmit/Purchase/InfoRequest`, `uniquePageCount`, `linkedLeadId/CampaignId/LeadName`). Es decir: ya hay una página de "Visitantes", pero anidada bajo un cliente (`clients/[id]/tracking/visitors`), no un ítem de navegación de primer nivel con selector de cliente arriba (como lo mostraron las 3 capturas del usuario y como lo armé en el canvas).

Recomendación: no dupliques la lógica. Dos opciones, decide con el usuario:
- El nuevo ítem de nav "Visitantes" es una vista a nivel de organización que agrega `getVisitorSessionsByClient` en un loop por cada cliente del org (función nueva, aditiva, solo lectura — algo como `getVisitorSessionsByOrg(orgId, days)` en `domains/tracking/repository.ts`) y cada fila enlaza al detalle existente por cliente.
- O el nuevo ítem de nav simplemente redirige/lista clientes y cada uno lleva a la página ya existente, restyleada.
Cualquiera de las dos es correcta; lo que no se debe hacer es reescribir `getVisitorSessionsByClient` ni tocar el esquema de `conversion_observations` — esa lógica ya funciona y el usuario pidió explícitamente no dañarla.

También existen, sin cubrir en el canvas y sin tocar en esta sesión, `app/dashboard/reports/*` y `app/dashboard/ad-research/*`. Aplícales el mismo sistema de diseño por extrapolación de los patrones de abajo (son tablas, tarjetas y filtros igual que el resto).

## 1. Reglas que no cambian (vienen de todo el proyecto, no solo de esta parte)

- Sin cambios a lógica de base de datos, auth o CRM — solo visual/interacción, salvo la función aditiva de solo lectura de la Decisión #2 si se opta por esa vía.
- Sin datos inventados: ni testimonios, ni métricas, ni precios. CPL/CPA/ROAS solo si Meta Ads Insights está conectado; si no, "N/D" con nota "Requiere Meta Ads Insights conectado" (patrón ya usado en Rendimiento — no cambia).
- "Insights Meta" hoy NO tiene datos reales: no existe ingesta de comentarios/DMs de Facebook/Instagram en el repo (`app/api/webhook/meta/[clientId]` es solo para `leadgen` — leads de formularios, no comentarios). La página debe mostrar un estado real de "no conectado" como estado principal (igual que Salud muestra "Sin conexiones activas"), nunca datos en vivo inventados. Ver sección 4.
- "Abrir WhatsApp" nunca debe insinuar que se envió un mensaje — solo abre la conversación.
- WCAG AA, `prefers-reduced-motion`, navegación por teclado, foco visible.
- Nunca hagas commit/push/deploy salvo que el usuario lo pida explícitamente.
- Ejecuta `npx tsc --noEmit`, `next build`, `eslint` sobre los archivos tocados y `vitest run` al terminar. Los 48 tests que fallan en `permissions-matrix.test.ts` y `auth-isolation.test.ts` (mocks de `db.query` vs `db.select`) son preexistentes a este trabajo — no te detengas por esos, pero no agregues fallas nuevas.

## 2. Sistema de diseño (tokens)

Colores (hex):

```
bg:        #FFFFFF   sidebar: #F6F6F9   borde: #EAEBF0   borde fuerte: #D8D9E3
texto:     #14172A   texto2:  #5B6178   texto3: #9297AA
navy (panel oscuro de contraste): #12142A   texto sobre navy: #F5F6FB   navy muted: #9AA0C0
azul:      #3E5CFA   azul bg pastel: #E9EDFF
verde/teal:#12B48A   teal bg pastel: #E1F7EF
coral (color primario / CTA): #F0684D   coral bg pastel: #FDE6E0   coral suave (fondo de panel): #FBEAE3
ámbar:     #E4A730   ámbar bg pastel: #FCF1DC
```

Tipografía: Geist para todo (títulos 600, tamaño ~32px con tracking -0.02em; párrafo/label normal); IBM Plex Mono solo para cifras (`font-variant-numeric: tabular-nums`).

Forma: tarjetas con **radio 20px**, borde 1px `#EAEBF0`, sombra suave `0 1px 2px rgba(16,24,40,.04), 0 10px 24px -12px rgba(16,24,40,.10)` — nunca sombras duras ni degradados. Botones y chips en píldora (`rounded-full`/999px). Insignias de icono: cuadrado de 40px, radio 12px, fondo pastel del color de acento, icono del color de acento sólido.

Componentes a construir/actualizar (equivalente a lo que en el prototipo del canvas se llama `kpi_card`, `chip`, `btn`, `panel`, `funnel_bar`, `progress`, `badge`):
- `KPICard`: label en mayúsculas pequeñas + insignia de icono arriba a la derecha, valor grande (30px, 600), píldora de delta abajo ("Sin datos comparables" cuando no hay periodo previo — mismo patrón que ya usan `KPIStrip`/`DashboardMetrics`, no inventes comparativas).
- `Panel`: variantes `white` (tarjeta blanca normal), `navy` (panel oscuro de contraste para "qué revisar"/notas), `coral` (fondo coral suave para una acción destacada tipo callout).
- `StatusChip`: píldora con borde del color + punto + texto (nunca solo color).
- Botones: primario = coral sólido; secundario = blanco con borde; navy = para acciones sobre panel oscuro.
- Tabla: header en gris muy claro `#FAFAFC` con radio, filas con borde inferior sutil, sin fondo alterno.
- Barra de embudo (`funnel_bar` en el canvas): usada en "Del alcance a la intención" de Visitantes y en temperatura de Resumen — barra sólida de color con label, valor en mono y % dentro.

## 3. Páginas existentes a restylear (visual, sin tocar data fetching)

Todas están en `src/app/dashboard/` y ya tienen server actions/repos funcionando — solo cambia clases y estructura de presentación, reutilizando los componentes del punto 2. En cada una, respeta exactamente los datos que el componente ya recibe por props; no agregues campos que no vienen del backend.

1. **Shell** (`layout.tsx`, `DashboardSidebar.tsx`, `DashboardNav.tsx`): sidebar clara 232px, grupo activo con fondo `#E9EDFF` y texto azul, sin barra lateral de 3px (eso era del tema oscuro anterior). Agrega "Visitantes" e "Insights Meta" al grupo "Análisis" en `NAV_GROUPS` (después de "Rendimiento", antes de "Reportes" o donde tenga más sentido).
2. **Resumen ejecutivo** (`dashboard/page.tsx` + `_components/*`): eyebrow azul "PANORAMA GENERAL", 4 KPICards, el gráfico de "Leads por día" (mantener el tipo Area+Line que al usuario le encanta, solo recolorear a paleta clara: área azul, línea coral), panel navy "Qué revisar" al lado, tabla de campañas, barras de embudo para temperatura.
3. **Rendimiento**: igual patrón — CPL/ROAS siguen en N/D real cuando no hay Meta Ads Insights, con nota "Requiere Meta Ads Insights".
4. **Campañas, Clientes, Leads de campaña, Funnels (kanban), Salud, Importar, Equipo, Mi cuenta**: mismo lenguaje (tarjetas, chips, tablas, botones en píldora). El kanban usa columnas de 300px con fondo `#F6F6F9` y tarjetas blancas de leads adentro — no toques el drag-and-drop, solo las clases.
5. **Reportes y Anuncios (ad-research)**: no estaban en el canvas; aplícales los mismos componentes por extrapolación (son tablas/tarjetas/formularios, no hay nada estructuralmente distinto).

## 4. Páginas nuevas

### 4.1 Visitantes

Depende de la Decisión Abierta #2 de arriba. Independiente de cuál se elija, el contenido real disponible es:

- KPIs: visitantes únicos (conteo de sesiones), sesiones con señal de interés (`hasViewProduct || hasAddToCart || hasInfoRequest`), leads vinculados (`linkedLeadId` no nulo), tiempo medio en sitio (promedio de `sessionDurationMs`). Deltas: "Sin datos comparables" (no hay periodo previo implementado — no lo inventes).
- Embudo "Del alcance a la intención": Alcanzados (suma de `impressions`/`reach` de `ad_insights_daily` — **N/D si no hay Meta Ads Insights conectado**, igual regla que CPL/ROAS) → Visitantes → Con interés → Leads, con porcentaje real sobre el total de visitantes.
- Tabla "Fuentes de visitantes": agrupar `VisitorSessionRow` por `utmSource` (o "Directo" si es null) — visitantes, con interés, tiempo medio, conversión a lead (%). No inventes una columna de "salud" con umbrales mágicos salvo que definan uno explícito y lo documenten.
- Tabla "Sesiones recientes": `visitorId` (mostrar truncado/enmascarado), fuente resuelta (reutiliza `resolveSource` de la página de visitantes por cliente que ya existe), `uniquePageCount`, chips de señales (Carrito/Checkout/Formulario/Compra según los flags `has*`), `lastSeen` relativo, lead vinculado si `linkedLeadName` existe (enlaza al lead).
- No repliques el "Perfil dominante" tipo IA de la referencia del usuario (persona con texto generado) — no hay datos de dispositivo/edad en `VisitorSessionRow` para eso honestamente.

### 4.2 Insights Meta

No hay integración real todavía (confirmado con el usuario: la arquitectura de mensajes existe para otros canales, pero la API de comentarios/DMs de Meta no está conectada). Construye la página así:

- Estado principal: panel centrado, insignia de icono, "La API de comentarios y mensajes de Meta aún no está conectada", texto explicando qué se va a poder ver ahí, chip "No conectado", botón "Conectar Meta" (puede ser un link a donde ya se gestionan las conexiones de Meta del cliente — revisa `domains/meta` para ver si hay un flujo de conexión existente que puedas reutilizar en vez de crear uno nuevo).
- Debajo, una sección de **vista previa** claramente marcada (ribbon "VISTA PREVIA" + texto "datos de ejemplo, no en vivo") mostrando la estructura que tendrá una vez conectada (tarjetas Facebook/Instagram/Eventos, tabla de señales con intención/afinidad/prioridad, panel navy "Radar de intención"). Esto es solo maqueta visual — no crea rutas de API ni tablas nuevas en el schema para esto todavía, a menos que el usuario pida explícitamente empezar esa integración.
- Si quieres dejar la puerta abierta para cuando se conecte la API real, un componente `EmptyState`/`ConnectState` reutilizable es buena idea (mismo patrón que ya usa Salud para "Sin conexiones activas").

## 5. Orden sugerido

1. Resolver las dos decisiones abiertas de la sección 0 con el usuario (o con tu propio juicio si Cowork ya te dio indicación clara en el chat).
2. Sistema de diseño: tokens + componentes (`Panel`, `KPICard`, `StatusChip`, botones, tabla) — un solo lugar, reutilizado por todo.
3. Shell (sidebar + nav, agregar Visitantes e Insights Meta).
4. Resumen ejecutivo (es la página que más se usa, y la que ya tiene el gráfico querido por el usuario — verifícalo primero).
5. Resto de páginas existentes.
6. Visitantes e Insights Meta (páginas nuevas).
7. `tsc`, `build`, `eslint`, `vitest`, y reporta igual que en los pasos anteriores: qué se hizo, qué se dejó pendiente y por qué, sin inventar que algo quedó perfecto si no lo verificaste.

No hagas commit ni push salvo que el usuario lo pida.
