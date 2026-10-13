import { describe, it, expect } from "vitest"
import { normalizePhone, normalizeCity } from "@/domains/leads/normalize"

describe("normalizePhone", () => {
  it("convierte número venezolano con 0 inicial al formato internacional", () => {
    expect(normalizePhone("04121234567")).toBe("584121234567")
  })

  it("limpia guiones y espacios venezolanos", () => {
    expect(normalizePhone("0412-123-4567")).toBe("584121234567")
  })

  it("limpia paréntesis y espacios", () => {
    expect(normalizePhone("(0412) 123 4567")).toBe("584121234567")
  })

  it("preserva número ya en formato internacional", () => {
    expect(normalizePhone("584121234567")).toBe("584121234567")
  })

  it("maneja número colombiano con +57", () => {
    expect(normalizePhone("+573001234567")).toBe("573001234567")
  })

  it("limpia guiones en número colombiano", () => {
    expect(normalizePhone("+57-300-123-4567")).toBe("573001234567")
  })

  it("maneja número mexicano", () => {
    expect(normalizePhone("+52 55 1234 5678")).toBe("525512345678")
  })

  it("preserva número sin prefijo que no empieza con 0", () => {
    expect(normalizePhone("584161234567")).toBe("584161234567")
  })
})

describe("normalizeCity", () => {
  it("elimina espacios extra al inicio y fin", () => {
    expect(normalizeCity("  Caracas  ")).toBe("Caracas")
  })

  it("preserva el nombre de la ciudad sin modificar mayúsculas", () => {
    expect(normalizeCity("Ciudad Bolívar")).toBe("Ciudad Bolívar")
  })

  it("maneja string vacío", () => {
    expect(normalizeCity("")).toBe("")
  })
})
