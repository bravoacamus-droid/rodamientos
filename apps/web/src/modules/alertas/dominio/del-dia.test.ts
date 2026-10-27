import { describe, expect, it } from "vitest";

import { resumirDelDia } from "./del-dia";
import { TIPOS_DEL_DIA_A_DIA } from "./tipos";

describe("lo que se está quedando atrás", () => {
  it("sin nada pendiente no hay filas", () => {
    expect(resumirDelDia([])).toEqual([]);
  });

  it("cuenta por tipo, en singular y en plural", () => {
    const filas = resumirDelDia([
      { tipo: "pedido_sin_guia", valor: 10 },
      { tipo: "pedido_sin_guia", valor: 4 },
      { tipo: "guia_sin_facturar", valor: 9 },
    ]);
    expect(filas.map((f) => f.texto)).toEqual(["2 pedidos sin guía", "1 guía sin facturar"]);
    expect(filas[0]?.enlace).toBe("/alertas?tipo=pedido_sin_guia");
  });

  it("las vencidas sin cerrar se cuentan por su valor, y llevan a las cotizaciones enviadas", () => {
    const [fila] = resumirDelDia([{ tipo: "cotizaciones_sin_cerrar", valor: 19 }]);
    expect(fila?.texto).toBe("19 cotizaciones vencidas sin respuesta");
    expect(fila?.enlace).toBe("/cotizaciones?estado=enviada");
  });

  it("va en el orden del flujo, no en el de llegada", () => {
    const filas = resumirDelDia([
      { tipo: "guia_sin_facturar", valor: 1 },
      { tipo: "compra_sin_recibir", valor: 1 },
      { tipo: "cotizacion_borrador", valor: 1 },
    ]);
    expect(filas.map((f) => f.tipo)).toEqual(["cotizacion_borrador", "compra_sin_recibir", "guia_sin_facturar"]);
  });

  it("ignora lo que no es del día a día", () => {
    expect(resumirDelDia([{ tipo: "quiebre_stock", valor: 0 }])).toEqual([]);
  });

  it("cada tipo del día a día tiene su frase", () => {
    const filas = resumirDelDia(TIPOS_DEL_DIA_A_DIA.map((tipo) => ({ tipo, valor: 2 })));
    expect(filas).toHaveLength(TIPOS_DEL_DIA_A_DIA.length);
  });
});
