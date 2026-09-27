import { config } from "dotenv"
config({ path: ".env.local" })

async function test() {
  const userToken = process.env.META_USER_ACCESS_TOKEN
  if (!userToken) { console.error("Falta META_USER_ACCESS_TOKEN"); process.exit(1) }

  console.log("Probando con User Access Token...")
  const qs = new URLSearchParams({
    access_token: userToken,
    search_terms: "ropa",
    ad_reached_countries: '["VE"]',
    ad_active_status: "ALL",
    ad_type: "ALL",
    limit: "3",
    fields: "id,page_name,ad_creative_bodies,ad_snapshot_url,impressions,media_type",
  })
  const res = await fetch(`https://graph.facebook.com/v21.0/ads_archive?${qs.toString()}`)
  const json = await res.json() as { data?: unknown[]; error?: unknown }
  console.log(`HTTP ${res.status}:`, json.error ? JSON.stringify(json.error, null, 2) : `${(json.data as unknown[])?.length ?? 0} resultados`)
  if (json.data && (json.data as unknown[]).length > 0) {
    console.log("Primer resultado:", JSON.stringify((json.data as unknown[])[0], null, 2))
  }
}

test().catch(console.error)
