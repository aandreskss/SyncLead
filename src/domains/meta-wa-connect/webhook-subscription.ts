import "server-only"
import { createHmac } from "crypto"

const GRAPH_BASE = "https://graph.facebook.com"
const API_VERSION = "v22.0"

function appSecret() {
  return process.env.WA_CLOUD_APP_SECRET ?? ""
}

function appSecretProof(accessToken: string): string {
  return createHmac("sha256", appSecret()).update(accessToken).digest("hex")
}

/** Subscribe our Meta app to receive webhooks for this WABA */
export async function subscribeWabaToApp(wabaId: string, accessToken: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/${API_VERSION}/${wabaId}/subscribed_apps`)
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("appsecret_proof", appSecretProof(accessToken))

  const res = await fetch(url.toString(), { method: "POST", cache: "no-store" })
  const data = await res.json() as { success?: boolean; error?: { message: string; code: number } }

  if (!res.ok || !data.success) {
    throw Object.assign(
      new Error(data.error?.message ?? "Webhook subscription failed"),
      { metaCode: data.error?.code }
    )
  }
}

/** Unsubscribe our Meta app from WABA webhooks */
export async function unsubscribeWabaFromApp(wabaId: string, accessToken: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/${API_VERSION}/${wabaId}/subscribed_apps`)
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("appsecret_proof", appSecretProof(accessToken))

  const res = await fetch(url.toString(), { method: "DELETE", cache: "no-store" })
  if (!res.ok) {
    const data = await res.json() as { error?: { message: string; code: number } }
    // 100/200 = already unsubscribed or not authorized — treat as success
    if (data.error?.code !== 100 && data.error?.code !== 200) {
      throw Object.assign(
        new Error(data.error?.message ?? "Webhook unsubscription failed"),
        { metaCode: data.error?.code }
      )
    }
  }
}
