"use client"

import { useState, useEffect, useCallback } from "react"
import type { ConversionDefinitionPublic, ConversionObservationPublic } from "@/domains/tracking/types"
import {
  startTestSessionAction,
  pollTestSessionAction,
  getOrCreateSiteCollectTokenAction,
} from "@/domains/tracking/actions"
import { Button } from "@/components/ui/button"
import { X, Copy, CheckCircle2, Loader2, AlertCircle, ExternalLink } from "lucide-react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.synclead.com"

type WizardStep = "select_url" | "start_session" | "instructions" | "waiting" | "result"

type Props = {
  definition: ConversionDefinitionPublic
  clientId: string
  onClose: () => void
  /** Optional — when provided, fetches a permanent site token for the script */
  siteId?: string | null
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
          Copiar
        </>
      )}
    </button>
  )
}

function buildDiagnosticScript(token: string, permanent = false): string {
  const collector = `${APP_URL}/api/collect/${token}`
  const tokenNote = permanent
    ? "// Token permanente — no expira. Instalar una vez; siempre reporta al Live Event Feed."
    : "// Token de sesión de prueba (válido 30 min) — solo para esta sesión de diagnóstico."
  return `// Script de diagnóstico SyncLead — colocar antes del cierre </body>
${tokenNote}
// Intercepta fbq('track') automáticamente. Solo reporta cuando la conversión real ocurre.
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

  // API manual: window.__synclead_collect("Purchase", { value: true, currency: true })
  window.__synclead_collect = sendToDiagnostic;

  // Intercepta fbq('track') / fbq('trackCustom') sin romper el pixel de Meta.
  //
  // Problema raíz (resuelto aquí):
  // fbevents.js asigna callMethod en window.fbq (nuestro wrapper), no en el stub
  // original. Si el wrapper llama original.apply(), el stub busca n.callMethod en
  // el original → undefined → los eventos caen en una cola muerta sin procesar.
  //
  // Fix v5: si wrapper.callMethod ya fue inicializado por fbevents.js, delegar
  // directamente a él en lugar de al original, para que los eventos se procesen.
  function wrapFbq(original) {
    if (original && original._synclead_wrapped) return original;
    var wrapper = function() {
      var args = Array.prototype.slice.call(arguments);
      if (args[0] === "track" || args[0] === "trackCustom") {
        sendToDiagnostic(args[1], args[2] || {});
      }
      // Una vez fbevents.js cargó, asigna callMethod en el wrapper (window.fbq).
      // Debemos delegar a wrapper.callMethod, no al stub original, o los eventos
      // no se procesarán (original.callMethod permanece undefined).
      if (typeof wrapper.callMethod === "function") {
        return wrapper.callMethod.apply(wrapper, args);
      }
      return original.apply(this, arguments);
    };
    // Delegar propiedades del stub al wrapper en vivo con getters/setters.
    // Esto evita que fbevents.js vea queue/version/loaded como undefined
    // y trate de reinicializar el pixel ("Multiple pixels" error).
    // Propiedades añadidas después (como callMethod) se escriben directo en wrapper.
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
    // El pixel base code hace window._fbq = stubFn (misma ref que fbq).
    // Después de wrappear fbq, _fbq sigue apuntando al stub original →
    // fbevents.js ve dos objetos distintos y lanza "Multiple pixels" warning.
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
        // Mantener _fbq en sync cuando el pixel base code cargue async
        try { if (window._fbq !== window.fbq) window._fbq = window.fbq; } catch(e) {}
      }
    });
  }

  // PageView automático — registra todo visitante (orgánico, directo, paid) con país y fuente
  sendToDiagnostic('PageView', {});
})();`
}

function ObservationResult({ observations }: { observations: ConversionObservationPublic[] }) {
  if (observations.length === 0) {
    return (
      <p className="text-sm text-ops-tx2">No se recibieron eventos en esta sesión.</p>
    )
  }

  return (
    <div className="space-y-3">
      {observations.map((obs) => (
        <div key={obs.id} className="rounded border border-ops-bd bg-ops-s2 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
            <span className="text-sm font-medium text-ops-tx">Evento recibido: {obs.eventName}</span>
          </div>
          {obs.pageUrl && (
            <p className="text-xs text-ops-tx2">URL: {obs.pageUrl}</p>
          )}
          <div className="space-y-1">
            {Object.entries(obs.validationResult).map(([param, result]) => (
              <div key={param} className="flex items-center gap-2 text-xs">
                {result === "present" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-ops-coral shrink-0" />
                )}
                <span className={result === "present" ? "text-ops-tx2" : "text-ops-coral"}>
                  {param}: {result === "present" ? "presente" : "faltante"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TestWizard({ definition, clientId, onClose, siteId }: Props) {
  const [step, setStep] = useState<WizardStep>("select_url")
  const [targetUrl, setTargetUrl] = useState("")
  const [urlError, setUrlError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [publicToken, setPublicToken] = useState("")
  // Permanent site token — fetched once on mount when siteId is provided
  const [siteToken, setSiteToken] = useState<string | null>(null)
  const [observations, setObservations] = useState<ConversionObservationPublic[]>([])
  const [sessionStatus, setSessionStatus] = useState<string>("")
  const [pollCount, setPollCount] = useState(0)

  // Fetch the permanent site collect token on mount so the script step can
  // show the non-expiring token instead of (or in addition to) the session token.
  useEffect(() => {
    if (!siteId) return
    getOrCreateSiteCollectTokenAction(siteId).then((r) => {
      if (r.token) setSiteToken(r.token)
    })
  }, [siteId])

  const MAX_POLLS = 60

  const pollSession = useCallback(async () => {
    if (!sessionId) return
    const result = await pollTestSessionAction(sessionId, clientId)
    if (result.error) return

    if (result.data) {
      const { session, observations: obs } = result.data
      setSessionStatus(session.status)
      setObservations(obs)

      if (obs.length > 0 || session.status === "completed" || session.status === "expired") {
        setStep("result")
      }
    }
  }, [sessionId, clientId])

  useEffect(() => {
    if (step !== "waiting") return

    const interval = setInterval(async () => {
      setPollCount((prev) => {
        if (prev >= MAX_POLLS) {
          clearInterval(interval)
          setStep("result")
          return prev
        }
        return prev + 1
      })
      await pollSession()
    }, 3000)

    return () => clearInterval(interval)
  }, [step, pollSession])

  function validateUrl(url: string): boolean {
    try {
      const u = new URL(url)
      if (!u.protocol.startsWith("http")) {
        setUrlError("Solo se permiten URLs http o https")
        return false
      }
      setUrlError("")
      return true
    } catch {
      setUrlError("URL inválida")
      return false
    }
  }

  async function handleStartSession() {
    if (!validateUrl(targetUrl)) return
    setIsLoading(true)
    setError("")

    const result = await startTestSessionAction({
      clientId,
      conversionDefinitionId: definition.id,
    })

    setIsLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (result.data) {
      setSessionId(result.data.id)
      setPublicToken(result.data.publicToken)
      setSessionStatus(result.data.status)
      setStep("instructions")
    }
  }

  // Prefer the permanent site token when available — it never expires.
  // Fall back to the session token while no permanent token exists yet.
  const scriptToken = siteToken ?? publicToken
  const diagnosticScript = scriptToken
    ? buildDiagnosticScript(scriptToken, !!siteToken)
    : ""

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-2xl rounded-lg border border-ops-line bg-ops-s1 ">
        <div className="flex items-center justify-between border-b border-ops-line px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ops-tx">Probar evento en vivo</h2>
            <p className="text-sm text-ops-tx2 mt-0.5">{definition.displayName} — {definition.providerEventName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-ops-tx2 hover:bg-ops-s2 hover:text-ops-tx transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs text-ops-tx3">
            {(["select_url", "start_session", "instructions", "waiting", "result"] as WizardStep[]).map((s, i) => {
              const stepIndex = ["select_url", "start_session", "instructions", "waiting", "result"].indexOf(step)
              const thisIndex = i
              return (
                <div key={s} className="flex items-center gap-2">
                  <span
                    className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-medium ${
                      thisIndex < stepIndex
                        ? "bg-green-700 text-white"
                        : thisIndex === stepIndex
                        ? "bg-zinc-600 text-ops-tx"
                        : "bg-ops-s2 text-ops-tx3"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {i < 4 && <span className="text-ops-tx3">—</span>}
                </div>
              )
            })}
          </div>

          {/* Step: select URL */}
          {(step === "select_url" || step === "start_session") && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ops-tx2 mb-1.5">
                  URL de la página donde probar
                </label>
                <input
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://mi-sitio.com/formulario"
                  className="w-full rounded border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                />
                {urlError && <p className="mt-1 text-xs text-ops-coral">{urlError}</p>}
              </div>
              <p className="text-sm text-ops-tx2">
                Instala el script de diagnóstico en esa URL y realiza la acción de <strong className="text-ops-tx2">{definition.displayName}</strong>.
              </p>
              {error && (
                <div className="flex items-center gap-2 rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-ops-coral">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="border-ops-bd bg-ops-s2 text-ops-tx2 hover:bg-ops-sel"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleStartSession}
                  disabled={isLoading || !targetUrl}
                  className="bg-ops-sel hover:bg-zinc-600 text-ops-tx"
                >
                  {isLoading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Iniciar sesión de prueba
                </Button>
              </div>
            </div>
          )}

          {/* Step: instructions */}
          {step === "instructions" && (
            <div className="space-y-4">
              <div className="rounded border border-ops-bd bg-ops-s2 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-ops-tx2">
                    {siteToken
                      ? "Token permanente del sitio — no expira"
                      : "Token de sesión (válido 30 min)"}
                  </span>
                  <CopyButton text={siteToken ?? publicToken} />
                </div>
                <code className="break-all text-xs text-ops-tx2">{siteToken ?? publicToken}</code>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-ops-tx2">Script de diagnóstico</span>
                  <CopyButton text={diagnosticScript} />
                </div>
                <pre className="overflow-x-auto rounded border border-ops-bd bg-ops-bg px-4 py-3 text-xs text-ops-tx2 whitespace-pre-wrap">
                  {diagnosticScript}
                </pre>
              </div>

              <div className="rounded border border-blue-900 bg-blue-950 px-4 py-3 text-sm text-blue-300 space-y-2">
                <p>
                  <strong className="text-blue-200">1.</strong> Agrega el script al HTML de{" "}
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline inline-flex items-center gap-1"
                  >
                    esta URL <ExternalLink className="h-3.5 w-3.5" />
                  </a>{" "}
                  antes del cierre <code className="text-blue-200">&lt;/body&gt;</code>.
                </p>
                <p>
                  <strong className="text-blue-200">2.</strong>{" "}
                  {definition.triggerType === "page_load" && "Recarga la página. El evento se detectará cuando tu pixel de Meta dispare al cargar."}
                  {definition.triggerType === "form_submit" && "Completa y envía el formulario real. El evento se detectará cuando el pixel confirme el envío."}
                  {definition.triggerType === "element_click" && "Haz clic en el elemento de conversión. El evento se detectará cuando el pixel lo capture."}
                  {definition.triggerType === "ecommerce_event" && "Completa una transacción de prueba. El evento se detectará cuando el pixel confirme la compra."}
                  {!["page_load","form_submit","element_click","ecommerce_event"].includes(definition.triggerType) && `Realiza la acción de conversión real. El evento se detectará cuando fbq('track', '${definition.providerEventName}') se dispare.`}
                </p>
                <p className="text-blue-300/60 text-xs">
                  El script intercepta llamadas reales a <code>fbq(&apos;track&apos;)</code> — no dispara por sí solo. Si tu pixel no está instalado, llama <code>window.__synclead_collect</code> manualmente.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() => { setPollCount(0); setStep("waiting") }}
                  className="bg-ops-sel hover:bg-zinc-600 text-ops-tx"
                >
                  Listo, esperando evento
                </Button>
              </div>
            </div>
          )}

          {/* Step: waiting */}
          {step === "waiting" && (
            <div className="flex flex-col items-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-ops-tx2" />
              <p className="text-sm text-ops-tx2">Esperando evento de diagnóstico...</p>
              <p className="text-xs text-ops-tx3">
                Verificando cada 3 segundos ({pollCount}/{MAX_POLLS})
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("result")}
                className="border-ops-bd bg-ops-s2 text-ops-tx2 hover:bg-ops-sel mt-4"
              >
                Ver resultado parcial
              </Button>
            </div>
          )}

          {/* Step: result */}
          {step === "result" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {observations.length > 0 ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                    <span className="text-sm font-medium text-ops-tx">
                      {observations.length} evento{observations.length > 1 ? "s" : ""} recibido{observations.length > 1 ? "s" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0" />
                    <span className="text-sm font-medium text-ops-tx">No se recibieron eventos</span>
                  </>
                )}
                {sessionStatus && (
                  <span className="ml-auto text-xs text-ops-tx3 capitalize">{sessionStatus}</span>
                )}
              </div>

              <ObservationResult observations={observations} />

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStep("select_url")
                    setPublicToken("")
                    setSessionId("")
                    setObservations([])
                    setError("")
                    setPollCount(0)
                  }}
                  className="border-ops-bd bg-ops-s2 text-ops-tx2 hover:bg-ops-sel"
                >
                  Nueva prueba
                </Button>
                <Button
                  size="sm"
                  onClick={onClose}
                  className="bg-ops-sel hover:bg-zinc-600 text-ops-tx"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
