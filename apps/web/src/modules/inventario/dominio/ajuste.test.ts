import { describe, expect, it } from "vitest";

import {
  aPayload,
  bloqueos,
  diferenciaDe,
  estadoInicial,
  impactoDe,
  reducir,
  type EstadoConteo,
} from "./ajuste";
import type { ProductoContable } from "./tipos";

const FECHA = "2026-08-24";

const RODAMIENTO: ProductoContable = {
  id: "11111111-1111-4111-8111-111111111111",
  codigo: "6205-2RS1/C3",
  descripcion: "Rodamiento rígido de bolas",
  marca: "SKF",
  subfamilia: "Rodamientos de bolas",
  unidad: "und",
  stock: 35,
  costo_promedio: 3.26,
};

const ANGULAR: ProductoContable = {
  id: "22222222-2222-4222-8222-222222222222",
  codigo: "7210 BEP",
  descripcion: "Rodamiento de contacto angular",
  marca: "SKF",
  subfamilia: "Contacto angular",
  unidad: "und",
  stock: 8,
  costo_promedio: 34.43,
};

function correr(
  inicial: EstadoConteo,
  ...acciones: Parameters<typeof reducir>[1][]
): EstadoConteo {
  return acciones.reduce(reducir, inicial);
}

const conProductos = () =>
  reducir(estadoInicial(FECHA), {
    tipo: "cargar",
    productos: [RODAMIENTO, ANGULAR],
  });

describe("hoja de conteo", () => {
  it("carga los productos con su saldo y sin contar", () => {
    const e = conProductos();

    expect(e.lineas).toHaveLength(2);
    expect(e.lineas[0]?.cantidadSistema).toBe(35);
    // `null` y no 0: no haber contado NO es lo mismo que haber contado cero.
    expect(e.lineas[0]?.cantidadFisica).toBeNull();
  });

  it("conserva lo ya contado al recargar con otro filtro", () => {
    // Perder media estantería contada al cambiar de filtro es de las cosas que
    // hacen que nadie vuelva a usar la pantalla.
    const e = correr(
      conProductos(),
      { tipo: "contar", productoId: RODAMIENTO.id, valor: 30 },
      { tipo: "cargar", productos: [RODAMIENTO, ANGULAR] },
    );

    expect(e.lineas[0]?.cantidadFisica).toBe(30);
    expect(e.lineas[1]?.cantidadFisica).toBeNull();
  });

  it("acepta cero contado, que sí es una afirmación", () => {
    const e = reducir(conProductos(), {
      tipo: "contar",
      productoId: RODAMIENTO.id,
      valor: 0,
    });

    expect(e.lineas[0]?.cantidadFisica).toBe(0);
    expect(diferenciaDe(e.lineas[0]!)).toBe(-35);
  });

  it("un conteo negativo no existe: se recoge a cero", () => {
    const e = reducir(conProductos(), {
      tipo: "contar",
      productoId: RODAMIENTO.id,
      valor: -4,
    });

    expect(e.lineas[0]?.cantidadFisica).toBe(0);
  });

  it("deja borrar un conteo volviendo a sin contar", () => {
    const e = correr(
      conProductos(),
      { tipo: "contar", productoId: RODAMIENTO.id, valor: 30 },
      { tipo: "contar", productoId: RODAMIENTO.id, valor: null },
    );

    expect(e.lineas[0]?.cantidadFisica).toBeNull();
  });

  it("«todo conforme» solo rellena lo que nadie tocó", () => {
    const e = correr(
      conProductos(),
      { tipo: "contar", productoId: RODAMIENTO.id, valor: 30 },
      { tipo: "contarTodoConforme" },
    );

    expect(e.lineas[0]?.cantidadFisica).toBe(30);
    expect(e.lineas[1]?.cantidadFisica).toBe(8);
  });
});

describe("impacto del cuadre", () => {
  it("separa lo que sobra de lo que falta, y lo valora al costo", () => {
    const e = correr(
      conProductos(),
      // Sobran 5 rodamientos a 3.26 = 16.30
      { tipo: "contar", productoId: RODAMIENTO.id, valor: 40 },
      // Faltan 2 angulares a 34.43 = 68.86
      { tipo: "contar", productoId: ANGULAR.id, valor: 6 },
    );
    const i = impactoDe(e);

    expect(i.contadas).toBe(2);
    expect(i.pendientes).toBe(0);
    expect(i.conDiferencia).toBe(2);
    expect(i.unidadesSobran).toBe(5);
    expect(i.unidadesFaltan).toBe(2);
    expect(i.valorSobrante).toBe(16.3);
    expect(i.valorFaltante).toBe(68.86);
    // Negativo: el almacén vale menos de lo que dicen los libros.
    expect(i.impactoNeto).toBe(-52.56);
  });

  it("no cuenta como diferencia lo que cuadra", () => {
    const e = reducir(conProductos(), {
      tipo: "contar",
      productoId: RODAMIENTO.id,
      valor: 35,
    });
    const i = impactoDe(e);

    expect(i.contadas).toBe(1);
    expect(i.conDiferencia).toBe(0);
    expect(i.impactoNeto).toBe(0);
  });

  it("ignora las líneas sin contar", () => {
    const i = impactoDe(conProductos());

    expect(i.contadas).toBe(0);
    expect(i.pendientes).toBe(2);
  });
});

describe("bloqueos", () => {
  it("explica todo lo que falta, no solo lo primero", () => {
    const b = bloqueos(estadoInicial(FECHA));

    expect(b.map((x) => x.campo).sort()).toEqual(["lineas", "motivo"]);
  });

  it("exige un motivo con sustancia", () => {
    // Un ajuste sin explicación es un descuadre que nadie va a poder auditar
    // en tres meses.
    const e = correr(
      conProductos(),
      { tipo: "cabecera", campo: "motivo", valor: "ok" },
      { tipo: "contar", productoId: RODAMIENTO.id, valor: 40 },
    );

    expect(bloqueos(e).map((x) => x.campo)).toEqual(["motivo"]);
  });

  it("no deja confirmar un cuadre en el que todo coincide", () => {
    const e = correr(
      conProductos(),
      { tipo: "cabecera", campo: "motivo", valor: "Conteo mensual de agosto" },
      { tipo: "contarTodoConforme" },
    );

    expect(bloqueos(e)[0]?.mensaje).toContain("no hay nada que ajustar");
  });

  it("distingue «no has contado» de «todo cuadra»", () => {
    const e = reducir(conProductos(), {
      tipo: "cabecera",
      campo: "motivo",
      valor: "Conteo mensual de agosto",
    });

    expect(bloqueos(e)[0]?.mensaje).toContain("no has contado");
  });

  it("queda limpio con motivo, fecha y al menos una diferencia", () => {
    const e = correr(
      conProductos(),
      { tipo: "cabecera", campo: "motivo", valor: "Conteo mensual de agosto" },
      { tipo: "contar", productoId: RODAMIENTO.id, valor: 40 },
    );

    expect(bloqueos(e)).toEqual([]);
  });
});

describe("payload", () => {
  it("manda solo lo contado, incluidas las que cuadran", () => {
    // Las que cuadran dejan constancia de qué se contó; la base solo genera
    // movimiento cuando la diferencia no es cero.
    const e = correr(
      conProductos(),
      { tipo: "cabecera", campo: "motivo", valor: "Conteo mensual de agosto" },
      { tipo: "contar", productoId: RODAMIENTO.id, valor: 40 },
    );

    expect(aPayload(e)).toEqual({
      tipo: "descuadre",
      motivo: "Conteo mensual de agosto",
      fecha: FECHA,
      items: [{ producto_id: RODAMIENTO.id, cantidad_fisica: 40 }],
    });
  });

  it("nunca manda el costo: lo pone la base desde el maestro", () => {
    const e = correr(
      conProductos(),
      { tipo: "cabecera", campo: "motivo", valor: "Conteo mensual de agosto" },
      { tipo: "contarTodoConforme" },
    );
    const items = aPayload(e).items as Record<string, unknown>[];

    expect(items).toHaveLength(2);
    expect(items[0]?.costo_unitario).toBeUndefined();
  });

  it("recorta el motivo", () => {
    const e = correr(
      conProductos(),
      { tipo: "cabecera", campo: "motivo", valor: "  Conteo de agosto  " },
      { tipo: "contar", productoId: RODAMIENTO.id, valor: 40 },
    );

    expect(aPayload(e).motivo).toBe("Conteo de agosto");
  });
});
