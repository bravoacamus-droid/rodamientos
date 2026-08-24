import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ningún `var(--x)` puede apuntar a un token que no existe.
 *
 * Esto no es quisquillosería: una variable CSS indefinida NO falla ni avisa.
 * `border-[var(--borde)]` —con la e de más— produce `border-color: var(--borde)`,
 * que el navegador descarta, y el borde cae a `currentColor`. O sea que se
 * pinta del color del TEXTO: negro duro en vez de gris suave.
 *
 * Pasó de verdad, en ocho archivos, y no lo detectó ni el typecheck ni el
 * build ni ninguna prueba. Lo detectó el cliente diciendo «el diseño se ve
 * mal», que es la peor forma de enterarse.
 *
 * Se excluyen las variables que inyecta Radix en tiempo de ejecución
 * (`--radix-*`): no están en nuestro CSS porque las pone el componente al
 * medir el disparador.
 */

const RAIZ = resolve(__dirname, "../../../..");

/** Tokens declarados en la hoja de la marca. */
function declarados(): Set<string> {
  const css = readFileSync(resolve(RAIZ, "packages/ui/src/tokens.css"), "utf8");
  const tokens = new Set(
    [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]!.toLowerCase()),
  );

  // `next/font` declara las suyas sobre el <html>, no en nuestro CSS. Se leen
  // del layout en vez de excluir `--font-*` a lo bruto: así un token de fuente
  // mal escrito se sigue detectando.
  const layout = readFileSync(resolve(RAIZ, "apps/web/src/app/layout.tsx"), "utf8");
  for (const m of layout.matchAll(/variable:\s*["'`](--[a-z0-9-]+)["'`]/gi)) {
    tokens.add(m[1]!.toLowerCase());
  }

  return tokens;
}

/** Archivos de la app y del paquete visual, según git. */
function fuentes(): string[] {
  const salida = execFileSync(
    "git",
    ["ls-files", "apps/web/src", "packages/ui/src"],
    { cwd: RAIZ, encoding: "utf8" },
  );
  return salida
    .split("\n")
    .filter((f) => /\.(tsx?|css)$/.test(f))
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
}

describe("tokens de CSS", () => {
  it("todo var(--x) del código apunta a un token declarado", () => {
    const existentes = declarados();
    const rotos: string[] = [];

    for (const archivo of fuentes()) {
      const texto = readFileSync(resolve(RAIZ, archivo), "utf8");
      for (const uso of texto.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const token = uso[1]!.toLowerCase();
        // Radix las define al vuelo sobre el propio elemento.
        if (token.startsWith("--radix-")) continue;
        // Tailwind expone la escala como --color-*; la clase directa la usa.
        if (existentes.has(token)) continue;
        rotos.push(`${archivo}: ${token}`);
      }
    }

    expect(rotos).toEqual([]);
  });

  it("la hoja de tokens declara lo mínimo que la interfaz da por hecho", () => {
    const existentes = declarados();
    // Si alguno de estos desaparece, media aplicación se queda sin color y
    // solo se nota mirándola.
    for (const token of [
      "--bg", "--surface", "--surface-2", "--border", "--border-soft",
      "--fg", "--fg-muted", "--fg-subtle", "--ring",
      "--ok", "--ok-bg", "--warn", "--warn-bg",
      "--danger", "--danger-bg", "--info", "--info-bg",
    ]) {
      expect(existentes, `falta ${token}`).toContain(token);
    }
  });
});
