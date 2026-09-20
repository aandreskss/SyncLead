export type RemediationGuide = {
  key: string
  title: string
  impact: string
  steps: string[]
  codeExample?: string
  verifyStep: string
}

const GUIDES: RemediationGuide[] = [
  {
    key: "pixel_base_missing",
    title: "Pixel base de Meta ausente",
    impact: "Sin el pixel base ningún evento se registra en Meta Events Manager. Las campañas no pueden optimizar ni medir conversiones.",
    steps: [
      "1. Accede a Meta Business Suite → Events Manager → Orígenes de datos.",
      "2. Selecciona tu Pixel o crea uno nuevo si no existe.",
      "3. Copia el código base del Pixel (incluye fbq('init', 'TU_PIXEL_ID') y fbq('track', 'PageView')).",
      "4. Pega el código en el <head> de todas las páginas, antes del cierre </head>.",
      "5. En Next.js usa next/script con strategy='afterInteractive' o un componente de layout raíz.",
      "6. Confirma que el pixel se dispara antes de cualquier evento de conversión.",
    ],
    codeExample: `// app/layout.tsx — instalación en Next.js App Router
import Script from 'next/script'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  return (
    <html>
      <head />
      <body>
        {children}
        <Script id="meta-pixel" strategy="afterInteractive">
          {/* Fragmento oficial de Meta — no modificar la estructura */}
          {\`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '\${pixelId}');
            fbq('track', 'PageView');
          \`}
        </Script>
      </body>
    </html>
  )
}`,
    verifyStep: "Instala Meta Pixel Helper en Chrome. Recarga la página y verifica que el Pixel ID correcto aparece en verde con el evento PageView.",
  },
  {
    key: "pixel_id_mismatch",
    title: "Pixel ID incorrecto en el sitio",
    impact: "Los eventos se envían a un Pixel diferente al configurado en tus campañas, por lo que Meta no puede atribuir conversiones correctamente.",
    steps: [
      "1. En Meta Events Manager, copia el Pixel ID exacto de tu cuenta (formato: número de 15-16 dígitos).",
      "2. Busca en tu código la llamada fbq('init', 'PIXEL_ID') y compara el ID.",
      "3. Actualiza la variable de entorno NEXT_PUBLIC_META_PIXEL_ID con el ID correcto.",
      "4. Si usas múltiples entornos (staging, production), verifica que cada uno apunte al Pixel correcto.",
      "5. Despliega el cambio y confirma con Meta Pixel Helper.",
    ],
    verifyStep: "Abre Meta Pixel Helper, recarga la página y confirma que el Pixel ID mostrado coincide exactamente con el de Events Manager.",
  },
  {
    key: "event_not_implemented",
    title: "Evento no implementado",
    impact: "Meta no recibe esta conversión. Las campañas de optimización no pueden aprender a encontrar usuarios similares a los que convierten.",
    steps: [
      "1. Identifica el punto exacto en la UI donde ocurre la conversión (envío de formulario, clic en botón, carga de página de confirmación).",
      "2. Añade la llamada fbq('track', 'EventName', parametros) en el callback correcto.",
      "3. Asegúrate de que el evento solo se dispara cuando la acción es exitosa.",
      "4. Si usas CAPI, implementa también el envío server-side con el mismo event_id.",
    ],
    codeExample: `// Ejemplo: evento Lead en submit de formulario
async function handleFormSubmit(formData: FormData) {
  const eventId = crypto.randomUUID()

  const response = await fetch('/api/leads', {
    method: 'POST',
    body: JSON.stringify({ ...Object.fromEntries(formData), eventId }),
  })

  if (!response.ok) return // No disparar si el servidor falla

  // Browser (Pixel)
  window.fbq('track', 'Lead', { event_id: eventId })

  // El servidor ya envió el mismo evento por CAPI con el mismo eventId
}`,
    verifyStep: "Completa la acción en el sitio y verifica en Meta Pixel Helper que el evento aparece con los parámetros correctos. Confirma en Events Manager → Test Events.",
  },
  {
    key: "event_not_firing",
    title: "Evento implementado pero no se dispara",
    impact: "El código existe pero Meta no recibe el evento, lo que significa que no hay datos de conversión para optimización.",
    steps: [
      "1. Abre DevTools → Network y filtra por 'facebook.net'. Realiza la acción y verifica si aparece la solicitud.",
      "2. Agrega console.log antes de fbq('track', ...) para confirmar que el código se ejecuta.",
      "3. Verifica que el selector del elemento (botón, formulario) es correcto y el evento DOM está adjunto.",
      "4. Confirma que el evento no está bloqueado por una condición (ej: validación fallida, usuario no autenticado).",
      "5. Revisa si un bloqueador de anuncios o extensión del navegador está interceptando la solicitud.",
      "6. Verifica que el código de rastreo no está dentro de un bloque condicional de consentimiento que no se activa.",
    ],
    verifyStep: "Con DevTools abierto en la pestaña Network, realiza la acción y confirma que aparece una solicitud a tr.facebook.com con el evento correcto.",
  },
  {
    key: "event_fired_twice",
    title: "Evento se dispara dos veces",
    impact: "Meta cuenta cada disparo como una conversión separada, inflando las métricas y desperdiciando presupuesto de optimización en datos incorrectos.",
    steps: [
      "1. Busca en el código todas las instancias de fbq('track', 'NombreEvento') para este evento.",
      "2. Verifica si hay múltiples listeners adjuntos al mismo elemento (ej: React StrictMode en desarrollo).",
      "3. Confirma que el componente no se monta dos veces por hot reload o por estar en layout y page simultáneamente.",
      "4. Si el evento se dispara en cliente y servidor, asegúrate de que el event_id es el mismo para que Meta deduplique.",
      "5. Usa useRef o una bandera de estado para garantizar que el evento solo se dispara una vez por acción.",
    ],
    codeExample: `// Patrón para garantizar un solo disparo por acción
const firedRef = React.useRef(false)

function handleSuccess() {
  if (firedRef.current) return
  firedRef.current = true
  window.fbq('track', 'Lead', { event_id: eventId })
}`,
    verifyStep: "Realiza la acción una vez y verifica en Meta Pixel Helper que el evento aparece exactamente una vez. Revisa Events Manager → Test Events para confirmar.",
  },
  {
    key: "event_before_consent",
    title: "Evento disparado antes de consentimiento del usuario",
    impact: "Puede violar GDPR, CCPA y las Políticas de Datos de Meta. Puede resultar en suspensión del Pixel o multas regulatorias.",
    steps: [
      "1. Identifica tu herramienta de consentimiento (CMP: OneTrust, Cookiebot, Iubenda, etc.).",
      "2. Envuelve la inicialización del Pixel en el callback de aceptación del CMP.",
      "3. Para fbq('init'), usa el modo de consentimiento de Meta: fbq('consent', 'revoke') por defecto y fbq('consent', 'grant') solo tras aceptación.",
      "4. Confirma que fbq('track', ...) para eventos de conversión solo se ejecuta después de fbq('consent', 'grant').",
      "5. Prueba el flujo completo: recarga sin aceptar y verifica que no hay solicitudes a facebook.net.",
    ],
    codeExample: `// Modo consentimiento de Meta — inicialización antes del grant
fbq('consent', 'revoke') // Antes de que el usuario decida
fbq('init', 'TU_PIXEL_ID')

// En el callback de aceptación del CMP:
function onConsentGranted() {
  fbq('consent', 'grant')
  fbq('track', 'PageView')
}`,
    verifyStep: "Recarga la página sin aceptar cookies. Verifica en DevTools Network que no hay solicitudes a tr.facebook.com. Acepta y confirma que PageView se dispara.",
  },
  {
    key: "event_blocked_by_consent",
    title: "Evento bloqueado por consentimiento — CAPI no configurado",
    impact: "Si el usuario rechaza cookies, el Pixel no dispara pero CAPI puede continuar enviando datos server-side de forma conforme. Sin CAPI se pierden estas conversiones.",
    steps: [
      "1. Implementa Meta Conversions API (CAPI) en tu servidor para enviar eventos server-side.",
      "2. CAPI puede operar con datos hasheados (email, teléfono) sin depender de cookies del browser.",
      "3. Configura el dataset de CAPI en Meta Events Manager y obtén un access token.",
      "4. Envía los mismos eventos de conversión por CAPI usando el mismo event_id que el Pixel cuando ambos estén activos.",
      "5. Para usuarios que rechazan cookies, envía solo por CAPI con los datos de usuario disponibles.",
    ],
    verifyStep: "Rechaza cookies en el sitio, completa una conversión y verifica en Events Manager → Test Events que el evento llega por CAPI (fuente: server).",
  },
  {
    key: "event_wrong_page",
    title: "Evento disparado en página incorrecta",
    impact: "Meta recibe señales de conversión incorrectas, lo que distorsiona la optimización de campañas y las métricas de atribución.",
    steps: [
      "1. Identifica en qué URL(s) debe dispararse el evento según el flujo de conversión.",
      "2. Añade una verificación de ruta antes de la llamada fbq('track', ...).",
      "3. En Next.js App Router, usa el componente de evento solo en el layout/page correcto.",
      "4. Si el evento está en un componente reutilizable, pásale una prop 'enabled' o condiciónalo por pathname.",
    ],
    codeExample: `// Condicionar por pathname en Next.js
'use client'
import { usePathname } from 'next/navigation'

export function ConversionTracker() {
  const pathname = usePathname()

  React.useEffect(() => {
    if (pathname !== '/gracias') return
    window.fbq('track', 'Lead')
  }, [pathname])

  return null
}`,
    verifyStep: "Navega a la página incorrecta y confirma en Meta Pixel Helper que el evento NO aparece. Luego navega a la página correcta y verifica que SÍ aparece.",
  },
  {
    key: "purchase_no_value",
    title: "Purchase sin valor o moneda",
    impact: "Meta no puede reportar ROAS (retorno sobre inversión publicitaria) ni optimizar campañas por valor de conversión. Los datos de Purchase sin valor son casi inútiles para optimización.",
    steps: [
      "1. Añade los parámetros 'value' (número decimal) y 'currency' (código ISO 4217, ej: 'USD', 'EUR') a la llamada fbq('track', 'Purchase', ...).",
      "2. Obtén el valor del total de la orden desde tu sistema, no del frontend (para prevenir manipulación).",
      "3. Asegúrate de que el valor es un número (no string): parseFloat(total.toFixed(2)).",
      "4. Incluye también content_ids con los IDs de productos y num_items.",
    ],
    codeExample: `// Evento Purchase completo
window.fbq('track', 'Purchase', {
  value: 99.90,        // Total de la orden — número, no string
  currency: 'USD',     // Código ISO 4217
  content_ids: ['SKU-001', 'SKU-002'],
  content_type: 'product',
  num_items: 2,
  order_id: 'ORD-12345',
  event_id: eventId,   // Para deduplicación con CAPI
})`,
    verifyStep: "Completa una compra de prueba y verifica en Meta Pixel Helper que el evento Purchase incluye value y currency con valores correctos.",
  },
  {
    key: "lead_on_form_open",
    title: "Lead disparado al abrir formulario en vez de enviarlo",
    impact: "Meta recibe señales de Lead de usuarios que nunca completaron el formulario, inflando artificialmente las conversiones y degradando la calidad de la audiencia de optimización.",
    steps: [
      "1. Localiza el fbq('track', 'Lead') en el código y muévelo del evento de apertura del modal/formulario al callback de éxito del submit.",
      "2. El disparo debe estar dentro de la función que maneja la respuesta exitosa del servidor, no en onClick del botón que abre el formulario.",
      "3. Añade un log temporal para confirmar el orden de ejecución: apertura → submit → servidor OK → Lead.",
    ],
    codeExample: `// MAL: Lead en apertura
function openModal() {
  setIsOpen(true)
  window.fbq('track', 'Lead') // Incorrecto
}

// BIEN: Lead en éxito del submit
async function handleSubmit(data: FormData) {
  const result = await submitLead(data)
  if (!result.ok) return
  window.fbq('track', 'Lead', { event_id: result.eventId }) // Correcto
}`,
    verifyStep: "Abre el formulario sin enviarlo y verifica en Meta Pixel Helper que NO aparece Lead. Envía el formulario exitosamente y confirma que SÍ aparece.",
  },
  {
    key: "event_on_form_error",
    title: "Evento disparado aunque el formulario falle",
    impact: "Meta recibe conversiones falsas de usuarios que intentaron pero no completaron la acción. Esto distorsiona los datos de atribución.",
    steps: [
      "1. Verifica que la llamada fbq('track', ...) está dentro del bloque de éxito, no en un bloque ejecutado siempre.",
      "2. Añade verificación explícita: if (!response.ok) return antes del fbq.",
      "3. Maneja errores de red (try/catch) y asegúrate de que el catch no llame al evento.",
      "4. En formularios con validación client-side, el evento solo debe disparar si tanto la validación como el servidor responden OK.",
    ],
    codeExample: `async function handleSubmit(data: FormData) {
  let response: Response

  try {
    response = await fetch('/api/contact', { method: 'POST', body: JSON.stringify(data) })
  } catch {
    showError('Error de red. Intenta de nuevo.')
    return // No disparar evento
  }

  if (!response.ok) {
    showError('El servidor rechazó la solicitud.')
    return // No disparar evento
  }

  const { eventId } = await response.json()
  window.fbq('track', 'Lead', { event_id: eventId }) // Solo aquí
}`,
    verifyStep: "Simula un error de servidor (desconecta internet o usa DevTools para bloquear la solicitud). Intenta enviar el formulario y verifica que Lead NO aparece en Pixel Helper.",
  },
  {
    key: "capi_rejected",
    title: "Evento CAPI rechazado por Meta",
    impact: "El evento no se registra en Events Manager desde el servidor, reduciendo la cobertura de conversiones y la efectividad de deduplicación.",
    steps: [
      "1. Revisa la respuesta de la API de Conversiones de Meta: el campo 'error' contiene el código y mensaje de rechazo.",
      "2. Errores comunes: access token inválido (renueva en Business Settings), dataset ID incorrecto, parámetros de usuario no hasheados correctamente.",
      "3. Para hashear datos de usuario: SHA-256 de email en minúsculas sin espacios, teléfono solo con dígitos y código de país.",
      "4. Verifica que el event_time no sea más de 7 días en el pasado.",
      "5. Usa la herramienta de prueba en Events Manager → Test Events con fuente = server.",
    ],
    codeExample: `// Hasheo correcto de datos de usuario para CAPI
import crypto from 'crypto'

function hashUserData(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex')
}

const userData = {
  em: hashUserData(email),           // email
  ph: hashUserData(phone.replace(/\D/g, '')), // solo dígitos
  fn: hashUserData(firstName),
  ln: hashUserData(lastName),
}`,
    verifyStep: "Envía un evento de prueba desde Events Manager → Test Events (fuente: server) y confirma que el status es 'received' sin errores.",
  },
  {
    key: "event_id_missing",
    title: "event_id ausente — deduplicación imposible",
    impact: "Sin event_id, Meta no puede deduplicar entre Pixel (browser) y CAPI (server). Cada conversión se contará doble si ambos están activos.",
    steps: [
      "1. Genera un event_id único por conversión: usa crypto.randomUUID() en el servidor.",
      "2. Pasa el event_id al frontend antes del disparo del Pixel (ej: incluirlo en la respuesta del servidor).",
      "3. Incluye event_id en fbq('track', 'EventName', { event_id: id }) en el Pixel.",
      "4. Incluye el mismo event_id en el payload de CAPI: { event_id: id }.",
      "5. Nunca uses el mismo event_id para dos conversiones distintas.",
    ],
    codeExample: `// Servidor: genera y devuelve el eventId
export async function POST(request: Request) {
  const data = await request.json()
  const eventId = crypto.randomUUID()

  await saveConversion({ ...data, eventId })
  await sendToCAPI({ eventId, ...data }) // CAPI con el mismo ID

  return Response.json({ eventId }) // Devolver al cliente
}

// Cliente: usa el mismo eventId para el Pixel
const { eventId } = await response.json()
window.fbq('track', 'Lead', { event_id: eventId })`,
    verifyStep: "Verifica en Events Manager → Diagnóstico de eventos que la tasa de deduplicación es menor al 5%. Confirma que el event_id es el mismo en la solicitud del Pixel y en el log de CAPI.",
  },
  {
    key: "dedup_mismatch",
    title: "Deduplicación incorrecta — Pixel y CAPI con distinto event_id",
    impact: "Meta recibe dos eventos con IDs distintos para la misma conversión y los cuenta como dos conversiones separadas, duplicando los reportes.",
    steps: [
      "1. Audita el flujo completo: ¿dónde se genera el event_id? ¿Se pasa correctamente de servidor a cliente?",
      "2. Confirma que el event_id generado en el servidor es el mismo que llega al fbq('track', ...) del Pixel.",
      "3. Agrega logging temporal en servidor y cliente para comparar los IDs en tiempo real.",
      "4. Verifica que no hay una segunda generación de UUID en el cliente.",
      "5. En Events Manager → Detalles del evento puedes ver si llegan dos eventos con IDs distintos.",
    ],
    verifyStep: "Habilita el modo de prueba en Events Manager. Completa una conversión y verifica que en el log de eventos aparece UN solo evento con el mismo event_id tanto en la columna de browser como de server.",
  },
  {
    key: "staging_to_production",
    title: "Evento enviado desde staging al dataset de producción",
    impact: "Los datos de pruebas contaminan el dataset de producción, afectando la optimización de campañas activas y las audiencias de remarketing.",
    steps: [
      "1. Crea un Pixel/dataset separado para staging en Meta Events Manager.",
      "2. Usa variables de entorno distintas por ambiente: NEXT_PUBLIC_META_PIXEL_ID para producción, una variable diferente para staging.",
      "3. Para CAPI, usa el parámetro test_event_code solo en pruebas — nunca en producción.",
      "4. Agrega una verificación en el código: si NODE_ENV !== 'production', usa el Pixel de staging o desactiva el tracking.",
      "5. Documenta los IDs de cada ambiente para el equipo.",
    ],
    codeExample: `// Selección de Pixel según ambiente
const pixelId = process.env.NODE_ENV === 'production'
  ? process.env.NEXT_PUBLIC_META_PIXEL_ID_PROD
  : process.env.NEXT_PUBLIC_META_PIXEL_ID_STAGING

// Para CAPI en staging — usar test_event_code
const capiPayload = {
  ...eventData,
  ...(process.env.NODE_ENV !== 'production' && {
    test_event_code: process.env.META_CAPI_TEST_CODE,
  }),
}`,
    verifyStep: "Revisa Events Manager de producción durante las próximas 24h. Si el volumen de eventos cae al nivel esperado (sin datos de staging), la corrección fue exitosa.",
  },
]

const GUIDE_MAP = new Map<string, RemediationGuide>(
  GUIDES.map((guide) => [guide.key, guide])
)

export function getRemediationGuide(key: string): RemediationGuide | null {
  return GUIDE_MAP.get(key) ?? null
}
