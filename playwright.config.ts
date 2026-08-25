import { defineConfig, devices } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:4005";

export default defineConfig({
  testDir: "./e2e",
  // Los flujos del ERP mutan datos compartidos (stock, correlativos), así que
  // no pueden correr en paralelo entre sí sin pisarse.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html"]] : [["list"], ["html"]],

  use: {
    baseURL: BASE,
    locale: "es-PE",
    timezoneId: "America/Lima",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Inicia sesión una vez y guarda el estado; el resto lo reutiliza en vez
    // de pasar por el login en cada prueba.
    { name: "preparacion", testMatch: /.*\.preparacion\.ts/ },
    {
      name: "escritorio",
      // Solo los `.spec.ts`. En `e2e/` conviven dos clases de archivo: estos,
      // que necesitan navegador, y los `.test.ts` de vitest —hoy la guardia que
      // impide correr contra la base del cliente—, que son lógica pura. Sin
      // este filtro, Playwright intenta ejecutar los de vitest y revienta con
      // «Vitest cannot be imported in a CommonJS module», que no dice nada
      // sobre el problema real.
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/usuario.json" },
      dependencies: ["preparacion"],
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @rodatech/web dev",
        url: BASE,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
