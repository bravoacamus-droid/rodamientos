/**
 * Centinela: los enlaces del kardex tienen que llevar a una página que existe,
 * y ningún tipo de referencia puede quedarse sin decidir.
 *
 * Dos acoplamientos que nadie más vigila:
 *
 *  1. La cadena de `referencia_tipo` la escribe PL/pgSQL; el mapa está en
 *     TypeScript. Si mañana una función nueva graba `'traspaso'`, aquí no se
 *     enteraría nadie y el kardex enseñaría ese movimiento sin enlace para
 *     siempre. Esta prueba lee las migraciones y lo caza.
 *  2. La ruta que devuelve el mapa tiene que corresponder a un directorio con
 *     su `page.tsx`. Es la misma lección de la migración 021, donde tres de
 *     siete alertas apuntaban a pantallas que no existían.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { enlaceDeReferencia, TIPOS_REFERENCIA } from "./enlaces";

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
const MIGRACIONES = join(RAIZ, "supabase", "migrations");
const RUTAS_APP = join(RAIZ, "apps", "web", "src", "app", "(erp)");

/** Los `referencia_tipo` que las migraciones graban de verdad. */
function tiposQueGrabaLaBase(): string[] {
  const encontrados = new Set<string>();
  for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRACIONES, archivo), "utf8");
    for (const m of sql.matchAll(/'referencia_tipo'\s*,\s*'([a-z_]+)'/g)) {
      encontrados.add(m[1]!);
    }
  }
  return [...encontrados].sort();
}

/** ¿`/facturacion/{id}` tiene un `page.tsx` detrás? */
function laRutaExiste(ruta: string): boolean {
  const partes = ruta.split("/").filter(Boolean);
  let dir = RUTAS_APP;
  for (const parte of partes) {
    if (!existsSync(dir)) return false;
    const hijos = readdirSync(dir);
    // Un segmento que es un id casa con el directorio dinámico `[algo]`.
    const dinamico = hijos.find((h) => h.startsWith("[") && h.endsWith("]"));
    const exacto = hijos.find((h) => h === parte);
    const elegido = exacto ?? (parte.length > 8 ? dinamico : undefined);
    if (!elegido) return false;
    dir = join(dir, elegido);
  }
  return existsSync(join(dir, "page.tsx"));
}

describe("los enlaces del kardex", () => {
  it("contempla TODOS los tipos que la base graba", () => {
    const enLaBase = tiposQueGrabaLaBase();
    // Que la lectura funcione: si el regex dejara de casar, la prueba pasaría
    // vacía y no probaría nada.
    expect(enLaBase.length).toBeGreaterThan(3);

    const sinDecidir = enLaBase.filter(
      (t) => !(TIPOS_REFERENCIA as readonly string[]).includes(t),
    );
    expect(
      sinDecidir,
      `Estos «referencia_tipo» los graba una migración y nadie decidió a dónde ` +
        `enlazan: ${sinDecidir.join(", ")}. Añádelos a TIPOS_REFERENCIA y a ` +
        `enlaceDeReferencia(), aunque sea para devolver null.`,
    ).toEqual([]);
  });

  it("y no sobra ninguno: lo que está en el mapa lo graba la base", () => {
    const enLaBase = tiposQueGrabaLaBase();
    const inventados = TIPOS_REFERENCIA.filter((t) => !enLaBase.includes(t));
    expect(
      inventados,
      `Estos tipos están en el mapa pero ninguna migración los graba: ` +
        `${inventados.join(", ")}. O sobran, o la migración que los escribía se fue.`,
    ).toEqual([]);
  });

  it("cada ruta que devuelve tiene su page.tsx", () => {
    const id = "6f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b";
    const rotas: string[] = [];
    for (const tipo of TIPOS_REFERENCIA) {
      const ruta = enlaceDeReferencia(tipo, id);
      if (ruta && !laRutaExiste(ruta)) rotas.push(`${tipo} → ${ruta}`);
    }
    expect(rotas, `Enlaces del kardex a pantallas que no existen: ${rotas.join(", ")}`)
      .toEqual([]);
  });

  it("sin id no hay enlace, aunque el tipo se conozca", () => {
    expect(enlaceDeReferencia("recepcion", null)).toBeNull();
    expect(enlaceDeReferencia(null, "algo")).toBeNull();
  });

  it("el ajuste y la carga inicial no enlazan, y es a propósito", () => {
    // El ajuste TRAE su id, pero `/inventario/ajuste` es el formulario para
    // hacer uno nuevo: enlazar ahí llevaría a empezar otro.
    expect(enlaceDeReferencia("ajuste", "6f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b")).toBeNull();
    // «importacion» es la carga del Excel, no el módulo de importaciones.
    expect(enlaceDeReferencia("importacion", "6f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b")).toBeNull();
  });

  it("un tipo desconocido no inventa una ruta", () => {
    expect(enlaceDeReferencia("traspaso", "6f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b")).toBeNull();
  });
});
