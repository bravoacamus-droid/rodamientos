import { describe, expect, it } from "vitest";

import { ETIQUETA_ENTIDAD, describir, enlaceDe } from "./tipos";

/**
 * La bitácora se lee el día que hay un problema, y quien la lee no es
 * programador: si dice `linea_credito` en vez de «Línea de crédito», o lleva a
 * una página que no existe, no sirve para lo que se hizo.
 */

describe("describir", () => {
  it("traduce el nombre del campo y deja el resto", () => {
    expect(describir("linea_credito: 0.00 → 5000.00")).toBe(
      "Línea de crédito: 0.00 → 5000.00",
    );
  });

  it("traduce varios cambios de una vez", () => {
    expect(describir("dias_credito: 30 → 45 · linea_credito: 0.00 → 5000.00")).toBe(
      "Días de crédito: 30 → 45 · Línea de crédito: 0.00 → 5000.00",
    );
  });

  it("un campo que no conoce sale con su nombre técnico, no inventado", () => {
    expect(describir("campo_nuevo: a → b")).toBe("campo_nuevo: a → b");
  });

  it("los textos sin dos puntos pasan tal cual", () => {
    expect(describir("Se creó")).toBe("Se creó");
  });

  it("sin descripción no revienta", () => {
    expect(describir(null)).toBe("—");
  });
});

describe("enlaceDe", () => {
  it("lleva a la ficha de los que tienen una", () => {
    expect(enlaceDe("comprobantes", "abc")).toBe("/facturacion/abc");
    expect(enlaceDe("compras", "abc")).toBe("/compras/abc");
  });

  it("los que no tienen ficha NO devuelven enlace", () => {
    // Un enlace roto es peor que ninguno.
    expect(enlaceDe("permisos_rol", "abc")).toBeNull();
    expect(enlaceDe("ajustes_inventario", "abc")).toBeNull();
  });

  it("sin id tampoco hay enlace", () => {
    expect(enlaceDe("comprobantes", null)).toBeNull();
  });
});

describe("las etiquetas", () => {
  it("todas las entidades vigiladas tienen nombre en castellano", () => {
    // La lista es la misma de la migración 051. Una tabla vigilada sin
    // etiqueta saldría con su nombre técnico en la pantalla.
    for (const t of [
      "comprobantes", "cotizaciones", "compras", "recepciones",
      "ajustes_inventario", "permisos_rol", "perfiles", "clientes", "productos",
    ]) {
      expect(ETIQUETA_ENTIDAD[t]).toBeTruthy();
    }
  });
});
