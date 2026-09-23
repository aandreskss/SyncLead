"use client"

import { useState, useTransition } from "react"
import { getOrCreateSiteCollectTokenAction } from "@/domains/tracking/actions"
import { Copy, CheckCircle2, Code2, Shield, Zap, AlertCircle, Loader2, Globe } from "lucide-react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.synclead.io"

function CopyBtn({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded border border-ops-bd bg-ops-s2 px-2.5 py-1.5 text-xs text-ops-tx2 hover:bg-ops-sel transition-colors shrink-0"
    >
      {copied ? (
        <><CheckCircle2 className="h-3.5 w-3.5 text-ops-green" />Copiado</>
      ) : (
        <><Copy className="h-3.5 w-3.5" />{label}</>
      )}
    </button>
  )
}

const PIXEL_SCRIPT_TAG = `<script src="${APP_URL}/pixel.js" data-token="pub_xxxx..." async></script>`
const CSP_SNIPPET = `script-src ${APP_URL};
connect-src ${APP_URL};`
const API_EXAMPLES = `// Captura un lead manualmente (p. ej. al enviar un formulario)
window.SyncLead.lead({
  name: "Ana García",
  email: "ana@email.com",
  phone: "+5804121234567",
});

// Registra una compra (evento de comportamiento)
window.SyncLead.purchase({
  value: 99.90,
  currency: "USD",
  externalId: "order_123",
});

// Evento personalizado (add_to_cart, begin_checkout, etc.)
window.SyncLead.event("begin_checkout", {
  value: 49.00,
  currency: "USD",
});`

function UniversalPixelCard() {
  return (
    <div className="rounded-lg border border-indigo-800/40 bg-indigo-950/20 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-800/30">
        <Globe className="h-4 w-4 text-indigo-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ops-tx">Pixel Universal (recomendado)</p>
          <p className="text-xs text-ops-tx3">Un solo script para tracking, leads y eventos de comportamiento</p>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Step 1 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ops-tx2 flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shrink-0">1</span>
            Agrega el script en el <code className="text-ops-tx">&lt;head&gt;</code> de tu sitio
          </p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 rounded bg-ops-bg border border-ops-line p-3 text-xs text-indigo-300 font-mono overflow-x-auto whitespace-pre select-all">
              {PIXEL_SCRIPT_TAG}
            </pre>
            <CopyBtn text={PIXEL_SCRIPT_TAG} />
          </div>
          <div className="rounded border border-ops-bd bg-ops-s2 px-3 py-2 text-xs text-ops-tx3 space-y-1">
            <p>
              <span className="text-ops-tx2 font-medium">¿Dónde obtengo el token?</span>{" "}
              Ve a <span className="text-ops-tx2">Campañas → [tu campaña] → Credenciales de ingesta</span> y copia el token{" "}
              <code className="text-ops-tx2">pub_xxx</code>. Se muestra una sola vez al crearlo.
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ops-tx2 flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shrink-0">2</span>
            Permite el dominio de SyncLead en tu CSP <span className="text-ops-tx3">(solo si usas Content-Security-Policy)</span>
          </p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 rounded bg-ops-bg border border-ops-line p-3 text-xs text-emerald-400 font-mono overflow-x-auto whitespace-pre select-all">
              {CSP_SNIPPET}
            </pre>
            <CopyBtn text={CSP_SNIPPET} />
          </div>
        </div>

        {/* What it does */}
        <div>
          <p className="text-xs font-medium text-ops-tx3 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />Incluye automáticamente
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ["PageView automático", "Registra cada visita con país, UTMs y referrer"],
              ["Captura first-touch", "UTMs + fbclid en el primer clic del visitante"],
              ["Ping de sesión c/30s", "Mide tiempo real en página para análisis de calidad"],
              ["Auto-captura de forms", "Detecta email/teléfono en formularios al enviarlos"],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-start gap-1.5 rounded border border-ops-bd bg-ops-s2 p-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-px" />
                <div>
                  <p className="text-xs text-ops-tx2 font-medium leading-tight">{title}</p>
                  <p className="text-xs text-ops-tx3 leading-tight mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step 3 — API */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ops-tx2 flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shrink-0">3</span>
            API disponible (opcional)
          </p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 rounded bg-ops-bg border border-ops-line p-3 text-xs text-ops-tx2 font-mono overflow-x-auto whitespace-pre select-all leading-relaxed">
              {API_EXAMPLES}
            </pre>
            <CopyBtn text={API_EXAMPLES} />
          </div>
        </div>
      </div>
    </div>
  )
}

interface SiteEntry {
  id: string
  name: string
  domain: string
  collectToken: string | null
}

function buildScript(token: string): string {
  const collector = `${APP_URL}/api/collect/${token}`
  return `<!-- Script SyncLead — colocar antes del cierre </body> -->
<script>
(function() {
  var collector = "${collector}";
  function getCookie(name) {
    var c = document.cookie.split('; ').find(function(r) { return r.indexOf(name + '=') === 0; });
    return c ? c.slice(name.length + 1) : undefined;
  }
  function getVisitorId() {
    var k = '_sl_vid', v = localStorage.getItem(k);
    if (!v) { v = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2,9); localStorage.setItem(k,v); }
    return v;
  }
  (function() {
    var p = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(function(k) {
      var v = p.get(k); if (v && !localStorage.getItem('_sl_'+k)) localStorage.setItem('_sl_'+k,v);
    });
    var fbclid = p.get('fbclid');
    if (fbclid && !getCookie('_fbc') && !localStorage.getItem('_sl_fbc')) {
      localStorage.setItem('_sl_fbc', 'fb.1.' + Date.now() + '.' + fbclid);
    }
  })();
  function sendToDiagnostic(eventName, params) {
    var payload = {
      eventName: eventName, pageUrl: window.location.href, environment: "production",
      parameters: params || {},
      visitorId: getVisitorId(),
      utmSource: localStorage.getItem('_sl_utm_source') || undefined,
      utmMedium: localStorage.getItem('_sl_utm_medium') || undefined,
      utmCampaign: localStorage.getItem('_sl_utm_campaign') || undefined,
      referrer: document.referrer || undefined,
      fbc: getCookie('_fbc') || localStorage.getItem('_sl_fbc') || undefined,
      fbp: getCookie('_fbp') || undefined,
    };
    fetch(collector, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  }
  window.__synclead_collect = sendToDiagnostic;
  setInterval(function() { sendToDiagnostic('session_ping', {}); }, 30000);
  sendToDiagnostic('PageView', {});
})();
</script>`
}

function SiteScriptCard({ site }: { site: SiteEntry }) {
  const [token, setToken] = useState<string | null>(site.collectToken)
  const [copied, setCopied] = useState(false)
  const [isPending, start] = useTransition()
  const [err, setErr] = useState("")

  const script = token ? buildScript(token) : null

  function handleGenerate() {
    setErr("")
    start(async () => {
      const r = await getOrCreateSiteCollectTokenAction(site.id)
      if (r.error) { setErr(r.error); return }
      if (r.token) setToken(r.token)
    })
  }

  function handleCopy() {
    if (!script) return
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ops-line">
        <Code2 className="h-4 w-4 text-ops-tx2 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ops-tx truncate">{site.name}</p>
          <p className="text-xs text-ops-tx3 font-mono truncate">{site.domain}</p>
        </div>
        {token && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded border border-ops-bd bg-ops-s2 px-2.5 py-1.5 text-xs text-ops-tx2 hover:bg-ops-sel transition-colors shrink-0"
          >
            {copied ? (
              <><CheckCircle2 className="h-3.5 w-3.5 text-ops-green" />Copiado</>
            ) : (
              <><Copy className="h-3.5 w-3.5" />Copiar script</>
            )}
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {token ? (
          <pre className="rounded bg-ops-bg border border-ops-line p-3 text-xs text-ops-tx2 font-mono overflow-x-auto whitespace-pre-wrap break-all select-all max-h-40 overflow-y-auto">
            {script}
          </pre>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ops-tx3">Este sitio aún no tiene un token de colección permanente.</p>
            {err && (
              <p className="text-xs text-ops-coral flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />{err}
              </p>
            )}
            <button
              onClick={handleGenerate}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-ops-blue hover:bg-ops-blue/90 text-white transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {isPending ? "Generando…" : "Generar token permanente"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  sites: SiteEntry[]
}

export function ScriptInstallPanel({ sites }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-ops-tx">Script de instalación</h3>
        <p className="text-xs text-ops-tx3 mt-0.5">
          Instala SyncLead en el sitio del cliente para rastrear visitantes, capturar leads y enviar eventos de comportamiento.
        </p>
      </div>

      <UniversalPixelCard />

      {sites.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-ops-tx3 uppercase tracking-wider">Script por sitio (Diagnóstico)</p>
            <p className="text-xs text-ops-tx3 mt-0.5">Solo tracking de eventos para el módulo de diagnóstico de conversiones.</p>
          </div>
          {sites.map((site) => (
            <SiteScriptCard key={site.id} site={site} />
          ))}
        </div>
      )}
    </div>
  )
}
