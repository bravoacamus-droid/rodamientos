import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ETIQUETA_CAMPO,
  ETIQUETA_ENTIDAD,
  describir,
  enlaceDe,
  limitesDelDiaEnLima,
  referenciaDe,
  textoDeBusqueda,
  type Movimiento,
} from "./tipos";

/**
 * La bitácora se lee el día que hay un problema, y quien la lee no es
 * programador: si dice `linea_credito` en vez de «Línea de crédito», o lleva a
 * una página que no existe, no sirve para lo que se hizo.
 */

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

/**
 * Los campos que vigila algún disparador, sacados de las migraciones: los
 * argumentos de `tg_bitacora('a', 'b')` y la lista `array['tabla', 'a,b']` de
 * la 051, que los pasaba de otra forma.
 */
function camposVigilados(): string[] {
  const campos = new Set<string>();
  for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRACIONES, archivo), "utf8");
    for (const m of sql.matchAll(/tg_bitacora\(([^)]*)\)/g)) {
      for (const c of m[1]!.matchAll(/'([a-z_]+)'/g)) campos.add(c[1]!);
    }
    // Solo en la 051: otras migraciones tienen arrays de dos textos que no
    // son de la bitácora.
    if (archivo.startsWith("051_")) {
      for (const m of sql.matchAll(/array\['[a-z_]+',\s*'([a-z_,]+)'\]/g)) {
        for (const c of m[1]!.split(",")) campos.add(c.trim());
      }
    }
  }
  return [...campos].sort();
}

/** ¿`/facturacion/{id}` tiene un `page.tsx` detrás? */
function laRutaExiste(ruta: string): boolean {
  let dir = RUTAS_APP;
  for (const parte of ruta.split("/").filter(Boolean)) {
    if (!existsSync(dir)) return false;
    const hijos = readdirSync(dir);
    const dinamico = hijos.find((h) => h.startsWith("[") && h.endsWith("]"));
    const exacto = hijos.find((h) => h === parte);
    const elegido = exacto ?? (parte.length > 8 ? dinamico : undefined);
    if (!elegido) return false;
    dir = join(dir, elegido);
  }
  return existsSync(join(dir, "page.tsx"));
}

describe("describir", () => {
  it("traduce el nombre del campo y el monto sale con dos decimales", () => {
    expect(describir("linea_credito: 0.00 → 5000")).toBe("Línea de crédito: 0.00 → 5,000.00");
  });

  it("traduce varios cambios de una vez", () => {
    expect(describir("dias_credito: 30 → 45 · total: 1234.5 → 1300")).toBe(
      "Días de crédito: 30 → 45 · Total: 1,234.50 → 1,300.00",
    );
  });

  it("los sí/no no salen como true/false", () => {
    expect(describir("predeterminada: false → true")).toBe("Predeterminada: no → sí");
    expect(describir("bloqueado: true → false")).toBe("Bloqueado: sí → no");
  });

  it("dar de baja y anular se dicen con una frase", () => {
    expect(describir("activo: true → false")).toBe("Lo dio de baja");
    expect(describir("activo: false → true")).toBe("Lo reactivó");
    expect(describir("anulada: false → true")).toBe("La anuló");
    expect(describir("anulado: false → true")).toBe("Lo anuló");
  });

  it("los estados y los roles con su nombre, no con la clave", () => {
    expect(describir("estado: enviada → aprobada")).toBe("Estado: Enviada → Aprobada");
    expect(describir("estado: emitido → anulado")).toBe("Estado: Emitido → Anulado");
    expect(describir("estado_sunat: no_enviado → aceptado")).toBe("Estado en SUNAT: Sin enviar → Aceptado");
    expect(describir("rol: admin → almacen")).toBe("Rol: Administración → Almacén");
  });

  it("un cobro dice cuánto y cómo", () => {
    expect(describir("monto: 1.50 · medio: efectivo")).toBe("Monto: 1.50 · Forma de pago: Efectivo");
  });

  it("el inicial de una serie y las fechas se leen", () => {
    expect(describir("correlativo_inicial: 1 → 2")).toBe("Empieza en el número: 1 → 2");
    expect(describir("certificado_caduca_en: — → 2026-11-30T00:00:00+00:00")).toBe(
      "El certificado vence el: — → 30/11/2026",
    );
  });

  it("un valor suelto (la ida y vuelta juntada en la ficha) también", () => {
    expect(describir("total: 161.16")).toBe("Total: 161.16");
  });

  it("un campo que no conoce sale con su nombre técnico, no inventado", () => {
    expect(describir("campo_nuevo: a → b")).toBe("campo_nuevo: a → b");
  });

  it("los textos sin dos puntos pasan tal cual", () => {
    expect(describir("Se creó")).toBe("Se creó");
    expect(describir("Gerencia · Cotizaciones: ver concedido")).toBe("Gerencia · Cotizaciones: ver concedido");
  });

  it("sin descripción no revienta", () => {
    expect(describir(null)).toBe("—");
  });
});

describe("las etiquetas de campo", () => {
  it("todos los campos que vigila algún disparador tienen nombre", () => {
    const vigilados = camposVigilados();
    // Que la lectura funcione: si el regex dejara de casar, pasaría vacía.
    expect(vigilados.length).toBeGreaterThan(30);
    const sinNombre = vigilados.filter((c) => !ETIQUETA_CAMPO[c]);
    expect(
      sinNombre,
      `Estos campos los vigila tg_bitacora y saldrían con su nombre técnico: ${sinNombre.join(", ")}`,
    ).toEqual([]);
  });
});

describe("enlaceDe", () => {
  const id = "6f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b";

  it("lleva a la ficha de los que tienen una", () => {
    expect(enlaceDe("comprobantes", "abc")).toBe("/facturacion/abc");
    expect(enlaceDe("compras", "abc")).toBe("/compras/abc");
    expect(enlaceDe("pedidos", "abc")).toBe("/pedidos/abc");
    expect(enlaceDe("guias_remision", "abc")).toBe("/guias/abc");
    expect(enlaceDe("ajustes_inventario", "abc")).toBe("/inventario/ajustes/abc");
  });

  it("un borrado no enlaza: lo que se borró ya no existe", () => {
    expect(enlaceDe("compras", "abc", { accion: "borrado" })).toBeNull();
  });

  it("un cobro lleva a su factura, también si se borró", () => {
    expect(enlaceDe("pagos", "p", { comprobanteId: "f" })).toBe("/facturacion/f");
    expect(enlaceDe("pagos", "p", { accion: "borrado", comprobanteId: "f" })).toBe("/facturacion/f");
    expect(enlaceDe("pagos", "p")).toBeNull();
  });

  it("sin id tampoco hay enlace a una ficha", () => {
    expect(enlaceDe("comprobantes", null)).toBeNull();
  });

  it("cada ruta que devuelve tiene su page.tsx", () => {
    const rotas: string[] = [];
    for (const entidad of Object.keys(ETIQUETA_ENTIDAD)) {
      const ruta = enlaceDe(entidad, id, { comprobanteId: id });
      if (ruta && !laRutaExiste(ruta)) rotas.push(`${entidad} → ${ruta}`);
    }
    expect(rotas, `Enlaces de la bitácora a pantallas que no existen: ${rotas.join(", ")}`).toEqual([]);
  });
});

describe("referenciaDe", () => {
  const base: Movimiento = {
    id: 1,
    usuario_nombre: "sistema",
    usuario_id: null,
    accion: "borrado",
    entidad: "compras",
    entidad_id: "x",
    descripcion: "Se borró",
    creado_en: "2026-10-20T12:00:00Z",
  };

  it("usa la de la base si la hay", () => {
    expect(referenciaDe({ ...base, referencia: "CMP-26-00016" })).toBe("CMP-26-00016");
  });

  it("sin ella, un borrado la saca de lo que se borró", () => {
    expect(referenciaDe({ ...base, metadata: { antes: { numero: "CMP-26-00010" } } })).toBe("CMP-26-00010");
  });

  it("un cambio sin referencia no se inventa una", () => {
    expect(referenciaDe({ ...base, accion: "cambiado", metadata: { antes: { numero: "X" } } })).toBeNull();
  });
});

describe("limitesDelDiaEnLima", () => {
  it("una fila a las 21:00 de Lima cae en su día, no en el siguiente", () => {
    // 20/10 a las 21:03 en Lima son las 02:03 del 21 en UTC.
    const fila = Date.parse("2026-10-21T02:03:00Z");
    const del20 = limitesDelDiaEnLima("2026-10-20", "2026-10-20");
    expect(fila).toBeGreaterThanOrEqual(Date.parse(del20.desde!));
    expect(fila).toBeLessThanOrEqual(Date.parse(del20.hasta!));

    const del21 = limitesDelDiaEnLima("2026-10-21", "2026-10-21");
    expect(fila).toBeLessThan(Date.parse(del21.desde!));
  });

  it("una fecha mal escrita no filtra", () => {
    expect(limitesDelDiaEnLima("ayer", undefined)).toEqual({ desde: null, hasta: null });
  });
});

describe("textoDeBusqueda", () => {
  it("quita lo que rompería el filtro", () => {
    expect(textoDeBusqueda(" PED-26-00014 ")).toBe("PED-26-00014");
    expect(textoDeBusqueda("a,b)(c%*")).toBe("a b c");
    expect(textoDeBusqueda("   ")).toBeNull();
  });
});

describe("las etiquetas", () => {
  it("todas las entidades vigiladas tienen nombre en castellano", () => {
    for (const t of [
      "comprobantes", "cotizaciones", "compras", "recepciones",
      "ajustes_inventario", "permisos_rol", "perfiles", "clientes", "productos",
      // 145
      "permisos", "roles", "cuentas_bancarias", "empresa", "series_documento", "config_sunat",
      // 158
      "pedidos", "guias_remision", "pagos", "sunat_bajas",
    ]) {
      expect(ETIQUETA_ENTIDAD[t]).toBeTruthy();
    }
  });
});
