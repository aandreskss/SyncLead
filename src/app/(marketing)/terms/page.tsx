import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Términos de Uso — SyncLead",
  description: "Condiciones de uso del servicio SyncLead.",
}

export default function TermsPage() {
  const updated = "6 de octubre de 2026"
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Términos de Uso</h1>
      <p className="mt-2 text-sm text-gray-500">Última actualización: {updated}</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">1. Aceptación</h2>
          <p>
            Al registrarte y usar SyncLead, aceptas estos Términos de Uso en nombre propio o de la
            empresa que representas. Si no los aceptas, no uses el servicio.
          </p>
          <p className="mt-2">
            SyncLead es operado por <strong>Marketing Laab C.A.</strong>, Naguanagua, Carabobo,
            Venezuela.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">2. Descripción del servicio</h2>
          <p>
            SyncLead es una plataforma CRM diseñada para anunciantes de Meta Ads que permite
            capturar leads, hacer seguimiento comercial, gestionar equipos de ventas y enviar
            eventos de conversión de vuelta a Meta Ads.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">3. Uso aceptable</h2>
          <p>Te comprometes a:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Usar el servicio únicamente para gestionar leads y conversiones legítimas de tus propias campañas publicitarias.</li>
            <li>No subir datos de terceros sin consentimiento.</li>
            <li>Mantener la confidencialidad de tus credenciales de acceso.</li>
            <li>Cumplir con las políticas de uso de Meta y cualquier otra plataforma conectada.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">4. Cuentas y acceso</h2>
          <p>
            Eres responsable de todas las actividades realizadas con tu cuenta. Notifícanos de
            inmediato ante cualquier acceso no autorizado. Nos reservamos el derecho de suspender
            cuentas que infrinjan estos términos.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">5. Datos de terceros (leads)</h2>
          <p>
            Los datos de contacto de leads que ingreses a SyncLead son de tu responsabilidad. Debes
            contar con la base legal adecuada para tratarlos y cumplir con la normativa de protección
            de datos aplicable en tu país.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">6. Disponibilidad del servicio</h2>
          <p>
            Nos esforzamos por mantener SyncLead disponible de forma continua, pero no garantizamos
            disponibilidad ininterrumpida. Podemos realizar mantenimientos programados o no
            programados sin previo aviso.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">7. Limitación de responsabilidad</h2>
          <p>
            SyncLead se provee "tal cual". Marketing Laab C.A. no será responsable por pérdidas de
            datos, interrupciones del servicio o daños indirectos derivados del uso de la plataforma.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">8. Modificaciones</h2>
          <p>
            Podemos actualizar estos términos en cualquier momento. Te notificaremos por correo
            electrónico ante cambios relevantes. El uso continuado del servicio después de la
            notificación implica la aceptación de los nuevos términos.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">9. Contacto</h2>
          <p>
            Marketing Laab C.A.<br />
            Res. Los Caracaros, Edf. Castaño<br />
            Naguanagua, Carabobo 2001, Venezuela<br />
            +58 424-442-6241
          </p>
        </section>
      </div>
    </div>
  )
}
