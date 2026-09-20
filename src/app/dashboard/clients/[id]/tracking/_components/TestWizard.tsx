"use client"

import { useState, useEffect, useCallback } from "react"
import type { ConversionDefinitionPublic, ConversionObservationPublic } from "@/domains/tracking/types"
import { startTestSessionAction, pollTestSessionAction } from "@/domains/tracking/actions"
import { Button } from "@/components/ui/button"
import { X, Copy, CheckCircle2, Loader2, AlertCircle, ExternalLink } from "lucide-react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.synclead.com"

type WizardStep = "select_url" | "start_session" | "instructions" | "waiting" | "result"

type Props = {
  definition: ConversionDefinitionPublic
  clientId: string
  onClose: () => void
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
      className="flex items-center gap-1.5 rounded border border-zinc-600 bg-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-600 transition-colors"
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

function buildDiagnosticScript(token: string): string {
  const collector = `${APP_URL}/api/collect/${token}`
  return `// Script de diagnóstico SyncLead — colocar antes del cierre </body>
// Intercepta fbq('track') automáticamente. Solo reporta cuando la conversión real ocurre.
(function() {
  var collector = "${collector}";

  function sendToDiagnostic(eventName, params) {
    var boolParams = {};
    if (params && typeof params === "object") {
      Object.keys(params).forEach(function(k) { boolParams[k] = true; });
    }
    fetch(collector, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: eventName,
        pageUrl: window.location.href,
        environment: "production",
        parameters: boolParams
      })
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
  } else {
    Object.defineProperty(window, "fbq", {
      configurable: true,
      set: function(val) {
        Object.defineProperty(window, "fbq", {
          configurable: true, writable: true,
          value: typeof val === "function" ? wrapFbq(val) : val
        });
      }
    });
  }
})();`
}

function ObservationResult({ observations }: { observations: ConversionObservationPublic[] }) {
  if (observations.length === 0) {
    return (
      <p className="text-sm text-zinc-400">No se recibieron eventos en esta sesión.</p>
    )
  }

  return (
    <div className="space-y-3">
      {observations.map((obs) => (
        <div key={obs.id} className="rounded border border-zinc-700 bg-zinc-800 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
            <span className="text-sm font-medium text-zinc-100">Evento recibido: {obs.eventName}</span>
          </div>
          {obs.pageUrl && (
            <p className="text-xs text-zinc-400">URL: {obs.pageUrl}</p>
          )}
          <div className="space-y-1">
            {Object.entries(obs.validationResult).map(([param, result]) => (
              <div key={param} className="flex items-center gap-2 text-xs">
                {result === "present" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                )}
                <span className={result === "present" ? "text-zinc-300" : "text-red-400"}>
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

export function TestWizard({ definition, clientId, onClose }: Props) {
  const [step, setStep] = useState<WizardStep>("select_url")
  const [targetUrl, setTargetUrl] = useState("")
  const [urlError, setUrlError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [publicToken, setPublicToken] = useState("")
  const [observations, setObservations] = useState<ConversionObservationPublic[]>([])
  const [sessionStatus, setSessionStatus] = useState<string>("")
  const [pollCount, setPollCount] = useState(0)

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

  const diagnosticScript = publicToken ? buildDiagnosticScript(publicToken) : ""

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Probar evento en vivo</h2>
            <p className="text-sm text-zinc-400 mt-0.5">{definition.displayName} — {definition.providerEventName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs text-zinc-500">
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
                        ? "bg-zinc-600 text-zinc-100"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {i < 4 && <span className="text-zinc-700">—</span>}
                </div>
              )
            })}
          </div>

          {/* Step: select URL */}
          {(step === "select_url" || step === "start_session") && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  URL de la página donde probar
                </label>
                <input
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://mi-sitio.com/formulario"
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                />
                {urlError && <p className="mt-1 text-xs text-red-400">{urlError}</p>}
              </div>
              <p className="text-sm text-zinc-400">
                Instala el script de diagnóstico en esa URL y realiza la acción de <strong className="text-zinc-300">{definition.displayName}</strong>.
              </p>
              {error && (
                <div className="flex items-center gap-2 rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleStartSession}
                  disabled={isLoading || !targetUrl}
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
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
              <div className="rounded border border-zinc-700 bg-zinc-800 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-400">Token de sesión (válido 30 min)</span>
                  <CopyButton text={publicToken} />
                </div>
                <code className="break-all text-xs text-zinc-300">{publicToken}</code>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-300">Script de diagnóstico</span>
                  <CopyButton text={diagnosticScript} />
                </div>
                <pre className="overflow-x-auto rounded border border-zinc-700 bg-zinc-950 px-4 py-3 text-xs text-zinc-300 whitespace-pre-wrap">
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
                  El script intercepta llamadas reales a <code>fbq('track')</code> — no dispara por sí solo. Si tu pixel no está instalado, llama <code>window.__synclead_collect</code> manualmente.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() => { setPollCount(0); setStep("waiting") }}
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
                >
                  Listo, esperando evento
                </Button>
              </div>
            </div>
          )}

          {/* Step: waiting */}
          {step === "waiting" && (
            <div className="flex flex-col items-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              <p className="text-sm text-zinc-300">Esperando evento de diagnóstico...</p>
              <p className="text-xs text-zinc-500">
                Verificando cada 3 segundos ({pollCount}/{MAX_POLLS})
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("result")}
                className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 mt-4"
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
                    <span className="text-sm font-medium text-zinc-100">
                      {observations.length} evento{observations.length > 1 ? "s" : ""} recibido{observations.length > 1 ? "s" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0" />
                    <span className="text-sm font-medium text-zinc-100">No se recibieron eventos</span>
                  </>
                )}
                {sessionStatus && (
                  <span className="ml-auto text-xs text-zinc-500 capitalize">{sessionStatus}</span>
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
                  className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Nueva prueba
                </Button>
                <Button
                  size="sm"
                  onClick={onClose}
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
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
