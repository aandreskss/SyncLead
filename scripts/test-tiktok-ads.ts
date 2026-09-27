import { config } from "dotenv"
config({ path: ".env.local" })

async function test() {
  console.log("Probando TikTok Creative Center API...")
  const res = await fetch('https://ads.tiktok.com/creative_radar_api/v1/top_ads/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://ads.tiktok.com',
      'Referer': 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en',
    },
    body: JSON.stringify({
      industry_id: '',
      country_code: 'VE',
      period_type: 30,
      page: 1,
      limit: 3,
    }),
  })

  console.log("HTTP:", res.status)
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    console.log("Response:", JSON.stringify(json, null, 2).slice(0, 800))
  } catch {
    console.log("Raw:", text.slice(0, 500))
  }
}

test().catch(console.error)
