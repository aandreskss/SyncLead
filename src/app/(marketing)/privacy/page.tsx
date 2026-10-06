import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de Privacidad — SyncLead",
  description: "Cómo recopilamos, usamos y protegemos tus datos en SyncLead.",
}

export default function PrivacyPage() {
  const updated = "6 de octubre de 2026"
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-gray-500">Última actualización: {updated}</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">1. Responsable del tratamiento</h2>
          <p>
            <strong>Marketing Laab C.A.</strong>, con domicilio en Res. Los Caracaros, Edf. Castaño,
            Naguanagua, Carabobo 2001, Venezuela. Teléfono: +58 424-442-6241.
          </p>
          <p className="mt-2">
            SyncLead es una plataforma CRM operada por Marketing Laab C.A. destinada a anunciantes
            de Meta Ads para gestionar leads, seguimiento comercial y conversiones.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">2. Datos que recopilamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Datos de cuenta:</strong> nombre, correo electrónico y contraseña de los usuarios registrados.</li>
            <li><strong>Datos de leads:</strong> nombre, teléfono, correo, ciudad y otros datos de contacto que los clientes de SyncLead ingresan a la plataforma.</li>
            <li><strong>Datos de campañas:</strong> métricas de rendimiento de Meta Ads (gasto, impresiones, clics) obtenidas con el consentimiento del anunciante.</li>
            <li><strong>Datos de uso:</strong> páginas visitadas, acciones realizadas dentro de la plataforma e información del navegador para fines de seguridad y mejora del servicio.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">3. Uso de los datos de la plataforma Meta</h2>
          <p>
            SyncLead accede a datos de la plataforma de Meta (incluyendo leads de Meta Lead Ads y
            métricas de campañas publicitarias) con el único fin de prestar el servicio contratado
            por el anunciante: centralizar y gestionar sus leads y medir el rendimiento de sus campañas.
          </p>
          <p className="mt-2">
            Los datos obtenidos de Meta no se venden, no se comparten con terceros ajenos a la
            prestación del servicio y no se utilizan con fines publicitarios propios.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">4. Finalidad del tratamiento</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Proveer y mejorar los servicios de SyncLead.</li>
            <li>Enviar notificaciones transaccionales relacionadas con la cuenta.</li>
            <li>Cumplir obligaciones legales aplicables.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">5. Compartición de datos</h2>
          <p>
            No vendemos datos personales. Podemos compartirlos con proveedores de infraestructura
            (alojamiento, base de datos, correo electrónico) que actúan como encargados del
            tratamiento bajo acuerdos de confidencialidad. Estos proveedores incluyen, entre otros,
            Vercel (alojamiento), Neon (base de datos) y Resend (correo electrónico).
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">6. Retención de datos</h2>
          <p>
            Los datos de leads se conservan mientras la cuenta esté activa. Los registros de IP y
            agente de usuario se anulan automáticamente a los 90 días. Los usuarios pueden solicitar
            la eliminación de sus datos en cualquier momento contactándonos.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">7. Seguridad</h2>
          <p>
            Aplicamos cifrado AES-256 para tokens y credenciales sensibles, conexiones HTTPS en todo
            momento y controles de acceso basados en roles. Ningún token de Meta se expone fuera del
            entorno de servidor.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">8. Derechos del usuario</h2>
          <p>
            Tienes derecho a acceder, rectificar, eliminar y portar tus datos personales. Para
            ejercer cualquiera de estos derechos, contáctanos a través de los canales indicados al
            pie de esta página.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">9. Cambios a esta política</h2>
          <p>
            Nos reservamos el derecho de actualizar esta política. Notificaremos cambios relevantes
            por correo electrónico o mediante un aviso visible en la plataforma.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">10. Contacto</h2>
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
