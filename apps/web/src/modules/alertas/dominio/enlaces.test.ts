/**
 * Centinela: las rutas que guarda `generar_alertas()` tienen que existir.
 *
 * Una alerta es el gesto de «entérate y ve a arreglarlo». Si el enlace lleva a
 * un 404, la alerta miente, y además miente de la peor manera: solo se descubre
 * cuando alguien la necesita.
 *
 * No es hipotético. Antes de la migración 021, `generar_alertas()` guardaba
 * `/inventario/productos/{id}`, `/inventario/ajustes` y `/cobranzas/{id}`, y
 * ninguna de las tres existía — o sea que tres de los siete tipos de alerta que
 * se generan no llevaban a ninguna parte. Nadie lo había notado porque nadie
 * había abierto la bandeja todavía.
 *
 * El acoplamiento es real: el texto de la ruta vive en PL/pgSQL y el directorio
 * que la sirve vive en `apps/web/src/app/(erp)`. Nada del compilador une esas
 * dos cosas. Esto sí.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Sube hasta el directorio que tiene `pnpm-workspace.yaml`. */
function raizDelRepo(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const padre = dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  throw new Error("No se encontró la raíz del monorepo.");
}

const RAIZ = raizDelRepo();
const RUTAS_APP = join(RAIZ, "apps", "web", "src", "app", "(erp)");

/**
 * Todas las rutas internas que aparecen como literal en las migraciones de
 * alertas.
 *
 * Se leen del SQL en lugar de escribirlas aquí a mano: una lista copiada se
 * queda vieja en cuanto alguien añade un tipo de alerta, que es exactamente el
 * fallo que esta prueba existe para atrapar.
 *
 * Convención que aprovecha el formato del SQL: si el literal termina en `/` es
 * porque le concatenan un id (`'/productos/' || p.id`), así que la ruta es
 * dinámica y tiene que haber un `[id]`. Si no termina en `/`, es una pantalla
 * fija.
 */
function rutasDeclaradas(archivo: string): string[] {
  const sql = readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8");

  // Solo dentro de las sentencias que rellenan alertas: así un comentario que
  // mencione una ruta vieja —como los de la cabecera de la 021, que citan las
  // tres rotas a propósito— no cuenta como declaración.
  const sinComentarios = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  const encontradas = sinComentarios.match(/'(\/[a-z0-9/-]*)'/g) ?? [];
  return [...new Set(encontradas.map((m) => m.slice(1, -1)))];
}

/** ¿Sirve esta ruta alguna `page.tsx`? */
function existeLaPagina(ruta: string): boolean {
  const dinamica = ruta.endsWith("/");
  const segmentos = ruta.split("/").filter(Boolean);

  let dir = RUTAS_APP;
  for (const s of segmentos) {
    dir = join(dir, s);
    if (!existsSync(dir)) return false;
  }

  if (!dinamica) return existsSync(join(dir, "page.tsx"));

  // Un segmento dinámico se llama `[algo]`; el nombre exacto da igual.
  return readdirSync(dir).some(
    (hijo) =>
      hijo.startsWith("[") &&
      hijo.endsWith("]") &&
      existsSync(join(dir, hijo, "page.tsx")),
  );
}

describe("los enlaces de las alertas", () => {
  const rutas = rutasDeclaradas("021_alertas.sql");

  it("declara al menos una ruta por cada familia de alerta", () => {
    // Si el regex deja de encontrarlas, la prueba pasaría en vacío y no
    // vigilaría nada. Cinco es lo que hay hoy: productos, ajuste, facturación,
    // clientes y cotizaciones.
    expect(rutas.length).toBeGreaterThanOrEqual(5);
  });

  it.each(rutas)("«%s» corresponde a una pantalla que existe", (ruta) => {
    expect(existeLaPagina(ruta)).toBe(true);
  });

  it("no ha vuelto a colarse ninguna de las tres rutas que estaban rotas", () => {
    // Se nombran una a una porque son plausibles: cualquiera que edite el SQL
    // mirando el módulo de inventario escribiría `/inventario/productos/` otra
    // vez sin pensarlo.
    for (const rota of ["/inventario/productos/", "/inventario/ajustes", "/cobranzas/"]) {
      expect(rutas).not.toContain(rota);
    }
  });
});
