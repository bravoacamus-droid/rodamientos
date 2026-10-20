import { describe, expect, it } from "vitest";

import { aplicarCambio, resumenDelRol, tiene, type ModuloDef, type Permiso } from "./permisos";

const p = (rol: string, modulo: Permiso["modulo"], accion: Permiso["accion"]): Permiso => ({ rol, modulo, accion });

const MODULOS: ModuloDef[] = [
  { clave: "clientes", nombre: "Clientes", ayuda: "", acciones: ["ver", "crear", "editar", "eliminar"] },
  { clave: "reportes", nombre: "Reportes", ayuda: "", acciones: ["ver"] },
];

describe("tiene", () => {
  it("gerencia lo tiene todo aunque no tenga filas", () => {
    expect(tiene([], "gerencia", "clientes", "eliminar")).toBe(true);
  });

  it("los demás, solo lo que tienen", () => {
    const lista = [p("ventas", "clientes", "ver")];
    expect(tiene(lista, "ventas", "clientes", "ver")).toBe(true);
    expect(tiene(lista, "ventas", "clientes", "crear")).toBe(false);
    expect(tiene(lista, "almacen", "clientes", "ver")).toBe(false);
  });
});

describe("aplicarCambio: la misma regla que cambiar_permiso (143)", () => {
  it("dar crear da también ver: no se crea lo que no se ve", () => {
    const r = aplicarCambio([], { ...p("ventas", "clientes", "crear"), puede: true });
    expect(r).toEqual(expect.arrayContaining([p("ventas", "clientes", "crear"), p("ventas", "clientes", "ver")]));
    expect(r).toHaveLength(2);
  });

  it("no duplica lo que ya estaba", () => {
    const r = aplicarCambio([p("ventas", "clientes", "ver")], { ...p("ventas", "clientes", "editar"), puede: true });
    expect(r).toHaveLength(2);
  });

  it("quitar ver quita el módulo entero, y solo de ese rol", () => {
    const antes = [
      p("ventas", "clientes", "ver"),
      p("ventas", "clientes", "crear"),
      p("ventas", "reportes", "ver"),
      p("almacen", "clientes", "ver"),
    ];
    const r = aplicarCambio(antes, { ...p("ventas", "clientes", "ver"), puede: false });
    expect(r).toEqual([p("ventas", "reportes", "ver"), p("almacen", "clientes", "ver")]);
  });

  it("quitar crear deja ver", () => {
    const r = aplicarCambio(
      [p("ventas", "clientes", "ver"), p("ventas", "clientes", "crear")],
      { ...p("ventas", "clientes", "crear"), puede: false },
    );
    expect(r).toEqual([p("ventas", "clientes", "ver")]);
  });
});

describe("resumenDelRol", () => {
  it("cuenta los módulos que ve y en los que cambia algo", () => {
    const lista = [p("ventas", "clientes", "ver"), p("ventas", "clientes", "editar"), p("ventas", "reportes", "ver")];
    expect(resumenDelRol(lista, MODULOS, "ventas")).toEqual({ ve: 2, cambia: 1 });
    expect(resumenDelRol(lista, MODULOS, "gerencia")).toEqual({ ve: 2, cambia: 1 });
  });
});
