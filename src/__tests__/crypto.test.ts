import { describe, it, expect, beforeAll, afterAll } from "vitest"

const TEST_KEY = "a".repeat(64)
const TEST_KEY_2 = "b".repeat(64)

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY
  process.env.ENCRYPTION_KEY_VERSION = "1"
})

afterAll(() => {
  delete process.env.ENCRYPTION_KEY
  delete process.env.ENCRYPTION_KEY_VERSION
  delete process.env.ENCRYPTION_KEY_2
})

const { encryptToken, decryptToken, encryptTokenVersioned, decryptTokenVersioned } =
  await import("@/lib/crypto")

describe("encryptToken / decryptToken (legacy)", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const original = "EAAFakeMetaAccessToken1234567890"
    const ciphertext = encryptToken(original)
    expect(decryptToken(ciphertext)).toBe(original)
  })

  it("produce ciphertext diferente en cada llamada (IV aleatorio)", () => {
    const token = "SameTokenEverytime"
    const ct1 = encryptToken(token)
    const ct2 = encryptToken(token)
    expect(ct1).not.toBe(ct2)
  })

  it("ciphertext tiene formato iv:tag:data", () => {
    const ct = encryptToken("test")
    const parts = ct.split(":")
    expect(parts).toHaveLength(3)
    // IV = 12 bytes → 24 hex chars
    expect(parts[0]).toHaveLength(24)
    // tag = 16 bytes → 32 hex chars
    expect(parts[1]).toHaveLength(32)
    expect(parts[2].length).toBeGreaterThan(0)
  })

  it("round-trip con token que contiene caracteres especiales", () => {
    const special = "EAABcde|fgh!ijklmno$pqrst uvwxyz=0987654321"
    expect(decryptToken(encryptToken(special))).toBe(special)
  })

  it("round-trip con string muy largo", () => {
    const long = "A".repeat(1024)
    expect(decryptToken(encryptToken(long))).toBe(long)
  })

  it("lanza error si ENCRYPTION_KEY no está configurada", () => {
    const savedKey = process.env.ENCRYPTION_KEY
    delete process.env.ENCRYPTION_KEY
    expect(() => encryptToken("test")).toThrow("ENCRYPTION_KEY")
    process.env.ENCRYPTION_KEY = savedKey
  })

  it("lanza error si ENCRYPTION_KEY tiene longitud incorrecta", () => {
    const savedKey = process.env.ENCRYPTION_KEY
    process.env.ENCRYPTION_KEY = "tooshort"
    expect(() => encryptToken("test")).toThrow("64 hex")
    process.env.ENCRYPTION_KEY = savedKey
  })

  it("lanza error si el auth tag fue manipulado", () => {
    const ct = encryptToken("sensitive-token")
    const parts = ct.split(":")
    // Flip first byte of tag
    parts[1] = (parseInt(parts[1].slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, "0") + parts[1].slice(2)
    expect(() => decryptToken(parts.join(":"))).toThrow()
  })

  it("lanza error si se usa la clave incorrecta", () => {
    const ct = encryptToken("secret-data")
    // Swap key to wrong value
    const savedKey = process.env.ENCRYPTION_KEY
    process.env.ENCRYPTION_KEY = TEST_KEY_2
    expect(() => decryptToken(ct)).toThrow()
    process.env.ENCRYPTION_KEY = savedKey
  })

  it("el ciphertext no contiene el plaintext", () => {
    const secret = "EAAG_real_access_token_12345"
    const ct = encryptToken(secret)
    expect(ct).not.toContain(secret)
    expect(ct).not.toContain("EAAG")
  })
})

describe("encryptTokenVersioned / decryptTokenVersioned", () => {
  it("round-trip versioned format", () => {
    const original = "EAAVersionedToken"
    const { ciphertext } = encryptTokenVersioned(original)
    expect(decryptTokenVersioned(ciphertext)).toBe(original)
  })

  it("ciphertext tiene formato v{n}:iv:tag:data", () => {
    const { ciphertext, keyVersion } = encryptTokenVersioned("test")
    expect(ciphertext).toMatch(/^v\d+:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/)
    expect(keyVersion).toBe(1)
  })

  it("keyVersion refleja ENCRYPTION_KEY_VERSION", () => {
    const { keyVersion } = encryptTokenVersioned("test")
    expect(keyVersion).toBe(parseInt(process.env.ENCRYPTION_KEY_VERSION ?? "1", 10))
  })

  it("decryptTokenVersioned acepta formato legacy (sin prefijo v)", () => {
    // Legacy tokens in DB: iv:tag:ciphertext
    const legacy = encryptToken("legacy-value")
    expect(decryptTokenVersioned(legacy)).toBe("legacy-value")
  })

  it("soporte de rotación de clave: version 2", () => {
    process.env.ENCRYPTION_KEY_2 = TEST_KEY_2
    process.env.ENCRYPTION_KEY_VERSION = "2"

    const { ciphertext, keyVersion } = encryptTokenVersioned("v2-secret")
    expect(keyVersion).toBe(2)
    expect(ciphertext.startsWith("v2:")).toBe(true)
    expect(decryptTokenVersioned(ciphertext)).toBe("v2-secret")

    // Reset to version 1
    process.env.ENCRYPTION_KEY_VERSION = "1"
    delete process.env.ENCRYPTION_KEY_2
  })

  it("tokens v1 aún desencriptan después de rotar a v2", () => {
    const { ciphertext: v1ct } = encryptTokenVersioned("v1-original")
    expect(v1ct.startsWith("v1:")).toBe(true)

    process.env.ENCRYPTION_KEY_2 = TEST_KEY_2
    process.env.ENCRYPTION_KEY_VERSION = "2"

    // v1 token still decrypts with ENCRYPTION_KEY
    expect(decryptTokenVersioned(v1ct)).toBe("v1-original")

    process.env.ENCRYPTION_KEY_VERSION = "1"
    delete process.env.ENCRYPTION_KEY_2
  })

  it("lanza error si el auth tag fue manipulado (versioned)", () => {
    const { ciphertext } = encryptTokenVersioned("secure")
    // Format: v1:iv:tag:data — tag is parts[2]
    const parts = ciphertext.split(":")
    parts[2] = (parseInt(parts[2].slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, "0") + parts[2].slice(2)
    expect(() => decryptTokenVersioned(parts.join(":"))).toThrow()
  })

  it("el ciphertext versionado no contiene el plaintext", () => {
    const secret = "EAAG_meta_token_no_debe_estar"
    const { ciphertext } = encryptTokenVersioned(secret)
    expect(ciphertext).not.toContain(secret)
    expect(ciphertext).not.toContain("EAAG")
    // keyVersion is safe to include (numeric, no PII)
  })
})
