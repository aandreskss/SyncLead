"use client"

import { useState } from "react"
import { Copy, Check, ChevronLeft, ShoppingCart } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScriptConfig =
  | { mode: "single"; apiKey: string; campaignName: string }
  | {
      mode: "multi"
      campaigns: Array<{ utmKey: string; apiKey: string; name: string }>
      defaultUtmKey: string
      organicKey?: string  // key de la campaña "Orgánico / Directo" — fallback absoluto
    }

type PlatformId = "shopify" | "wordpress" | "nextjs" | "html" | "gtm"

interface CodeBlock {
  label: string
  filename?: string
  code: string
}

interface Step {
  title: string
  description?: string
  blocks?: CodeBlock[]
  notes?: string[]
  isPurchase?: true
}

// ─── Script builders ─────────────────────────────────────────────────────────

function buildConfigBlock(config: ScriptConfig, appUrl: string): string {
  if (config.mode === "single") {
    return `window.SyncLeadKey  = "${config.apiKey}";
window.SyncLeadHost = "${appUrl}";`
  }

  const lines: string[] = []

  // Organic fallback — always the last resort, captures leads with no UTM match
  if (config.organicKey) {
    lines.push(`window.SyncLeadKey       = "${config.organicKey}"; // ← orgánico / sin UTM (nunca pierde un lead)`)
  }
  lines.push(`window.SyncLeadHost      = "${appUrl}";`)

  const entries = config.campaigns
    .map((c) => {
      const isDefault = c.utmKey === config.defaultUtmKey
      return `    "${c.utmKey}": "${c.apiKey}"${isDefault ? ", // ← default si no hay UTM conocido" : ","}`
    })
    .join("\n")

  lines.push(`window.SyncLeadCampaigns = {\n${entries}\n};`)

  return lines.join("\n")
}

function captureExample(platform: PlatformId): string {
  if (platform === "wordpress") {
    return `// Contact Form 7
document.addEventListener("wpcf7mailsent", function(e) {
  var f = e.detail.inputs.reduce(function(acc, x) {
    acc[x.name] = x.value; return acc;
  }, {});
  SyncLead.capture({
    name:  f["your-name"]  || "",
    email: f["your-email"] || "",
    phone: f["your-phone"] || "",
  });
});

// WPForms / Gravity Forms / cualquier formulario HTML
document.querySelector("form").addEventListener("submit", function() {
  SyncLead.capture({
    name:  document.querySelector("[name=nombre]").value,
    email: document.querySelector("[name=email]").value,
    phone: document.querySelector("[name=telefono]").value,
  });
});`
  }

  if (platform === "shopify") {
    return `document.addEventListener("DOMContentLoaded", function() {
  var form = document.querySelector("form.contact-form");
  if (!form) return;
  form.addEventListener("submit", function() {
    SyncLead.capture({
      name:  (form.querySelector("[name='contact[name]']")   || {}).value || "",
      email: (form.querySelector("[name='contact[email]']")  || {}).value || "",
      phone: (form.querySelector("[name='contact[phone]']")  || {}).value || "",
    });
  });
});`
  }

  if (platform === "nextjs") {
    return `// En tu componente de formulario
"use client"
declare global { interface Window { SyncLead?: { capture: (d: Record<string, string>) => Promise<unknown> } } }

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
  const form = e.currentTarget
  await window.SyncLead?.capture({
    name:  (form.elements.namedItem("name")  as HTMLInputElement)?.value ?? "",
    email: (form.elements.namedItem("email") as HTMLInputElement)?.value ?? "",
    phone: (form.elements.namedItem("phone") as HTMLInputElement)?.value ?? "",
  })
}

// En tu JSX:
// <form onSubmit={handleSubmit}>...</form>`
  }

  // html
  return `document.getElementById("mi-formulario").addEventListener("submit", function(e) {
  e.preventDefault();
  SyncLead.capture({
    name:  document.getElementById("nombre").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("telefono").value,
  }).then(function(r) {
    if (r.success) {
      // continúa el flujo: redirigir, mostrar mensaje, etc.
      console.log("Lead registrado:", r.leadId);
    }
  });
});`
}

function purchaseExample(platform: PlatformId, config: ScriptConfig, appUrl: string): string {
  const configCode = buildConfigBlock(config, appUrl)
  const fullInstall = `<script>\n  ${configCode}\n</script>\n<script src="${appUrl}/sl.js" defer></script>`

  if (platform === "shopify") {
    return `<!-- Shopify: Configuración → Checkout → Scripts adicionales -->
<!-- Se ejecuta solo en la página de confirmación del pedido -->
{% if first_time_accessed %}
${fullInstall}
<script>
  SyncLead.purchase({
    amount:   {{ checkout.total_price | divided_by: 100.0 }},
    currency: "{{ checkout.currency }}",
    order_id: "{{ checkout.order_id }}",
    email:    "{{ checkout.email }}",
  });
</script>
{% endif %}`
  }

  if (platform === "wordpress") {
    return `<?php
// WPCode → Agregar snippet → PHP Snippet
// Condición de visibilidad: "WooCommerce → Thank You Page"
add_action('woocommerce_thankyou', function($order_id) {
  $order = wc_get_order($order_id);
  if (!$order) return;
  ?>
  <script>
    SyncLead.purchase({
      amount:   <?= (float) $order->get_total() ?>,
      currency: "<?= get_woocommerce_currency() ?>",
      order_id: "<?= esc_js((string)$order_id) ?>",
      email:    "<?= esc_js($order->get_billing_email()) ?>",
    });
  </script>
  <?php
}, 10, 1);`
  }

  if (platform === "nextjs") {
    return `// En tu página de confirmación de pedido
"use client"
import { useEffect } from "react"

declare global {
  interface Window {
    SyncLead?: {
      capture: (d: Record<string, unknown>) => Promise<unknown>
      purchase: (d: Record<string, unknown>) => Promise<unknown>
    }
  }
}

// Llama esto cuando tienes los datos del pedido confirmado
export function useRegisterPurchase(order: {
  id: string; total: number; currency: string; email: string
} | null) {
  useEffect(() => {
    if (!order) return
    window.SyncLead?.purchase({
      amount:   order.total,
      currency: order.currency,
      order_id: order.id,
      email:    order.email,
    })
  }, [order?.id])
}`
  }

  // html genérico
  return `<!-- Pega esto en tu página de confirmación de pedido -->
<script>
  // Reemplaza con los datos reales de tu sistema
  SyncLead.purchase({
    amount:   99.99,              // Monto total (número, no string)
    currency: "USD",              // Código ISO-4217: USD, EUR, VES...
    order_id: "ORDER-12345",      // ID único del pedido (evita duplicados)
    email:    "cliente@email.com" // Para identificar al lead existente
  });
</script>`
}

// ─── GTM steps ────────────────────────────────────────────────────────────────

function getGtmSteps(config: ScriptConfig, appUrl: string): Step[] {
  const configCode = buildConfigBlock(config, appUrl)

  const loaderTag = `<script>
  ${configCode}
</script>
<script src="${appUrl}/sl.js"></script>`

  const captureTag = `<script>
(function () {
  // Busca el formulario recién enviado (GTM inyecta {{Form Element}})
  var form = document.currentScript
    ? document.currentScript.closest('form')
    : null;

  // Extrae el valor de un campo por nombre o id (prueba nombres comunes)
  function val() {
    var names = Array.from(arguments);
    for (var i = 0; i < names.length; i++) {
      var el = document.querySelector('[name="' + names[i] + '"]')
            || document.querySelector('#' + names[i]);
      if (el && el.value && el.value.trim()) return el.value.trim();
    }
    return '';
  }

  window.SyncLead && window.SyncLead.capture({
    name:  val('name', 'nombre', 'full_name', 'fullname', 'your-name', 'apellido'),
    email: val('email', 'correo', 'mail', 'your-email', 'e-mail'),
    phone: val('phone', 'telefono', 'tel', 'celular', 'movil', 'your-phone'),
    city:  val('city', 'ciudad'),
  });
})();
</script>`

  const dlPushExample = `// ── Opción B: Data Layer (recomendado para React / Vue / SPA) ──────────────
// Agrega esto en tu handler de formulario, JUSTO al confirmar el envío:
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event:    'synclead_lead',
  sl_name:  nombre,    // variable con el nombre del lead
  sl_email: email,     // variable con el email
  sl_phone: telefono,  // variable con el teléfono
});

// ── Opción B — Contact Form 7 (WordPress) ─────────────────────────────────
document.addEventListener('wpcf7mailsent', function (e) {
  var f = {};
  e.detail.inputs.forEach(function (i) { f[i.name] = i.value; });
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event:    'synclead_lead',
    sl_name:  f['your-name']  || '',
    sl_email: f['your-email'] || '',
    sl_phone: f['your-phone'] || '',
  });
});`

  const captureTagDL = `<script>
// Disparado por el evento personalizado "synclead_lead" del dataLayer
window.SyncLead && window.SyncLead.capture({
  name:  {{DLV - sl_name}}  || '',
  email: {{DLV - sl_email}} || '',
  phone: {{DLV - sl_phone}} || '',
});
</script>`

  const purchaseTagDL = `<script>
// Dispara esto en la página de confirmación de pedido con un evento dataLayer:
// dataLayer.push({ event: 'synclead_purchase', sl_amount: 99.99,
//   sl_currency: 'USD', sl_order_id: 'ORD-123', sl_email: 'cliente@email.com' });

window.SyncLead && window.SyncLead.purchase({
  amount:   {{DLV - sl_amount}},
  currency: {{DLV - sl_currency}},
  order_id: {{DLV - sl_order_id}},
  email:    {{DLV - sl_email}},
});
</script>`

  const purchaseDLPush = `// Página de confirmación de pedido — pega esto en tu sistema
// (o crea un snippet WPCode / Shopify "Additional scripts")
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event:          'synclead_purchase',
  sl_amount:      99.99,       // ← monto real del pedido (número)
  sl_currency:    'USD',       // ← ISO-4217: USD, EUR, VES...
  sl_order_id:    'ORD-123',   // ← ID único del pedido (evita duplicados)
  sl_email:       'cliente@email.com', // ← email del comprador
});`

  return [
    {
      title: "Crea el tag SyncLead Loader",
      description: "En GTM ve a Tags → Nueva → Etiqueta HTML personalizada. Ponle el nombre SyncLead Loader y pega este código:",
      blocks: [{ label: "Tag: SyncLead Loader", code: loaderTag }],
      notes: [
        "Activador: <b>All Pages</b> (o Inicialización del DOM para mayor compatibilidad).",
        "Este tag carga sl.js y registra automáticamente UTMs, fbclid, nombre de campaña, adset y anuncio de Meta en cada visita.",
        config.mode === "multi"
          ? "Modo multi-campaña activo: sl.js selecciona el API key correcto según el utm_campaign del visitante."
          : "Modo campaña única activo: todos los leads van a la campaña configurada.",
      ],
    },
    {
      title: "Activa las variables de formulario integradas",
      description: "En GTM ve a Variables → Configurar variables integradas y activa las siguientes:",
      notes: [
        "<b>Form Classes</b> — clase CSS del formulario enviado.",
        "<b>Form Element</b> — referencia al elemento &lt;form&gt; enviado.",
        "<b>Form ID</b> — atributo id del formulario.",
        "Esto le permite a GTM identificar cuál formulario se envió.",
      ],
    },
    {
      title: "Crea el activador de envío de formulario",
      description: "En GTM ve a Activadores → Nuevo → Envío de formulario:",
      notes: [
        "<b>Esperar etiquetas</b>: activado — da tiempo a SyncLead de enviar el lead antes de que la página navegue.",
        "<b>Verificar validación</b>: activado — solo dispara si el formulario pasa la validación HTML nativa.",
        "<b>Disparar en</b>: Todos los formularios. (Si tienes múltiples formularios, filtra por Form ID o Form Classes para que solo se dispare en el formulario de leads.)",
      ],
    },
    {
      title: "Crea el tag SyncLead Capture Lead",
      description: "Tags → Nueva → Etiqueta HTML personalizada. Nombre: SyncLead Capture Lead. Activador: el que creaste en el paso anterior.",
      blocks: [
        {
          label: "Tag: SyncLead Capture Lead (Opción A — sin cambios de código)",
          code: captureTag,
        },
      ],
      notes: [
        "El tag intenta múltiples nombres de campo comunes (name, nombre, email, correo, phone, telefono, etc.) para funcionar con la mayoría de formularios sin tocar el código del sitio.",
        "Si tus campos tienen nombres distintos, agrégalos al array correspondiente en la función <code>val()</code>.",
      ],
    },
    {
      title: "Alternativa: Data Layer (recomendado para SPAs y React)",
      description: "Si el sitio usa React, Vue u otro framework donde GTM no puede capturar el formulario automáticamente, usa el enfoque Data Layer. Agrega este código donde confirmas el envío del formulario:",
      blocks: [{ label: "Data Layer push — en el handler del formulario", code: dlPushExample }],
      notes: [
        "Después, crea en GTM un activador de <b>Evento personalizado</b> con nombre <code>synclead_lead</code>.",
        "Crea tres Variables de capa de datos: <code>sl_name</code>, <code>sl_email</code>, <code>sl_phone</code>.",
        "Usa este tag en lugar del de la Opción A:",
      ],
    },
    {
      title: "Tag alternativo para Data Layer",
      description: "Si usas Data Layer (Opción B), sustituye el tag de captura por este. Las variables {{DLV - sl_name}} etc. deben coincidir con las que creaste:",
      blocks: [{ label: "Tag: SyncLead Capture Lead (Opción B — Data Layer)", code: captureTagDL }],
    },
    {
      title: "Registra ventas en tiempo real",
      description: "En la página de confirmación de pedido, empuja los datos al Data Layer. Puedes hacerlo desde Shopify Additional Scripts, WPCode, o el sistema de checkout que uses:",
      blocks: [
        { label: "Data Layer push — confirmación de pedido", code: purchaseDLPush },
        { label: "Tag: SyncLead Purchase (activado por evento synclead_purchase)", code: purchaseTagDL },
      ],
      notes: [
        "Crea el activador en GTM: Evento personalizado → nombre del evento: <code>synclead_purchase</code>.",
        "Crea cuatro Variables de capa de datos: <code>sl_amount</code>, <code>sl_currency</code>, <code>sl_order_id</code>, <code>sl_email</code>.",
        "Este tag dispara <code>SyncLead.purchase()</code> que registra la venta Y envía el evento Purchase a Meta CAPI en tiempo real.",
      ],
      isPurchase: true,
    },
    {
      title: "Publica el contenedor y prueba",
      description: "En GTM ve a Enviar → Publicar. Luego activa el Modo Vista previa (Preview) para verificar que los tags se disparan correctamente:",
      notes: [
        "Abre tu sitio con GTM en modo Preview activo.",
        "Llena el formulario de contacto: deberías ver <b>SyncLead Capture Lead</b> disparado en el panel de GTM.",
        "Verifica en SyncLead que el lead aparece con UTM, plataforma y dispositivo.",
        "Para ventas, navega a la página de confirmación y verifica que <b>SyncLead Purchase</b> se dispara.",
      ],
    },
  ]
}

// ─── Per-platform step definitions ───────────────────────────────────────────

function getSteps(platform: PlatformId, config: ScriptConfig, appUrl: string): Step[] {
  if (platform === "gtm") return getGtmSteps(config, appUrl)

  const configCode = buildConfigBlock(config, appUrl)
  const installScript = `<script>\n  ${configCode}\n</script>\n<script src="${appUrl}/sl.js" defer></script>`
  const captureScript = captureExample(platform)
  const purchaseScript = purchaseExample(platform, config, appUrl)

  if (platform === "shopify") {
    return [
      {
        title: "Abre el editor de código de tu tema",
        description: "En tu panel de Shopify:",
        notes: [
          "Ve a Tienda online → Temas",
          'Clic en "⋯" junto al tema activo → Editar código',
          "En la carpeta Layout, abre el archivo theme.liquid",
        ],
      },
      {
        title: "Pega el script de instalación",
        description: "Busca la etiqueta </body> al final del archivo y pega esto justo antes:",
        blocks: [{ label: "theme.liquid — antes de </body>", filename: "theme.liquid", code: installScript }],
      },
      {
        title: "Agrega el script de captura de leads",
        description: "Inmediatamente después del script anterior, pega el código de captura. Ajusta los selectores según los campos de tu formulario de contacto:",
        blocks: [{ label: "Script de captura — theme.liquid", code: `<script>\n${captureScript}\n</script>` }],
        notes: [
          "Los selectores [name='contact[name]'], [name='contact[email]'], etc. son los que usa el formulario estándar de Shopify.",
          "Si usas una app de formularios (Klaviyo, Omnisend…), consulta su documentación para el evento de submit.",
        ],
      },
      {
        title: "Registra ventas automáticamente",
        description: "En Shopify ve a Configuración → Pago → Scripts adicionales y pega esto. Se ejecuta solo en la página de confirmación del pedido y registra la venta en SyncLead:",
        blocks: [{ label: "Settings → Checkout → Additional scripts", code: purchaseScript }],
        notes: [
          "checkout.total_price está en centavos — el script lo convierte a número automáticamente.",
          "Si el comprador ya existía como lead, la venta se asocia a él. Si es nuevo, SyncLead crea el registro.",
        ],
        isPurchase: true,
      },
      {
        title: "Guarda y prueba",
        description: "Haz clic en Guardar. Abre tu tienda, llena el formulario de prueba y verifica que el lead aparezca en SyncLead.",
      },
    ]
  }

  if (platform === "wordpress") {
    return [
      {
        title: "Instala el plugin WPCode",
        description: "WPCode (gratuito) permite agregar scripts sin editar código PHP. En tu panel de WordPress:",
        notes: [
          "Ve a Plugins → Agregar nuevo → busca WPCode",
          "Instala y activa el plugin",
          'Alternativa: usa "Insert Headers and Footers" o pega directamente en functions.php',
        ],
      },
      {
        title: "Agrega el script de instalación",
        description: "En WPCode → + Agregar snippet → HTML Snippet:",
        blocks: [{ label: "Snippet HTML — Footer (en todas las páginas)", code: installScript }],
        notes: [
          'Selecciona ubicación: "Footer" y activa "Run everywhere".',
          "Guarda y activa el snippet.",
        ],
      },
      {
        title: "Agrega el script de captura de leads",
        description: "Crea un segundo snippet HTML en WPCode con el código de captura:",
        blocks: [{ label: "Snippet HTML — captura del lead", code: `<script>\n${captureScript}\n</script>` }],
        notes: [
          "Para Contact Form 7: los nombres de campo (your-name, your-email, your-phone) deben coincidir con los de tu formulario.",
          "Para WPForms o Gravity Forms: cambia la lógica al evento submit del formulario correspondiente.",
        ],
      },
      {
        title: "Registra ventas de WooCommerce",
        description: "Crea un nuevo snippet en WPCode de tipo PHP Snippet con condición de visibilidad 'WooCommerce Thank You Page'. Esto registra automáticamente cada venta completada:",
        blocks: [{ label: "WPCode — PHP Snippet (Thank You page)", code: purchaseScript }],
        notes: [
          "Requiere WooCommerce activo. El hook woocommerce_thankyou se dispara solo en la página de confirmación de pedido.",
          "Si el comprador ya era un lead en SyncLead, la venta queda asociada a su registro.",
        ],
        isPurchase: true,
      },
      {
        title: "Prueba el formulario",
        description: "Llena el formulario en tu sitio y verifica que el lead aparezca en SyncLead con los datos correctos.",
      },
    ]
  }

  if (platform === "nextjs") {
    const layoutCode = `// app/layout.tsx
import Script from "next/script"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}

        {/* SyncLead — configuración */}
        <Script id="sl-config" strategy="beforeInteractive">
          {\`${configCode}\`}
        </Script>
        <Script src="${appUrl}/sl.js" strategy="afterInteractive" />
      </body>
    </html>
  )
}`

    return [
      {
        title: "Agrega los scripts en layout.tsx",
        description: "Abre app/layout.tsx (App Router) o pages/_app.tsx (Pages Router) y agrega los scripts de SyncLead:",
        blocks: [{ label: "app/layout.tsx", filename: "app/layout.tsx", code: layoutCode }],
        notes: [
          'strategy="beforeInteractive" asegura que la config esté disponible antes de que sl.js ejecute.',
          'strategy="afterInteractive" carga sl.js después del hydration sin bloquear el render.',
        ],
      },
      {
        title: "Captura el lead en tu formulario",
        description: "En el componente donde tienes el formulario de contacto o checkout:",
        blocks: [{ label: "FormularioContacto.tsx", filename: "components/FormularioContacto.tsx", code: captureScript }],
      },
      {
        title: "Registra ventas en la página de confirmación",
        description: "En tu página o componente de 'Pedido confirmado', usa el hook useRegisterPurchase para enviar la venta a SyncLead:",
        blocks: [{ label: "OrderConfirmation.tsx", filename: "components/OrderConfirmation.tsx", code: purchaseScript }],
        notes: [
          "El useEffect garantiza que la llamada ocurre una sola vez por order.id (dep array).",
          "SyncLead.purchase() busca el lead por email. Si no lo encuentra, crea uno nuevo.",
        ],
        isPurchase: true,
      },
      {
        title: "Prueba en desarrollo",
        description: "Corre npm run dev, llena el formulario y verifica en la consola que SyncLead.capture() responde con { success: true, leadId: '...' }.",
      },
    ]
  }

  // html genérico
  return [
    {
      title: "Pega el script de instalación en el <head>",
      description: "Abre el HTML de tu página y pega esto dentro de <head> (o antes de </body>):",
      blocks: [{ label: "HTML — <head> o antes de </body>", code: installScript }],
    },
    {
      title: "Agrega el script de captura de leads",
      description: "Justo después del script anterior (o en un archivo .js separado), pega el código de captura. Ajusta los IDs de los campos de tu formulario:",
      blocks: [{ label: "Script de captura", code: `<script>\n${captureScript}\n</script>` }],
    },
    {
      title: "Registra ventas en la página de confirmación",
      description: "En tu página de 'Gracias por tu compra' o confirmación de pedido, pega el script de venta con los datos reales del pedido:",
      blocks: [{ label: "Página de confirmación de pedido", code: purchaseScript }],
      notes: [
        "Reemplaza los valores de ejemplo con los datos reales que tu sistema genera para cada pedido.",
        "El campo order_id evita registrar la misma venta dos veces si el usuario recarga la página.",
      ],
      isPurchase: true,
    },
    {
      title: "Prueba en tu navegador",
      description: "Abre la página, llena el formulario y revisa la consola del navegador (F12 → Console). Deberías ver el leadId devuelto por SyncLead. Confirma también que el lead aparece en tu panel.",
    },
  ]
}

// ─── Platform cards data ──────────────────────────────────────────────────────

const PLATFORMS: { id: PlatformId; name: string; logo: string; description: string; badge?: string }[] = [
  {
    id: "gtm",
    name: "Google Tag Manager",
    logo: "📦",
    description: "Sin tocar código — gestión centralizada",
    badge: "Recomendado",
  },
  {
    id: "shopify",
    name: "Shopify",
    logo: "🛍️",
    description: "Instalación en theme.liquid",
  },
  {
    id: "wordpress",
    name: "WordPress",
    logo: "🔵",
    description: "Vía WPCode o functions.php",
  },
  {
    id: "nextjs",
    name: "Next.js",
    logo: "▲",
    description: "Con next/script en layout.tsx",
  },
  {
    id: "html",
    name: "HTML / Otro",
    logo: "</>",
    description: "Cualquier web con HTML plano",
  },
]

// ─── CodeBlock with copy ──────────────────────────────────────────────────────

function CodeBlockView({ block }: { block: CodeBlock }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(block.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ops-tx3 font-mono">{block.filename ?? block.label}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-ops-s2 text-ops-tx2 hover:text-ops-tx hover:bg-ops-sel transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-ops-green" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <div className="rounded-lg border border-ops-bd bg-ops-bg overflow-hidden">
        <pre className="p-3 text-xs text-ops-tx font-mono overflow-x-auto leading-relaxed whitespace-pre">
          {block.code}
        </pre>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  config: ScriptConfig
  appUrl: string
  onBack: () => void
}

export function PlatformSnippetStep({ config, appUrl, onBack }: Props) {
  const [platform, setPlatform] = useState<PlatformId | null>(null)
  const [withPurchase, setWithPurchase] = useState(false)

  if (!platform) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-ops-tx3 hover:text-ops-tx transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {config.mode === "multi" ? "Cambiar selección o UTMs" : "Volver"}
        </button>

        <div>
          <p className="text-sm font-medium text-ops-tx mb-1">¿Para qué plataforma necesitas el script?</p>
          <p className="text-xs text-ops-tx3">Te generamos el código exacto y la guía de instalación paso a paso.</p>
        </div>

        <div className="space-y-2">
          {/* GTM — full width card */}
          {PLATFORMS.filter((p) => p.badge).map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className="w-full flex items-center gap-3 p-4 rounded-lg border border-ops-blue/30 bg-ops-blue/5 hover:border-ops-blue/60 hover:bg-ops-blue/10 transition-colors text-left group"
            >
              <span className="text-2xl w-8 text-center flex-shrink-0 font-mono leading-none">{p.logo}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-ops-tx group-hover:text-ops-blue-t transition-colors">{p.name}</p>
                  <span className="inline-flex h-4 items-center rounded px-1.5 text-[10px] font-semibold bg-ops-blue text-ops-bg">{p.badge}</span>
                </div>
                <p className="text-xs text-ops-tx3 mt-0.5">{p.description}</p>
              </div>
            </button>
          ))}
          {/* Other platforms — 2-col grid */}
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.filter((p) => !p.badge).map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className="flex items-center gap-3 p-4 rounded-lg border border-ops-line bg-ops-s1 hover:border-ops-blue/50 hover:bg-ops-blue/10 transition-colors text-left group"
              >
                <span className="text-2xl w-8 text-center flex-shrink-0 font-mono leading-none">{p.logo}</span>
                <div>
                  <p className="text-sm font-medium text-ops-tx group-hover:text-ops-blue-t transition-colors">{p.name}</p>
                  <p className="text-xs text-ops-tx3 mt-0.5">{p.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const platformInfo = PLATFORMS.find((p) => p.id === platform)!
  const allSteps = getSteps(platform, config, appUrl)
  // GTM always shows all steps (purchase steps are informational, not inline code)
  const visibleSteps = platform === "gtm"
    ? allSteps.filter((s) => !s.isPurchase || withPurchase)
    : allSteps.filter((s) => !s.isPurchase || withPurchase)

  return (
    <div className="space-y-5">
      {/* Header with back */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlatform(null)}
          className="flex items-center gap-1 text-xs text-ops-tx3 hover:text-ops-tx transition-colors flex-shrink-0"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Plataformas
        </button>
        <span className="text-ops-tx3 text-xs">·</span>
        <span className="text-xs font-medium text-ops-tx">
          {platformInfo.logo} {platformInfo.name}
        </span>
      </div>

      {/* Toggle: tracking de ventas */}
      <button
        onClick={() => setWithPurchase((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
          withPurchase
            ? "border-ops-green/40 bg-ops-green/10"
            : "border-ops-bd bg-ops-s1 hover:border-ops-bd2"
        }`}
      >
        {/* Toggle pill */}
        <div className={`relative flex-shrink-0 h-5 w-9 rounded-full transition-colors ${withPurchase ? "bg-ops-green" : "bg-ops-sel"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${withPurchase ? "translate-x-4" : "translate-x-0.5"}`} />
        </div>
        <ShoppingCart className={`h-3.5 w-3.5 flex-shrink-0 ${withPurchase ? "text-ops-green" : "text-ops-tx3"}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${withPurchase ? "text-ops-green" : "text-ops-tx2"}`}>
            Incluir tracking de ventas
          </p>
          <p className="text-xs text-ops-tx3 leading-tight">
            {withPurchase
              ? "Se incluye el código para registrar compras en la página de confirmación"
              : "Actívalo si tu sitio tiene checkout o tienda (Shopify, WooCommerce, etc.)"}
          </p>
        </div>
      </button>

      {/* Steps */}
      <div className="space-y-5">
        {visibleSteps.map((step, i) => (
          <div key={i} className="space-y-2">
            {/* Step number + title */}
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-ops-blue text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div className="space-y-1 flex-1 min-w-0">
                <p className="text-sm font-medium text-ops-tx">{step.title}</p>
                {step.description && (
                  <p className="text-xs text-ops-tx2">{step.description}</p>
                )}
              </div>
            </div>

            {/* Code blocks */}
            {step.blocks && step.blocks.length > 0 && (
              <div className="ml-8 space-y-2">
                {step.blocks.map((block, j) => (
                  <CodeBlockView key={j} block={block} />
                ))}
              </div>
            )}

            {/* Notes */}
            {step.notes && step.notes.length > 0 && (
              <ul className="ml-8 space-y-1">
                {step.notes.map((note, j) => (
                  <li key={j} className="text-xs text-ops-tx3 flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 rounded-full bg-ops-bd2 flex-shrink-0" />
                    <span dangerouslySetInnerHTML={{ __html: note }} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Footer tips */}
      <div className="rounded-lg border border-ops-line bg-ops-s1/50 p-3 text-xs text-ops-tx3 space-y-2">
        <p>Los UTMs y el fbclid de Meta se capturan automáticamente al cargar cualquier página.</p>
        <p><code className="text-ops-blue-t bg-ops-blue/10 px-1 rounded">SyncLead.capture()</code> registra el lead · <code className="text-ops-green bg-ops-green/10 px-1 rounded">SyncLead.purchase()</code> registra la venta y dispara el evento CAPI a Meta.</p>
        <p className="border-t border-ops-line pt-2">
          Para ver el <span className="text-ops-tx2 font-medium">conjunto de anuncios y anuncio</span> de cada lead, agrega estos parámetros en la URL de destino de tus anuncios en Meta Ads Manager:
          <br />
          <code className="text-ops-blue-t bg-ops-blue/10 px-1 rounded mt-1 inline-block">adset_name={"{{"}adset.name{"}}"}&amp;ad_name={"{{"}ad.name{"}}"}</code>
        </p>
      </div>
    </div>
  )
}
