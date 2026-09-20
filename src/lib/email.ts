import "server-only"
import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.RESEND_FROM_EMAIL ?? "SyncLead <noreply@synclead.app>"

export async function sendLeadAssignmentEmail(params: {
  to: string
  repName: string
  lead: {
    name?: string | null
    phone?: string | null
    email?: string | null
    metaCampaignName?: string | null
  }
  dashboardUrl: string
}): Promise<void> {
  if (!resend) return

  const { to, repName, lead, dashboardUrl } = params

  const rows: string[] = []
  if (lead.name) rows.push(`<tr><td style="padding:6px 12px 6px 0;color:#9ca3af;white-space:nowrap">Nombre</td><td style="padding:6px 0;color:#f4f4f5">${lead.name}</td></tr>`)
  if (lead.phone) rows.push(`<tr><td style="padding:6px 12px 6px 0;color:#9ca3af;white-space:nowrap">Teléfono</td><td style="padding:6px 0;color:#f4f4f5">${lead.phone}</td></tr>`)
  if (lead.email) rows.push(`<tr><td style="padding:6px 12px 6px 0;color:#9ca3af;white-space:nowrap">Email</td><td style="padding:6px 0;color:#f4f4f5">${lead.email}</td></tr>`)
  if (lead.metaCampaignName) rows.push(`<tr><td style="padding:6px 12px 6px 0;color:#9ca3af;white-space:nowrap">Campaña</td><td style="padding:6px 0;color:#f4f4f5">${lead.metaCampaignName}</td></tr>`)

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:40px auto;padding:0 20px">
    <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:32px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px">
        <div style="width:28px;height:28px;background:#4f46e5;border-radius:7px;display:flex;align-items:center;justify-content:center">
          <span style="color:#fff;font-size:14px;font-weight:700">S</span>
        </div>
        <span style="color:#e4e4e7;font-size:15px;font-weight:700;letter-spacing:-0.3px">SyncLead</span>
      </div>

      <h1 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;font-weight:600">Te asignaron un lead</h1>
      <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px">Hola ${repName}, tienes un nuevo prospecto para atender.</p>

      <div style="background:#09090b;border:1px solid #27272a;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <table style="border-collapse:collapse;width:100%">
          ${rows.join("\n          ")}
        </table>
      </div>

      <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;text-decoration:none">Ver lead en SyncLead →</a>
    </div>

    <p style="text-align:center;color:#52525b;font-size:12px;margin-top:20px">SyncLead · CRM de leads para Meta Ads</p>
  </div>
</body>
</html>`

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Nuevo lead asignado${lead.name ? `: ${lead.name}` : ""}`,
    html,
  })
}
