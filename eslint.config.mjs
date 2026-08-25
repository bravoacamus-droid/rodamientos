import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

/**
 * Configuración de ESLint para el monorepo.
 *
 * Va en la RAÍZ y no dentro de `apps/web` porque también tiene que mirar
 * `packages/` y `e2e/`: los errores que de verdad importan —una variable sin
 * usar en un cálculo de dinero, un `await` olvidado— salen igual de bien en un
 * paquete que en una página.
 *
 * `next lint` quedó obsoleto en Next 15: al ejecutarlo abre un asistente
 * interactivo, y en CI eso es un proceso colgado hasta que salta el tiempo de
 * espera. Por eso el script llama directamente a `eslint`.
 *
 * `FlatCompat` traduce la configuración clásica de `eslint-config-next` al
 * formato plano de ESLint 9. Es el puente oficial mientras Next no publique
 * una configuración plana propia; el día que lo haga, esto se sustituye por un
 * import y ya.
 */
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    /**
     * Lo que ESLint NO debe mirar.
     *
     * `apps/demo` es la aplicación vieja que se conserva como referencia de lo
     * que NO hay que hacer: tiene un componente de 974 líneas y arreglarlo no
     * aporta nada, porque va a desaparecer.
     */
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.next-dev/**",
      "**/dist/**",
      "**/build/**",
      "apps/demo/**",
      "playwright-report/**",
      "test-results/**",
      "packages/db/src/tipos.generados.ts",
      // Lo escribe `next dev` en cada arranque; editarlo no sirve de nada.
      "**/next-env.d.ts",
    ],
  },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      /**
       * Un parámetro sin usar se marca, salvo que empiece por `_`.
       *
       * Hace falta la excepción porque las Server Actions de React reciben el
       * estado previo como primer argumento y casi ninguna lo usa: se llaman
       * `_previo` a propósito, y sin esta regla serían dieciséis avisos que
       * enseñan a ignorar la salida de lint.
       */
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      /**
       * `any` es un aviso, no un error.
       *
       * Aparece de forma legítima al desenvolver lo que devuelve PostgREST,
       * que llega sin tipar y se acota justo después con un `as`. Ponerlo en
       * error obligaría a silenciarlo caso por caso, y una regla que se
       * silencia constantemente deja de leerse.
       */
      "@typescript-eslint/no-explicit-any": "warn",

      /**
       * Esta regla busca un directorio `pages/` para saber qué rutas existen y
       * avisar de un `<a>` donde debería ir un `<Link>`. Aquí no lo hay: la
       * aplicación es App Router y vive en `apps/web/src/app`. Sin encontrarlo
       * no puede comprobar nada y solo imprime una queja en cada ejecución,
       * que es justo el ruido que hace que nadie lea la salida de lint.
       */
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  {
    /**
     * Las pruebas pueden hacer cosas que el código de producción no.
     *
     * Un `!` para afirmar que un elemento existe es normal cuando la propia
     * prueba acaba de construir la lista.
     */
    files: ["**/*.test.ts", "**/*.spec.ts", "e2e/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];

export default config;
