import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"

function getKeyForVersion(version: number): Buffer {
  const envKey = version === 1
    ? process.env.ENCRYPTION_KEY
    : process.env[`ENCRYPTION_KEY_${version}`]
  const envName = version === 1 ? "ENCRYPTION_KEY" : `ENCRYPTION_KEY_${version}`
  if (!envKey) throw new Error(`${envName} is not set`)
  if (envKey.length !== 64) throw new Error(`${envName} must be 64 hex characters (32 bytes)`)
  return Buffer.from(envKey, "hex")
}

function currentKeyVersion(): number {
  const v = process.env.ENCRYPTION_KEY_VERSION
  if (!v) return 1
  const parsed = parseInt(v, 10)
  return isNaN(parsed) || parsed < 1 ? 1 : parsed
}

// ─── Legacy format: iv:tag:ciphertext ────────────────────────────────────────
// Kept for backward-compat with tokens already stored in the DB.
// New code should use encryptTokenVersioned / decryptTokenVersioned.

export function encryptToken(plaintext: string): string {
  const key = getKeyForVersion(1)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decryptToken(ciphertext: string): string {
  const key = getKeyForVersion(1)
  const [ivHex, tagHex, dataHex] = ciphertext.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const data = Buffer.from(dataHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}

// ─── Versioned format: v{n}:iv:tag:ciphertext ─────────────────────────────────
// keyVersion stored alongside the ciphertext in DB (meta_connections.key_version).
// Rotation: set ENCRYPTION_KEY_VERSION=2, add ENCRYPTION_KEY_2=<new-64-hex>.
// Existing rows keep decrypting with their stored keyVersion until re-encrypted.

export function encryptTokenVersioned(plaintext: string): { ciphertext: string; keyVersion: number } {
  const version = currentKeyVersion()
  const key = getKeyForVersion(version)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: `v${version}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`,
    keyVersion: version,
  }
}

export function decryptTokenVersioned(ciphertext: string): string {
  // Versioned format: starts with "v" + digits + ":"
  if (/^v\d+:/.test(ciphertext)) {
    const colonIdx = ciphertext.indexOf(":")
    const version = parseInt(ciphertext.slice(1, colonIdx), 10)
    const rest = ciphertext.slice(colonIdx + 1)
    const key = getKeyForVersion(version)
    const [ivHex, tagHex, dataHex] = rest.split(":")
    const iv = Buffer.from(ivHex, "hex")
    const tag = Buffer.from(tagHex, "hex")
    const data = Buffer.from(dataHex, "hex")
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
  }
  // Legacy format fallback (tokens stored before versioning)
  return decryptToken(ciphertext)
}
