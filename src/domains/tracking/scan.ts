import "server-only"
import { ScanResult } from "./types"
import dns from "node:dns/promises"

const STATIC_LIMITATIONS = [
  "El escaneo estático no puede detectar eventos dinámicos disparados por interacciones del usuario",
  "Eventos cargados después del consentimiento o en rutas SPA pueden no ser visibles",
]

const MAX_RESPONSE_BYTES = 512 * 1024
const FETCH_TIMEOUT_MS = 8_000
const MAX_REDIRECTS = 3

type IpRange = { start: number; end: number }

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0
}

const BLOCKED_IPV4_RANGES: IpRange[] = [
  { start: ipv4ToInt("127.0.0.0"), end: ipv4ToInt("127.255.255.255") },
  { start: ipv4ToInt("10.0.0.0"), end: ipv4ToInt("10.255.255.255") },
  { start: ipv4ToInt("172.16.0.0"), end: ipv4ToInt("172.31.255.255") },
  { start: ipv4ToInt("192.168.0.0"), end: ipv4ToInt("192.168.255.255") },
  // link-local / metadata AWS GCP
  { start: ipv4ToInt("169.254.0.0"), end: ipv4ToInt("169.254.255.255") },
]

const BLOCKED_IPV6_PREFIXES = [
  "::1",
  "fc",
  "fd",
]

function isPrivateIpv4(ip: string): boolean {
  const int = ipv4ToInt(ip)
  return BLOCKED_IPV4_RANGES.some((range) => int >= range.start && int <= range.end)
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  return BLOCKED_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function isPrivateIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip)
}

async function assertSafeHostname(hostname: string): Promise<void> {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Pattern = /^\[?[0-9a-fA-F:]+\]?$/

  if (ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error("La URL apunta a una dirección IP no permitida.")
    }
    return
  }

  let addresses: string[]
  try {
    const result = await dns.lookup(hostname, { all: true })
    addresses = result.map((r) => r.address)
  } catch {
    throw new Error("No se pudo resolver el hostname. Verifica que la URL es correcta.")
  }

  for (const address of addresses) {
    if (isPrivateIp(address)) {
      throw new Error("El hostname resuelve a una dirección IP no permitida.")
    }
  }
}

function extractPixelIds(html: string): string[] {
  const ids = new Set<string>()
  const fbqInitRegex = /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/g
  let match: RegExpExecArray | null
  while ((match = fbqInitRegex.exec(html)) !== null) {
    ids.add(match[1])
  }
  const legacyRegex = /_fbq\.push\s*\(\s*\[\s*['"]init['"]\s*,\s*['"](\d+)['"]/g
  while ((match = legacyRegex.exec(html)) !== null) {
    ids.add(match[1])
  }
  return Array.from(ids)
}

function extractGtmIds(html: string): string[] {
  const ids = new Set<string>()
  const gtmIdRegex = /GTM-[A-Z0-9]+/g
  let match: RegExpExecArray | null
  while ((match = gtmIdRegex.exec(html)) !== null) {
    ids.add(match[0])
  }
  return Array.from(ids)
}

function extractFbqCalls(html: string): string[] {
  const calls: string[] = []
  const trackRegex = /fbq\s*\(\s*['"]track(?:Custom)?['"]\s*,\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = trackRegex.exec(html)) !== null) {
    calls.push(match[1])
  }
  return calls
}

function countScriptTags(html: string): number {
  return (html.match(/<script/gi) ?? []).length
}

function detectStaticIssues(
  html: string,
  pixelIds: string[],
  expectedPixelId: string | null,
): string[] {
  const issues: string[] = []

  if (pixelIds.length === 0) {
    issues.push("No se detectó código del Pixel de Meta en el HTML estático de la página.")
  }

  if (expectedPixelId !== null && pixelIds.length > 0 && !pixelIds.includes(expectedPixelId)) {
    issues.push(
      `El Pixel ID esperado (${expectedPixelId}) no coincide con los encontrados (${pixelIds.join(", ")}).`
    )
  }

  if (!html.includes("connect.facebook.net")) {
    issues.push("El script de connect.facebook.net no fue detectado en el HTML estático.")
  }

  return issues
}

export async function scanUrlForPixel(
  url: string,
  expectedPixelId: string | null = null,
): Promise<ScanResult> {
  const scannedAt = new Date()

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error("La URL proporcionada no es válida.")
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Solo se permiten URLs con esquema http o https.")
  }

  const originalHostname = parsedUrl.hostname
  await assertSafeHostname(originalHostname)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let html: string
  try {
    let response = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": "SyncLeadDiagBot/1.0 (conversion diagnostics; +https://synclead.app/bot)",
        Accept: "text/html",
      },
    })

    let redirectCount = 0
    while (response.status >= 300 && response.status < 400 && redirectCount < MAX_REDIRECTS) {
      const location = response.headers.get("location")
      if (!location) break

      let redirectUrl: URL
      try {
        redirectUrl = new URL(location, url)
      } catch {
        throw new Error("La URL de redirección no es válida.")
      }

      if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") {
        throw new Error("Redirección a esquema no permitido.")
      }

      // Redirects to a different hostname are blocked to prevent open redirect abuse
      if (redirectUrl.hostname !== originalHostname) {
        throw new Error("La URL redirige a un dominio diferente al original, lo que no está permitido.")
      }

      await assertSafeHostname(redirectUrl.hostname)

      response = await fetch(redirectUrl.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "SyncLeadDiagBot/1.0 (conversion diagnostics; +https://synclead.app/bot)",
          Accept: "text/html",
        },
      })
      redirectCount++
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html")) {
      throw new Error("La URL no devolvió contenido HTML.")
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No se pudo leer el cuerpo de la respuesta.")

    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        if (totalBytes > MAX_RESPONSE_BYTES) {
          reader.cancel()
          break
        }
        chunks.push(value)
      }
    }

    const cappedBytes = Math.min(totalBytes, MAX_RESPONSE_BYTES)
    const buffer = new Uint8Array(cappedBytes)
    let offset = 0
    for (const chunk of chunks) {
      const slice = chunk.slice(0, Math.min(chunk.byteLength, cappedBytes - offset))
      buffer.set(slice, offset)
      offset += slice.byteLength
      if (offset >= cappedBytes) break
    }

    html = new TextDecoder("utf-8", { fatal: false }).decode(buffer)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("El escaneo superó el tiempo límite de 8 segundos.")
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  const pixelIds = extractPixelIds(html)
  const gtmIds = extractGtmIds(html)
  const fbqCalls = extractFbqCalls(html)
  const scriptCount = countScriptTags(html)
  const gtmFound = html.includes("googletagmanager.com/gtm.js") || gtmIds.length > 0
  const pixelFound = pixelIds.length > 0 || html.includes("connect.facebook.net")
  const duplicatePixel = pixelIds.length > 1

  const expectedPixelIdMatch =
    expectedPixelId === null
      ? null
      : pixelIds.includes(expectedPixelId)

  const issues = detectStaticIssues(html, pixelIds, expectedPixelId)

  if (duplicatePixel) {
    issues.push(
      `Se detectaron múltiples Pixel IDs (${pixelIds.join(", ")}). Esto puede causar duplicación de eventos.`
    )
  }

  return {
    url,
    scannedAt,
    pixelFound,
    pixelIds,
    expectedPixelIdMatch,
    gtmFound,
    gtmIds,
    fbqCalls,
    duplicatePixel,
    scriptCount,
    issues,
    limitations: STATIC_LIMITATIONS,
  }
}
