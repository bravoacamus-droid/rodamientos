import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * Next carga los .env desde la raíz de la app, y aquí las credenciales viven
 * en la raíz del monorepo: es el mismo archivo que usan `pnpm db:aplicar` y
 * `pnpm db:tipos`, y duplicar secretos en dos sitios termina en que uno de los
 * dos queda desactualizado.
 *
 * Las variables ya presentes en el entorno ganan, para que Vercel y CI —que
 * las inyectan de verdad— no queden pisados por un archivo local.
 */
function cargarEnvDeLaRaiz() {
  const ruta = join(process.cwd(), "..", "..", ".env.local");
  if (!existsSync(ruta)) return;

  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const igual = limpia.indexOf("=");
    if (igual === -1) continue;
    const clave = limpia.slice(0, igual).trim();
    let valor = limpia.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (valor && !(clave in process.env)) process.env[clave] = valor;
  }
}

cargarEnvDeLaRaiz();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  /**
   * `dev` y `build` escriben en directorios distintos.
   *
   * Comparten `.next` por defecto, y entonces correr `pnpm build` con el
   * servidor de desarrollo encendido deja un directorio mezclado: dev sigue
   * pidiendo chunks que el build acaba de reemplazar y revienta con
   * "Cannot find module './551.js'".
   *
   * `next start` corre con NODE_ENV=production, así que lee `.next`, que es
   * lo que Vercel espera. No cambia nada del despliegue.
   */
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  /**
   * Next inlina las NEXT_PUBLIC_* leyendo su propio cargador de .env, que
   * corre ANTES que este archivo. Como las cargamos nosotros arriba, hay que
   * declararlas aquí explícitamente o no llegarían al bundle del navegador.
   */
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },

  /**
   * Los paquetes del workspace se publican como TypeScript sin compilar
   * (main apunta a src/index.ts), así que Next tiene que transpilarlos él.
   */
  transpilePackages: [
    "@rodatech/config",
    "@rodatech/consultas",
    "@rodatech/db",
    "@rodatech/sunat",
    "@rodatech/ui",
  ],

  experimental: {
    /**
     * `@rodatech/ui` es lo importante de esta lista: sin él, importar tres
     * componentes desde el barrel arrastra Radix, cmdk, TanStack Table y
     * react-day-picker enteros. Con él, el login pasó de 280 kB a lo que
     * de verdad usa.
     */
    optimizePackageImports: [
      "@rodatech/ui",
      "lucide-react",
      "recharts",
      "date-fns",
    ],
  },

  /**
   * El conector SUNAT firma XML con node-forge y xml-crypto, que dependen de
   * módulos nativos de Node. No deben entrar al bundle de los Server
   * Components; se resuelven en tiempo de ejecución.
   */
  serverExternalPackages: [
    "node-forge",
    "xml-crypto",
    "@xmldom/xmldom",
    "jszip",
    // Casi un mega, y solo lo usa el importador dentro de una Server Action.
    // Fuera del empaquetado: se resuelve en Node en tiempo de ejecución y no
    // engorda ningún chunk.
    "exceljs",
  ],

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
