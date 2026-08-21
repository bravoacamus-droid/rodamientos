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
    include: ["packages/**/*.test.ts", "apps/web/src/**/*.test.ts"],
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
