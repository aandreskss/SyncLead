"use client"

import { useState } from "react"
import { Copy, Check, ChevronLeft } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScriptConfig =
  | { mode: "single"; apiKey: string; campaignName: string }
  | {
      mode: "multi"
      campaigns: Array<{ utmKey: string; apiKey: string; name: string }>
      defaultUtmKey: string
      organicKey?: string  // key de la campaña "Orgánico / Directo" — fallback absoluto
    }

type PlatformId = "shopify" | "wordpress" | "nextjs" | "html"

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

// ─── Per-platform step definitions ───────────────────────────────────────────

function getSteps(platform: PlatformId, config: ScriptConfig, appUrl: string): Step[] {
  const configCode = buildConfigBlock(config, appUrl)
  const installScript = `<script>\n  ${configCode}\n</script>\n<script src="${appUrl}/sl.js" defer></script>`
  const captureScript = captureExample(platform)

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
        title: "Agrega el script de captura",
        description: "Inmediatamente después del script anterior, pega el código de captura. Ajusta los selectores según los campos de tu formulario de contacto:",
        blocks: [{ label: "Script de captura — theme.liquid", code: `<script>\n${captureScript}\n</script>` }],
        notes: [
          "Los selectores [name='contact[name]'], [name='contact[email]'], etc. son los que usa el formulario estándar de Shopify.",
          "Si usas una app de formularios (Klaviyo, Omnisend…), consulta su documentación para el evento de submit.",
        ],
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
        title: "Agrega el script de captura",
        description: "Crea un segundo snippet HTML en WPCode con el código de captura:",
        blocks: [{ label: "Snippet HTML — captura del lead", code: `<script>\n${captureScript}\n</script>` }],
        notes: [
          "Para Contact Form 7: los nombres de campo (your-name, your-email, your-phone) deben coincidir con los de tu formulario. Revísalos en el editor del formulario.",
          "Para WPForms o Gravity Forms: cambia la lógica al evento submit del formulario correspondiente.",
        ],
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
      title: "Agrega el script de captura",
      description: "Justo después del script anterior (o en un archivo .js separado), pega el código de captura. Ajusta los IDs de los campos de tu formulario:",
      blocks: [{ label: "Script de captura", code: `<script>\n${captureScript}\n</script>` }],
    },
    {
      title: "Prueba en tu navegador",
      description: "Abre la página, llena el formulario y revisa la consola del navegador (F12 → Console). Deberías ver el leadId devuelto por SyncLead. Confirma también que el lead aparece en tu panel.",
    },
  ]
}

// ─── Platform cards data ──────────────────────────────────────────────────────

const PLATFORMS: { id: PlatformId; name: string; logo: string; description: string }[] = [
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
        <span className="text-xs text-zinc-500 font-mono">{block.filename ?? block.label}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <div className="rounded-lg border border-zinc-700 bg-zinc-950 overflow-hidden">
        <pre className="p-3 text-xs text-zinc-300 font-mono overflow-x-auto leading-relaxed whitespace-pre">
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

  if (!platform) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {config.mode === "multi" ? "Cambiar selección o UTMs" : "Volver"}
        </button>

        <div>
          <p className="text-sm font-medium text-zinc-200 mb-1">¿Para qué plataforma necesitas el script?</p>
          <p className="text-xs text-zinc-500">Te generamos el código exacto y la guía de instalación paso a paso.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className="flex items-center gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-colors text-left group"
            >
              <span className="text-2xl w-8 text-center flex-shrink-0 font-mono leading-none">
                {p.logo}
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-100 group-hover:text-indigo-300 transition-colors">
                  {p.name}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const platformInfo = PLATFORMS.find((p) => p.id === platform)!
  const steps = getSteps(platform, config, appUrl)

  return (
    <div className="space-y-5">
      {/* Header with back */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlatform(null)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Plataformas
        </button>
        <span className="text-zinc-700 text-xs">·</span>
        <span className="text-xs font-medium text-zinc-300">
          {platformInfo.logo} {platformInfo.name}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-5">
        {steps.map((step, i) => (
          <div key={i} className="space-y-2">
            {/* Step number + title */}
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div className="space-y-1 flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100">{step.title}</p>
                {step.description && (
                  <p className="text-xs text-zinc-400">{step.description}</p>
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
                  <li key={j} className="text-xs text-zinc-500 flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 rounded-full bg-zinc-600 flex-shrink-0" />
                    <span dangerouslySetInnerHTML={{ __html: note }} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Footer tip */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-500">
        Los UTMs y el fbclid de Meta se capturan automáticamente al cargar cualquier página. No necesitas configurar nada extra para el tracking de atribución.
      </div>
    </div>
  )
}
