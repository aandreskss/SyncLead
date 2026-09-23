"use client"

import { useState, useEffect } from "react"
import type { ConversionDefinitionPublic } from "@/domains/tracking/types"
import { getOrCreateSiteCollectTokenAction } from "@/domains/tracking/actions"
import { X, Copy, CheckCircle2 } from "lucide-react"

type Props = {
  definition: ConversionDefinitionPublic
  onClose: () => void
  siteId?: string | null
}

type TabKey = "synclead" | "javascript" | "gtm" | "nextjs" | "capi"

const TAB_LABELS: Record<TabKey, string> = {
  synclead: "SyncLead Pixel",
  javascript: "JavaScript (fbq)",
  gtm: "Google Tag Manager",
  nextjs: "Next.js / React",
  capi: "Meta CAPI (servidor)",
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded border border-ops-bd bg-ops-sel px-2.5 py-1 text-xs text-ops-tx2 hover:bg-zinc-600 transition-colors"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copiar código
        </>
      )}
    </button>
  )
}

function buildTriggerComment(triggerType: string, eventName: string): string {
  switch (triggerType) {
    case "form_submit":
      return `// Llamar cuando el formulario se envíe exitosamente (NO al hacer clic en submit)`
    case "element_click":
      return `// Llamar cuando el usuario haga clic en el elemento objetivo`
    case "page_load":
      return `// Llamar al cargar la página (normalmente en DOMContentLoaded)`
    case "explicit_callback":
      return `// Llamar en el callback de éxito de la operación (NO antes de confirmar)`
    case "ecommerce_event":
      return `// Llamar después de confirmar la transacción en el servidor`
    default:
      return `// Llamar cuando ocurra el evento ${eventName}`
  }
}

function buildEventIdHelper(internalKey: string): string {
  return `function generateEventId() {
  return '${internalKey}_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}`
}

function buildSyncLeadSnippet(def: ConversionDefinitionPublic, token?: string | null): string {
  const paramsObj = def.requiredParameters.length > 0
    ? def.requiredParameters.map((p) => `      ${p}: true`).join(",\n")
    : "      // sin parámetros requeridos"

  const triggerComment = buildTriggerComment(def.triggerType, def.internalKey)

  return `// ── 1. Helper SyncLead — pega esto UNA VEZ en tu sitio (p. ej. en <head>) ──
(function () {
  function getVisitorId() {
    var k = '_sl_vid', v = localStorage.getItem(k);
    if (!v) { v = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2,9); localStorage.setItem(k,v); }
    return v;
  }
  function getCookie(name) {
    var c = document.cookie.split('; ').find(function(r) { return r.indexOf(name + '=') === 0; });
    return c ? c.slice(name.length + 1) : null;
  }
  // Captura UTMs y fbclid en el primer clic (first-touch)
  (function () {
    var p = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(function(k) {
      var v = p.get(k); if (v && !localStorage.getItem('_sl_'+k)) localStorage.setItem('_sl_'+k,v);
    });
    // Si hay fbclid y no hay _fbc del Meta Pixel, construimos uno propio
    var fbclid = p.get('fbclid');
    if (fbclid && !getCookie('_fbc') && !localStorage.getItem('_sl_fbc')) {
      localStorage.setItem('_sl_fbc', 'fb.1.' + Date.now() + '.' + fbclid);
    }
  })();
  window.slTrack = function (eventName, params, token) {
    navigator.sendBeacon(
      'https://app.synclead.io/api/collect/' + token,
      new Blob([JSON.stringify({
        eventName: eventName,
        pageUrl: location.href,
        visitorId: getVisitorId(),
        utmSource: localStorage.getItem('_sl_utm_source'),
        utmMedium: localStorage.getItem('_sl_utm_medium'),
        utmCampaign: localStorage.getItem('_sl_utm_campaign'),
        referrer: document.referrer || null,
        fbc: getCookie('_fbc') || localStorage.getItem('_sl_fbc') || undefined,
        fbp: getCookie('_fbp') || undefined,
        parameters: params || {},
      })], { type: 'application/json' })
    );
  };
})();

// ── 2. Dispara el evento "${def.internalKey}" ──────────────────────────────
var SYNCLEAD_TOKEN = '${token ?? "TU_TOKEN_AQUI"}';

${triggerComment}
window.slTrack('${def.internalKey}', {
${paramsObj}
}, SYNCLEAD_TOKEN);`
}

function buildJsSnippet(def: ConversionDefinitionPublic): string {
  const triggerComment = buildTriggerComment(def.triggerType, def.providerEventName)
  const helper = buildEventIdHelper(def.internalKey)

  if (def.triggerType === "form_submit") {
    return `${triggerComment}
document.getElementById('mi-formulario').addEventListener('submit', function(e) {
  e.preventDefault();
  // ... tu lógica de submit
  fetch('/api/mi-form', {
    method: 'POST',
    body: new FormData(e.target)
  }).then(function(res) {
    if (res.ok) {
      fbq('track', '${def.providerEventName}', {}, { eventID: generateEventId() });
    }
  });
});

${helper}`
  }

  if (def.triggerType === "page_load") {
    return `${triggerComment}
document.addEventListener('DOMContentLoaded', function() {
  fbq('track', '${def.providerEventName}');
});`
  }

  return `${triggerComment}
function on${def.internalKey.replace(/_/g, "")}Success() {
  var eventId = generateEventId();
  fbq('track', '${def.providerEventName}', {}, { eventID: eventId });
}

${helper}`
}

function buildGtmSnippet(def: ConversionDefinitionPublic): string {
  const triggerComment = buildTriggerComment(def.triggerType, def.providerEventName)
  const helper = buildEventIdHelper(def.internalKey)

  return `<script>
${triggerComment}
// Colocar en un Custom HTML Tag de GTM.
// Trigger: ${def.triggerType === "form_submit" ? "Form Submission" : def.triggerType === "page_load" ? "Page View" : "Custom Event o Click"}

(function() {
  ${helper}

  var eventId = generateEventId();
  fbq('track', '${def.providerEventName}', {}, { eventID: eventId });

  // Push al dataLayer para confirmar el disparo
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'conversion_fired',
    conversion_name: '${def.internalKey}',
    event_id: eventId,
  });
})();
</script>`
}

function buildNextjsSnippet(def: ConversionDefinitionPublic): string {
  const triggerComment = buildTriggerComment(def.triggerType, def.providerEventName)

  if (def.triggerType === "page_load") {
    return `import { useEffect } from 'react';

${triggerComment}
export function ${def.internalKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase())}Page() {
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', '${def.providerEventName}');
    }
  }, []);

  return <div>{/* tu contenido */}</div>;
}`
  }

  return `import { useCallback } from 'react';

function generateEventId() {
  return '${def.internalKey}_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

${triggerComment}
export function use${def.internalKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase())}() {
  const track = useCallback(async () => {
    const eventId = generateEventId();

    // 1. Primero confirma la operación en tu servidor
    const res = await fetch('/api/tu-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    });

    if (!res.ok) return;

    // 2. Solo después disparar el pixel (cuando el servidor confirmó)
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', '${def.providerEventName}', {}, { eventID: eventId });
    }
  }, []);

  return { track };
}`
}

function buildCapiSnippet(def: ConversionDefinitionPublic): string {
  return `// Servidor — Node.js / Next.js API Route / Route Handler
// Variables de entorno necesarias:
//   META_PIXEL_ID=tu_pixel_id
//   META_ACCESS_TOKEN=tu_token_de_acceso (nunca en el frontend)

async function send${def.internalKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase())}Event({
  eventId,   // string — mismo eventID enviado por el Pixel
  userData,  // { email?, phone?, firstName?, lastName?, city? }
}) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION ?? 'v19.0';

  // Hashear PII con SHA-256 (nunca enviar en texto plano)
  const crypto = await import('node:crypto');
  function hashField(value) {
    return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  const userData_hashed = {};
  if (userData.email) userData_hashed.em = [hashField(userData.email)];
  if (userData.phone) userData_hashed.ph = [hashField(userData.phone.replace(/\D/g, ''))];
  if (userData.firstName) userData_hashed.fn = [hashField(userData.firstName)];
  if (userData.lastName) userData_hashed.ln = [hashField(userData.lastName)];

  const payload = {
    data: [{
      event_name: '${def.providerEventName}',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      user_data: userData_hashed,
    }],
  };

  const res = await fetch(
    \`https://graph.facebook.com/\${apiVersion}/\${pixelId}/events?access_token=\${accessToken}\`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(\`Meta CAPI error: \${err?.error?.code ?? 'unknown'}\`);
  }

  return res.json();
}`
}

export function InstallationDrawer({ definition, onClose, siteId }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("synclead")
  const [siteToken, setSiteToken] = useState<string | null>(null)

  useEffect(() => {
    if (!siteId) return
    getOrCreateSiteCollectTokenAction(siteId).then((r) => {
      if (r.token) setSiteToken(r.token)
    })
  }, [siteId])

  const snippets: Record<TabKey, string> = {
    synclead: buildSyncLeadSnippet(definition, siteToken),
    javascript: buildJsSnippet(definition),
    gtm: buildGtmSnippet(definition),
    nextjs: buildNextjsSnippet(definition),
    capi: buildCapiSnippet(definition),
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-ops-line bg-ops-s1 ">
      <div className="flex items-center justify-between border-b border-ops-line px-6 py-4 shrink-0">
        <div>
          <h2 className="text-base font-semibold text-ops-tx">Cómo instalar</h2>
          <p className="text-sm text-ops-tx2 mt-0.5">
            {definition.displayName} — {definition.providerEventName}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-ops-tx2 hover:bg-ops-s2 hover:text-ops-tx transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex border-b border-ops-line shrink-0 overflow-x-auto">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab
                ? "border-b-2 border-zinc-400 text-ops-tx"
                : "text-ops-tx3 hover:text-ops-tx2"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {activeTab === "synclead" && (
          <div className="rounded border border-ops-blue/30 bg-ops-blue/10 px-4 py-3 text-sm text-ops-tx2">
            <strong className="text-ops-tx">SyncLead Pixel</strong> — este snippet envía cada evento
            directamente al colector de SyncLead con el ID del visitante y los UTMs capturados.
            Úsalo cuando quieras rastrear el recorrido completo del visitante (fuente → eventos → conversión).{" "}
            <span className="text-ops-tx3">
              Tu token de sitio está disponible en Diagnóstico → botón de código del sitio.
            </span>
          </div>
        )}
        {activeTab === "capi" && (
          <div className="rounded border border-orange-900 bg-orange-950 px-4 py-3 text-sm text-orange-300">
            <strong className="text-orange-200">Importante:</strong> El token de Meta (<code>META_ACCESS_TOKEN</code>)
            NUNCA debe estar en código del navegador. Usa variables de entorno del servidor.
            SyncLead ya gestiona CAPI automáticamente para eventos de venta — este snippet
            es para integraciones personalizadas.
          </div>
        )}

        {definition.installationNotes && (
          <div className="rounded border border-ops-bd bg-ops-s2 px-4 py-3 text-sm text-ops-tx2">
            <p className="font-medium text-ops-tx2 mb-1">Nota de instalación</p>
            <p>{definition.installationNotes}</p>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ops-tx2">{TAB_LABELS[activeTab]}</span>
            <CopyButton text={snippets[activeTab]} />
          </div>
          <pre className="overflow-x-auto rounded border border-ops-bd bg-ops-bg px-4 py-4 text-xs text-ops-tx2 whitespace-pre leading-relaxed">
            {snippets[activeTab]}
          </pre>
        </div>

        {definition.requiredParameters.length > 0 && (
          <div className="rounded border border-ops-bd bg-ops-s2 px-4 py-3">
            <p className="text-sm font-medium text-ops-tx2 mb-2">Parámetros requeridos</p>
            <ul className="space-y-1">
              {definition.requiredParameters.map((param) => (
                <li key={param} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0" />
                  <code className="text-ops-tx2">{param}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded border border-ops-bd bg-ops-s2 px-4 py-3 text-sm text-ops-tx2">
          <p className="font-medium text-ops-tx2 mb-1">Tipo de trigger</p>
          <p className="capitalize">{definition.triggerType.replace(/_/g, " ")}</p>
          {definition.expectedSource !== "browser" && (
            <p className="mt-1">
              Este evento requiere también implementación{" "}
              <strong className="text-ops-tx2">
                {definition.expectedSource === "both" ? "en servidor (CAPI)" : "en servidor"}
              </strong>{" "}
              para deduplicación.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
