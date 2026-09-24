import { describe, expect, it } from "vitest";

import {
  AREAS,
  estadoDelArea,
  tablasSinArea,
  type PermisoGuardado,
} from "./permisos";
import type { Rol } from "./tipos";

function fila(tabla: string, rol: Rol, escribir = true): PermisoGuardado {
  return { tabla, rol, escribir };
}

describe("AREAS", () => {
  it("no repite una tabla en dos áreas", () => {
    const vistas = new Map<string, string>();
    for (const area of AREAS) {
      for (const t of area.tablas) {
        expect(vistas.has(t), `${t} está en ${vistas.get(t)} y en ${area.clave}`).toBe(
          false,
        );
        vistas.set(t, area.clave);
      }
    }
  });

  it("no repite una clave de área", () => {
    const claves = AREAS.map((a) => a.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  /*
    La primera regla del proyecto: nada de jerga. Si un día alguien añade un
    área llamada «comprobante_cuotas», esto se cae.
  */
  it("ninguna etiqueta es un nombre de tabla", () => {
    for (const area of AREAS) {
      expect(area.etiqueta).not.toMatch(/_/);
      expect(area.etiqueta[0]).toBe(area.etiqueta[0]?.toUpperCase());
    }
  });

  it("toda área explica qué pasa al marcarla", () => {
    for (const area of AREAS) {
      expect(area.ayuda.length, area.clave).toBeGreaterThan(20);
      expect(area.tablas.length, area.clave).toBeGreaterThan(0);
    }
  });
});

describe("estadoDelArea", () => {
  const ventas = AREAS.find((a) => a.clave === "ventas")!;

  it("sin ninguna fila, el área está en nada", () => {
    expect(estadoDelArea(ventas, "almacen", [])).toBe("nada");
  });

  it("con todas las tablas, está en todo", () => {
    const guardados = ventas.tablas.map((t) => fila(t, "ventas"));
    expect(estadoDelArea(ventas, "ventas", guardados)).toBe("todo");
  });

  /*
    El caso que obliga a que exista el tercer estado: la matriz se sembró
    tabla a tabla y nada garantiza que un área esté entera. Si esto devolviera
    «nada», el primer clic borraría permisos que alguien puso a propósito.
  */
  it("con algunas, está en mezcla", () => {
    const guardados = [fila(ventas.tablas[0]!, "ventas")];
    expect(estadoDelArea(ventas, "ventas", guardados)).toBe("mezcla");
  });

  it("una fila con escribir en false no cuenta", () => {
    const guardados = ventas.tablas.map((t) => fila(t, "ventas", false));
    expect(estadoDelArea(ventas, "ventas", guardados)).toBe("nada");
  });

  it("no se confunde de rol", () => {
    const guardados = ventas.tablas.map((t) => fila(t, "compras"));
    expect(estadoDelArea(ventas, "ventas", guardados)).toBe("nada");
    expect(estadoDelArea(ventas, "compras", guardados)).toBe("todo");
  });
});

describe("tablasSinArea", () => {
  it("hoy no hay ninguna suelta", () => {
    const todas = AREAS.flatMap((a) => a.tablas.map((t) => fila(t, "gerencia")));
    expect(tablasSinArea(todas)).toEqual([]);
  });

  /*
    El día que alguien meta una tabla en la matriz y se olvide de esta
    pantalla, tiene que SALIR en la pantalla. Un permiso invisible es un
    permiso que nadie revisa.
  */
  it("saca la que nadie clasificó, sin repetirla", () => {
    const guardados = [
      fila("tabla_nueva", "ventas"),
      fila("tabla_nueva", "compras"),
      fila("clientes", "ventas"),
    ];
    expect(tablasSinArea(guardados)).toEqual(["tabla_nueva"]);
  });
});
