import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Ver pruebas/server-only.ts: el paquete real solo existe dentro del
      // empaquetado de Next.
      "server-only": fileURLToPath(new URL("./pruebas/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Los 5 s por defecto se quedaban cortos SOLO en frío. `importacion/api/
    // hoja.test.ts` abre con exceljs la plantilla .xlsx de verdad: 0,8 s con la
    // caché de vite caliente, 7,2 s la primera vez. En local casi nunca falla;
    // en CI siempre es la primera vez, así que ahí el rojo era cuestión de
    // suerte. Subirlo no tapa nada: el test que de verdad se cuelgue sigue
    // cayendo, solo que 15 s después.
    testTimeout: 20_000,
    // `e2e/**/*.test.ts` son las piezas PURAS de las pruebas de punta a punta
    // —hoy, la guardia que impide correrlas contra la base del cliente—. Corren
    // aquí a propósito: es lógica sin navegador, y así se entera de que la ha
    // roto quien la rompa, no quien lance Playwright tres días después.
    //
    // Los ficheros de Playwright son `*.spec.ts` y `*.preparacion.ts`, así que
    // este patrón no los toca. Si se colaran, vitest intentaría ejecutarlos sin
    // navegador y fallarían por un motivo que no tiene nada que ver.
    include: [
      "packages/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
      "e2e/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "apps/demo/**",
      // Los scripts que emiten contra el ambiente beta REAL de SUNAT viven
      // aparte y no corren en CI: emiten comprobantes de verdad.
      "**/*.sunat.ts",
    ],
    reporters: ["default"],
  },
});
