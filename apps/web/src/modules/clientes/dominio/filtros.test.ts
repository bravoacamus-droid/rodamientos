import { describe, expect, it } from "vitest";

import { describirFiltrosClientes, filtrosClientesAQuery, leerFiltrosClientes, lectorDe } from "./filtros";

const ZONA = "11111111-2222-4333-8444-555555555555";

describe("filtros de la cartera (26/11): la lista, el Excel y el PDF leen lo mismo", () => {
  it("lee de la URL y vuelve a la misma URL", () => {
    const sp = new URLSearchParams({ q: "aceros", condicion: "credito", zona: ZONA, bloqueados: "1" });
    const f = leerFiltrosClientes(lectorDe(sp));
    expect(f).toEqual({
      q: "aceros",
      condicion: "credito",
      zona: ZONA,
      subzona: undefined,
      rubro: undefined,
      bloqueados: true,
      inactivos: false,
    });
    expect(new URLSearchParams(filtrosClientesAQuery(f)).get("zona")).toBe(ZONA);
    expect(leerFiltrosClientes(lectorDe(new URLSearchParams(filtrosClientesAQuery(f))))).toEqual(f);
  });

  it("lo que no tiene forma conocida no pasa", () => {
    const f = leerFiltrosClientes(lectorDe({ condicion: "cualquiera", zona: "1 or 1=1", rubro: ["x"] }));
    expect(f.condicion).toBeUndefined();
    expect(f.zona).toBeUndefined();
    expect(f.rubro).toBeUndefined();
    expect(filtrosClientesAQuery(f)).toBe("");
  });

  it("dice en palabras qué se bajó", () => {
    expect(describirFiltrosClientes({ condicion: "credito" }, { zona: "Callao", rubro: null })).toBe("Distrito Callao · a crédito");
    expect(describirFiltrosClientes({}, { zona: null, rubro: null })).toBe("Todos los distritos");
    expect(describirFiltrosClientes({}, { zona: "SJL", subzona: "Celima", rubro: null })).toBe("Distrito SJL · zona Celima");
  });

  it("la zona dentro del distrito viaja como las demás (205)", () => {
    const f = leerFiltrosClientes(lectorDe({ subzona: ZONA }));
    expect(f.subzona).toBe(ZONA);
    expect(new URLSearchParams(filtrosClientesAQuery(f)).get("subzona")).toBe(ZONA);
    expect(leerFiltrosClientes(lectorDe({ subzona: "celima" })).subzona).toBeUndefined();
  });
});
