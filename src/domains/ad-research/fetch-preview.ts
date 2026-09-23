"use server"

export interface AdPreviewMeta {
  title: string | null
  description: string | null
  imageUrl: string | null
  siteName: string | null
}

export async function fetchAdPreviewAction(url: string): Promise<AdPreviewMeta> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    })
    clearTimeout(timer)

    if (!res.ok) return empty()

    const html = await res.text()

    function og(prop: string): string | null {
      const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"))
      return m?.[1] ? decodeHTMLEntities(m[1]) : null
    }

    function meta(name: string): string | null {
      const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"))
      return m?.[1] ? decodeHTMLEntities(m[1]) : null
    }

    return {
      title: og("title") ?? meta("title") ?? extractTitle(html),
      description: og("description") ?? meta("description"),
      imageUrl: og("image") ?? null,
      siteName: og("site_name") ?? null,
    }
  } catch {
    return empty()
  }
}

function empty(): AdPreviewMeta {
  return { title: null, description: null, imageUrl: null, siteName: null }
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1] ? decodeHTMLEntities(m[1].trim()) : null
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
}
