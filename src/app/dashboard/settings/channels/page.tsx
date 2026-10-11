import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { db } from "@/lib/db"
import { waBusinessAccounts, waPhoneNumbers } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { PageShell, PageHeader, Panel, StatusChip } from "@/components/app/ops"
import { AlertTriangle, CheckCircle2, Phone, Wifi, WifiOff, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { WaConnectPanel } from "./_components/WaConnectPanel"

export const dynamic = "force-dynamic"

const PHONE_STATUS_TONE: Record<string, "green" | "amber" | "neutral" | "coral"> = {
  active: "green",
  pending: "amber",
  inactive: "neutral",
  deleted: "coral",
}
const PHONE_STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  pending: "Pendiente",
  inactive: "Inactivo",
  deleted: "Eliminado",
}
const WABA_STATUS_TONE: Record<string, "green" | "amber" | "neutral" | "coral"> = {
  active: "green",
  inactive: "neutral",
  error: "coral",
  disconnected: "coral",
}

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ wa_error?: string; wa_success?: string }>
}) {
  const params = await searchParams

  let ctx: Awaited<ReturnType<typeof requireRole>>
  try {
    ctx = await requireRole(["owner", "admin"])
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/dashboard")
    throw e
  }

  // Real adapter status — never simulated
  const hasAppSecret = Boolean(process.env.WA_CLOUD_APP_SECRET)
  const hasWebhookPath = Boolean(process.env.WA_CLOUD_WEBHOOK_PATH ?? process.env.NEXT_PUBLIC_APP_URL)
  const appConfigured = Boolean(process.env.META_WA_APP_ID)

  const [wabaRows, phoneRows] = await Promise.all([
    db
      .select({
        id: waBusinessAccounts.id,
        wabaId: waBusinessAccounts.wabaId,
        displayName: waBusinessAccounts.displayName,
        status: waBusinessAccounts.status,
        connectionMode: waBusinessAccounts.connectionMode,
        connectionStatus: waBusinessAccounts.connectionStatus,
        oauthScopes: waBusinessAccounts.oauthScopes,
        tokenExpiresAt: waBusinessAccounts.tokenExpiresAt,
        connectedAt: waBusinessAccounts.connectedAt,
        lastError: waBusinessAccounts.lastError,
        createdAt: waBusinessAccounts.createdAt,
      })
      .from(waBusinessAccounts)
      .where(eq(waBusinessAccounts.orgId, ctx.orgId))
      .orderBy(desc(waBusinessAccounts.createdAt)),
    db
      .select({
        id: waPhoneNumbers.id,
        phoneNumberId: waPhoneNumbers.phoneNumberId,
        displayPhoneNumber: waPhoneNumbers.displayPhoneNumber,
        verifiedName: waPhoneNumbers.verifiedName,
        qualityRating: waPhoneNumbers.qualityRating,
        status: waPhoneNumbers.status,
        wabaAccountId: waPhoneNumbers.wabaAccountId,
        createdAt: waPhoneNumbers.createdAt,
      })
      .from(waPhoneNumbers)
      .where(eq(waPhoneNumbers.orgId, ctx.orgId))
      .orderBy(waPhoneNumbers.displayPhoneNumber),
  ])

  const activePhones = phoneRows.filter(p => p.status === "active")
  const sendingEnabled = hasAppSecret && activePhones.length > 0

  // Shape WABA rows for WaConnectPanel (never expose accessTokenEnc)
  const connectPanelWabas = wabaRows.map(w => ({
    id: w.id,
    wabaId: w.wabaId,
    displayName: w.displayName,
    connectionMode: w.connectionMode,
    connectionStatus: w.connectionStatus,
    connectedAt: w.connectedAt,
    tokenExpiresAt: w.tokenExpiresAt,
    oauthScopes: w.oauthScopes,
    lastError: w.lastError,
  }))

  return (
    <PageShell>
      <PageHeader
        eyebrow="CONFIGURACIÓN"
        title="Canales"
        subtitle="Estado de conexiones de WhatsApp Business para envíos reales."
      />

      {/* OAuth feedback banners */}
      {params.wa_success === "1" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
            <p className="text-sm font-medium text-green-800">
              ¡WhatsApp Business conectado correctamente!
            </p>
          </div>
        </div>
      )}
      {params.wa_error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-red-800">Error al conectar WhatsApp Business</p>
              <p className="mt-0.5 text-xs text-red-700">
                {params.wa_error === "user_cancelled" && "Cancelaste la autorización en Meta."}
                {params.wa_error === "state_not_found" && "Sesión de conexión no encontrada. Intenta de nuevo."}
                {params.wa_error === "state_expired" && "La sesión expiró (10 minutos). Intenta de nuevo."}
                {params.wa_error === "state_consumed" && "Esta sesión ya fue usada. Intenta de nuevo."}
                {params.wa_error === "org_mismatch" && "La sesión no corresponde a esta organización."}
                {params.wa_error === "token_exchange_failed" && "No se pudo obtener el token de acceso de Meta."}
                {params.wa_error === "waba_not_found" && "No se encontró ninguna cuenta WhatsApp Business asociada."}
                {params.wa_error === "waba_unauthorized" && "No tienes acceso a esa cuenta WhatsApp Business."}
                {params.wa_error === "number_conflict" && "Uno de los números ya está vinculado a otra organización."}
                {params.wa_error === "multiple_wabas_use_embedded_signup" && "Tienes múltiples cuentas WABA. Usa el flujo Embedded Signup para seleccionar una."}
                {params.wa_error === "app_not_configured" && "La aplicación Meta no está configurada en este servidor."}
                {!["user_cancelled","state_not_found","state_expired","state_consumed","org_mismatch","token_exchange_failed","waba_not_found","waba_unauthorized","number_conflict","multiple_wabas_use_embedded_signup","app_not_configured"].includes(params.wa_error) && `Código: ${params.wa_error}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OAuth Connect Panel — Phase 12 */}
      <WaConnectPanel wabas={connectPanelWabas} appConfigured={appConfigured} />

      {/* Separation notice */}
      <Panel bodyClassName="px-5 py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-sm text-ops-tx">
            <strong>Publicar la configuración de un agente y habilitar envíos reales son operaciones distintas.</strong>{" "}
            Publicar un agente actualiza su configuración en la plataforma pero no activa automáticamente ninguna conexión.
            Los envíos reales requieren que el adaptador Meta esté configurado y que haya al menos un número activo.
          </p>
        </div>
      </Panel>

      {/* Adapter status */}
      <Panel title="Adaptador WhatsApp Cloud API" description="Dependencias de infraestructura del adaptador Meta.">
        <div className="divide-y divide-ops-line">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ops-tx">Secreto de aplicación Meta</p>
              <p className="text-xs text-ops-tx3 mt-0.5">
                Variable de entorno <code className="rounded bg-ops-s2 px-1">WA_CLOUD_APP_SECRET</code>
              </p>
            </div>
            {hasAppSecret ? (
              <div className="flex items-center gap-1.5 text-ops-green">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium">Configurado</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-ops-coral">
                <XCircle className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium">No configurado</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ops-tx">URL de la aplicación</p>
              <p className="text-xs text-ops-tx3 mt-0.5">
                Variable de entorno <code className="rounded bg-ops-s2 px-1">NEXT_PUBLIC_APP_URL</code> (para webhook)
              </p>
            </div>
            {hasWebhookPath ? (
              <div className="flex items-center gap-1.5 text-ops-green">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium">Configurada</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-ops-coral">
                <XCircle className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium">No configurada</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ops-tx">Estado de envíos reales</p>
              <p className="text-xs text-ops-tx3 mt-0.5">
                Requiere secreto configurado y al menos un número activo
              </p>
            </div>
            {sendingEnabled ? (
              <div className="flex items-center gap-1.5 text-ops-green">
                <Wifi className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium">Habilitado</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-ops-tx3">
                <WifiOff className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium">Deshabilitado</span>
              </div>
            )}
          </div>
        </div>

        {!hasAppSecret && (
          <div className="mx-5 mb-5 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-700">
              El adaptador WhatsApp Cloud API requiere <code>WA_CLOUD_APP_SECRET</code> en las variables de entorno del servidor.
              Configúralo en el panel de Vercel o en tu archivo <code>.env.local</code> y redeploya.
              Sin esta variable no se pueden procesar mensajes entrantes ni enviar mensajes salientes.
            </p>
          </div>
        )}
      </Panel>

      {/* WhatsApp Business Accounts */}
      <Panel
        title="Cuentas WhatsApp Business"
        description="WABA conectadas a esta organización."
      >
        {wabaRows.length === 0 ? (
          <div className="px-5 pb-5">
            <p className="text-sm text-ops-tx2">No hay cuentas WhatsApp Business registradas.</p>
            <p className="text-xs text-ops-tx3 mt-1">
              Usa el panel &quot;Conectar WhatsApp Business&quot; arriba para vincular tu cuenta mediante OAuth.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-ops-line">
            {wabaRows.map(waba => (
              <div key={waba.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-ops-tx">{waba.displayName}</p>
                  <p className="text-xs text-ops-tx3 mt-0.5">WABA ID: {waba.wabaId}</p>
                  {waba.connectionMode === "embedded_signup" && (
                    <p className="text-xs text-ops-tx3 mt-0.5">Modo: OAuth (Embedded Signup)</p>
                  )}
                </div>
                <StatusChip tone={WABA_STATUS_TONE[waba.status] ?? "neutral"}>
                  {waba.status.charAt(0).toUpperCase() + waba.status.slice(1)}
                </StatusChip>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Phone numbers */}
      <Panel
        title="Números de teléfono"
        description="Números registrados y su estado de conexión actual."
      >
        {phoneRows.length === 0 ? (
          <div className="px-5 pb-5">
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-ops-bd p-4">
              <Phone className="h-5 w-5 shrink-0 text-ops-tx3" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-ops-tx">Sin números registrados</p>
                <p className="text-xs text-ops-tx2 mt-0.5">
                  Los números se registran automáticamente cuando Meta Cloud API procesa el webhook de una cuenta WABA conectada.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-ops-line">
            {phoneRows.map(phone => (
              <div key={phone.id} className="flex items-center justify-between px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-ops-tx3" aria-hidden="true" />
                    <p className="text-sm font-semibold text-ops-tx">{phone.displayPhoneNumber}</p>
                  </div>
                  {phone.verifiedName && (
                    <p className="text-xs text-ops-tx3 mt-0.5 ml-6">{phone.verifiedName}</p>
                  )}
                  {phone.qualityRating && (
                    <p className="text-xs text-ops-tx3 mt-0.5 ml-6">
                      Calidad: <span className={cn(
                        "font-medium",
                        phone.qualityRating === "GREEN" ? "text-ops-green" :
                        phone.qualityRating === "YELLOW" ? "text-amber-600" : "text-ops-coral"
                      )}>{phone.qualityRating}</span>
                    </p>
                  )}
                </div>
                <StatusChip tone={PHONE_STATUS_TONE[phone.status] ?? "neutral"}>
                  {PHONE_STATUS_LABEL[phone.status] ?? phone.status}
                </StatusChip>
              </div>
            ))}
          </div>
        )}

        {phoneRows.length > 0 && (
          <div className="border-t border-ops-line px-5 py-3">
            <p className="text-xs text-ops-tx3">
              {activePhones.length} de {phoneRows.length} número{phoneRows.length !== 1 ? "s" : ""} activo{activePhones.length !== 1 ? "s" : ""}.
              {!sendingEnabled && activePhones.length > 0 && !hasAppSecret && (
                <span className="text-ops-coral ml-1">El adaptador Meta no está configurado — los envíos están deshabilitados.</span>
              )}
            </p>
          </div>
        )}
      </Panel>
    </PageShell>
  )
}
