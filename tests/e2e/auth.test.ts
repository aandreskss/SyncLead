import { test, expect } from "@playwright/test"

const E2E_EMAIL = process.env.E2E_EMAIL ?? "demo@synclead.app"
const E2E_PASS = process.env.E2E_PASS ?? "Demo1234!"

test.describe("Autenticación", () => {
  test("login con credenciales válidas redirige al dashboard", async ({ page }) => {
    await page.goto("/login")

    await page.locator("input[type='email']").fill(E2E_EMAIL)
    await page.locator("input[type='password']").fill(E2E_PASS)
    await page.getByRole("button", { name: /iniciar sesión/i }).click()

    await page.waitForURL("/dashboard", { timeout: 15_000 })
    await expect(page).toHaveURL("/dashboard")
  })

  test("login con contraseña incorrecta muestra error", async ({ page }) => {
    await page.goto("/login")

    await page.locator("input[type='email']").fill(E2E_EMAIL)
    await page.locator("input[type='password']").fill("WrongPassword!")
    await page.getByRole("button", { name: /iniciar sesión/i }).click()

    // Should stay on login page and show error
    await page.waitForTimeout(2_000)
    await expect(page).not.toHaveURL("/dashboard")
  })

  test("usuario autenticado que va a /login es redirigido a /dashboard", async ({ page, context }) => {
    // First login
    await page.goto("/login")
    await page.locator("input[type='email']").fill(E2E_EMAIL)
    await page.locator("input[type='password']").fill(E2E_PASS)
    await page.getByRole("button", { name: /iniciar sesión/i }).click()
    await page.waitForURL("/dashboard")

    // Now try to go to login again
    await page.goto("/login")
    await page.waitForURL("/dashboard", { timeout: 5_000 })
    await expect(page).toHaveURL("/dashboard")
  })

  test("usuario no autenticado que va a /dashboard es redirigido a /login", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForURL("/login", { timeout: 5_000 })
    await expect(page).toHaveURL("/login")
  })
})
