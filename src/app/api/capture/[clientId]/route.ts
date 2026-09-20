import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { metaConnections, campaigns } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

// Minimal no-op script returned when no campaign/credential exists
const NOOP_SCRIPT = "(function(){})()"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params

  if (!/^[0-9a-f-]{36}$/.test(clientId)) {
    return scriptResponse(NOOP_SCRIPT)
  }

  // Find the meta connection that has a capture script key
  const conn = await db.query.metaConnections.findFirst({
    where: and(
      eq(metaConnections.clientId, clientId),
      eq(metaConnections.leadAdsEnabled, true)
    ),
    columns: {
      captureScriptKey: true,
      orgId: true,
    },
  })

  if (!conn?.captureScriptKey) {
    // Try to find the key from the campaign + ingestion credentials
    // (in case the connection was set up before this column existed)
    return scriptResponse(NOOP_SCRIPT)
  }

  const publicKey = conn.captureScriptKey

  // Verify the campaign is still active
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.clientId, clientId),
      eq(campaigns.orgId, conn.orgId),
      eq(campaigns.slug, "meta-lead-ads"),
      eq(campaigns.active, true)
    ),
    columns: { id: true },
  })

  if (!campaign) {
    return scriptResponse(NOOP_SCRIPT)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const ingestUrl = `${appUrl}/api/ingest/form`

  const rawPreset = request.nextUrl.searchParams.get("preset") ?? "basic"
  const preset = ["basic", "location", "ecommerce"].includes(rawPreset) ? rawPreset : "basic"

  const script = buildCaptureScript(ingestUrl, publicKey, preset)

  return scriptResponse(script, 300)
}

function scriptResponse(content: string, maxAge = 0): NextResponse {
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": maxAge > 0
        ? `public, max-age=${maxAge}, s-maxage=${maxAge}`
        : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function buildCaptureScript(ingestUrl: string, publicKey: string, preset: string): string {
  // Sanitize values before embedding in JS to prevent injection
  const safeIngestUrl = ingestUrl.replace(/['"\\]/g, "")
  const safePublicKey = publicKey.replace(/['"\\]/g, "")

  const withLocation = preset === "location" || preset === "ecommerce"
  const withPayment = preset === "ecommerce"

  const extraCapture = [
    withLocation ? `      var city = getVal(form, ['city','ciudad','billing_city','shipping_city','locality','municipio']);` : "",
    withPayment ? `      var payment = getVal(form, ['payment_method','payment','metodo_pago','forma_pago','payment_type','metodo']);` : "",
  ].filter(Boolean).join("\n")

  const extraPayload = [
    withLocation ? `      if (city) payload.city = city;` : "",
    withPayment ? `      if (payment) payload.payment_method = payment;` : "",
  ].filter(Boolean).join("\n")

  return `(function() {
  function fromMeta() {
    try {
      var url = new URL(location.href);
      if (url.searchParams.get('fbclid')) return true;
      if (document.cookie.indexOf('_fbc=') > -1) return true;
      var src = url.searchParams.get('utm_source') || '';
      return src === 'facebook' || src === 'instagram' || src === 'fb';
    } catch(e) { return false; }
  }

  if (!fromMeta()) return;

  function getAttr() {
    try {
      var url = new URL(location.href);
      return {
        fbclid: url.searchParams.get('fbclid'),
        utm_source: url.searchParams.get('utm_source') || 'facebook',
        utm_medium: url.searchParams.get('utm_medium') || 'paid_social',
        utm_campaign: url.searchParams.get('utm_campaign'),
        utm_content: url.searchParams.get('utm_content'),
        utm_term: url.searchParams.get('utm_term'),
        landing_url: location.href
      };
    } catch(e) { return {}; }
  }

  function getVal(form, names) {
    for (var i = 0; i < names.length; i++) {
      var sel = '[name="' + names[i] + '"],[id="' + names[i] + '"]';
      try {
        var el = form.querySelector(sel);
        if (el && el.value && el.value.trim()) return el.value.trim();
      } catch(e) {}
    }
    return null;
  }

  document.addEventListener('submit', function(e) {
    try {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;
      var name = getVal(form, ['name','full_name','nombre','fullname','nombre_completo','first_name']);
      var email = getVal(form, ['email','correo','mail','email_address','correo_electronico']);
      var phone = getVal(form, ['phone','telefono','tel','phone_number','celular','movil']);
${extraCapture}
      if (!email && !phone) return;
      var attr = getAttr();
      var payload = { name: name, email: email, phone: phone };
${extraPayload}
      var keys = Object.keys(attr);
      for (var k = 0; k < keys.length; k++) {
        if (attr[keys[k]] != null) payload[keys[k]] = attr[keys[k]];
      }
      fetch('${safeIngestUrl}', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ingest-Token': '${safePublicKey}'
        },
        body: JSON.stringify(payload),
        keepalive: true
      });
    } catch(e) {}
  }, true);
})();`
}
