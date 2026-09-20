import { describe, it, expect } from "vitest"
import { normalizePhone, calculateTemperature, normalizeCity } from "@/domains/leads/normalize"

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

describe("calculateTemperature", () => {
  it("hot cuando negocio=true y ciudad capital (Caracas)", () => {
    expect(calculateTemperature(true, "Caracas")).toBe("hot")
  })

  it("hot cuando negocio=true y ciudad capital (Maracaibo)", () => {
    expect(calculateTemperature(true, "Maracaibo")).toBe("hot")
  })

  it("hot cuando negocio=true y ciudad capital (Valencia)", () => {
    expect(calculateTemperature(true, "Valencia")).toBe("hot")
  })

  it("hot con capitalización mixta", () => {
    expect(calculateTemperature(true, "CARACAS")).toBe("hot")
  })

  it("hot con ciudad que contiene 'caracas' como substring", () => {
    expect(calculateTemperature(true, "Gran Caracas")).toBe("hot")
  })

  it("warm cuando negocio=true y ciudad NO capital", () => {
    expect(calculateTemperature(true, "Tucupita")).toBe("warm")
  })

  it("warm cuando negocio=true y ciudad desconocida", () => {
    expect(calculateTemperature(true, "San Fernando")).toBe("warm")
  })

  it("cold cuando negocio=false aunque sea capital", () => {
    expect(calculateTemperature(false, "Caracas")).toBe("cold")
  })

  it("cold cuando negocio=false y ciudad aleatoria", () => {
    expect(calculateTemperature(false, "Guanare")).toBe("cold")
  })

  it("cold cuando ciudad es vacía", () => {
    expect(calculateTemperature(false, "")).toBe("cold")
  })

  it("hot con Barquisimeto", () => {
    expect(calculateTemperature(true, "Barquisimeto")).toBe("hot")
  })

  it("hot con Maracay", () => {
    expect(calculateTemperature(true, "Maracay")).toBe("hot")
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
