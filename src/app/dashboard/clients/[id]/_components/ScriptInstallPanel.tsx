"use client"

import { useState, useTransition } from "react"
import { getOrCreateSiteCollectTokenAction } from "@/domains/tracking/actions"
import { Copy, CheckCircle2, Code2, Shield, Zap, AlertCircle, Loader2 } from "lucide-react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.synclead.com"

function buildScript(token: string): string {
  const collector = `${APP_URL}/api/collect/${token}`
  return `<!-- Script SyncLead — colocar antes del cierre </body> -->
<!-- Token permanente — no expira. Registra visitantes, fuente de tráfico y eventos del pixel en tiempo real. -->
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
  // Captura UTMs y fbclid en el primer clic (first-touch)
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
    var boolParams = {};
    if (params && typeof params === "object") {
      Object.keys(params).forEach(function(k) { boolParams[k] = true; });
    }
    var payload = {
      eventName: eventName,
      pageUrl: window.location.href,
      environment: "production",
      parameters: boolParams,
      visitorId: getVisitorId(),
      utmSource: localStorage.getItem('_sl_utm_source') || undefined,
      utmMedium: localStorage.getItem('_sl_utm_medium') || undefined,
      utmCampaign: localStorage.getItem('_sl_utm_campaign') || undefined,
      referrer: document.referrer || undefined,
      fbc: getCookie('_fbc') || localStorage.getItem('_sl_fbc') || undefined,
      fbp: getCookie('_fbp') || undefined,
    };
    fetch(collector, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  window.__synclead_collect = sendToDiagnostic;

  // Ping cada 30s — mide tiempo real en página
  setInterval(function() { sendToDiagnostic('session_ping', {}); }, 30000);

  function wrapFbq(original) {
    if (original && original._synclead_wrapped) return original;
    var wrapper = function() {
      var args = Array.prototype.slice.call(arguments);
      if (args[0] === "track" || args[0] === "trackCustom") {
        sendToDiagnostic(args[1], args[2] || {});
      }
      if (typeof wrapper.callMethod === "function") {
        return wrapper.callMethod.apply(wrapper, args);
      }
      return original.apply(this, arguments);
    };
    try {
      var skip = { length: 1, name: 1, prototype: 1, caller: 1, arguments: 1 };
      Object.getOwnPropertyNames(original).forEach(function(key) {
        if (skip[key]) return;
        Object.defineProperty(wrapper, key, {
          get: function() { return original[key]; },
          set: function(v) { original[key] = v; },
          configurable: true,
          enumerable: true
        });
      });
    } catch(e) {}
    wrapper._synclead_wrapped = true;
    return wrapper;
  }

  if (typeof window.fbq === "function") {
    window.fbq = wrapFbq(window.fbq);
    try { if (window._fbq !== window.fbq) window._fbq = window.fbq; } catch(e) {}
  } else {
    Object.defineProperty(window, "fbq", {
      configurable: true,
      set: function(val) {
        var wrapped = typeof val === "function" ? wrapFbq(val) : val;
        Object.defineProperty(window, "fbq", {
          configurable: true, writable: true,
          value: wrapped
        });
        try { if (window._fbq !== window.fbq) window._fbq = window.fbq; } catch(e) {}
      }
    });
  }

  // PageView automático — registra todo visitante (orgánico, directo, paid) con país y fuente
  sendToDiagnostic('PageView', {});
})();
</script>`
}

const FIXES = [
  {
    label: "Rastreo de visitantes",
    detail: "Genera un visitorId persistente por navegador — activa la sección Visitantes en SyncLead",
  },
  {
    label: "Atribución de tráfico",
    detail: "Captura UTMs, referrer y fbclid en el primer clic; los asocia a todas las conversiones futuras",
  },
  {
    label: "Sin conflicto con fbevents.js",
    detail: "Getters/setters en vivo — fbevents.js siempre ve queue, version y loaded correctos",
  },
  {
    label: "Sin warning de pixel duplicado",
    detail: "window._fbq sincronizado con el wrapper — fbevents.js los ve como un solo pixel",
  },
]

interface SiteEntry {
  id: string
  name: string
  domain: string
  collectToken: string | null
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
      {/* Header */}
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

      <div className="p-4 space-y-4">
        {/* Fixes checklist */}
        <div>
          <p className="text-xs font-medium text-ops-tx3 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Fixes aplicados
          </p>
          <div className="space-y-1.5">
            {FIXES.map((fix) => (
              <div key={fix.label} className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-px" />
                <div>
                  <span className="text-xs text-ops-tx2">{fix.label}</span>
                  <span className="text-xs text-ops-tx3 ml-1.5">{fix.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Script block or generate button */}
        {token ? (
          <div>
            <p className="text-xs font-medium text-ops-tx3 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-ops-amber" />
              Script — pegar antes del cierre{" "}
              <code className="text-ops-tx2">&lt;/body&gt;</code>
            </p>
            <pre className="rounded bg-ops-bg border border-ops-line p-3 text-xs text-ops-tx2 font-mono overflow-x-auto whitespace-pre-wrap break-all select-all max-h-48 overflow-y-auto">
              {script}
            </pre>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ops-tx3">
              Este sitio aún no tiene un token de colección permanente.
            </p>
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
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-ops-tx">Script de instalación</h3>
        <p className="text-xs text-ops-tx3 mt-0.5">
          Pegar este script en el sitio web del cliente para que SyncLead reciba todos los eventos del pixel en tiempo real. El token es permanente — no expira.
        </p>
      </div>

      {sites.length === 0 ? (
        <div className="rounded-lg border border-ops-line bg-ops-s1 px-4 py-6 text-center">
          <Code2 className="h-6 w-6 text-ops-tx3 mx-auto mb-2" />
          <p className="text-sm text-ops-tx3">No hay sitios de seguimiento configurados.</p>
          <p className="text-xs text-ops-tx3 mt-1">
            Crea un sitio en la tab <span className="text-ops-tx2">Diagnóstico</span> primero.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => (
            <SiteScriptCard key={site.id} site={site} />
          ))}
        </div>
      )}
    </div>
  )
}
