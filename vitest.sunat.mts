import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Solo las pruebas que hablan con el ambiente BETA de SUNAT (`*.sunat.ts`).
 *
 * Van aparte de `pnpm test` a propósito: salen a internet, tardan y dependen
 * de que el servidor de pruebas de SUNAT esté de humor. Se corren a mano con
 * `pnpm sunat:beta`. Nunca tocan la base del cliente ni producción.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./pruebas/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.sunat.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 90_000,
    // Una a una: beta se queja si le llegan varias a la vez del mismo RUC.
    fileParallelism: false,
  },
});
