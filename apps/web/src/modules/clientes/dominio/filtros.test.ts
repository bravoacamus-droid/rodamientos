import { describe, expect, it } from "vitest";

import { describirFiltrosClientes, filtrosClientesAQuery, leerFiltrosClientes, lectorDe } from "./filtros";

const ZONA = "11111111-2222-4333-8444-555555555555";

describe("filtros de la cartera (26/11): la lista, el Excel y el PDF leen lo mismo", () => {
  it("lee de la URL y vuelve a la misma URL", () => {
    const sp = new URLSearchParams({ q: "aceros", condicion: "credito", zona: ZONA, bloqueados: "1" });
    const f = leerFiltrosClientes(lectorDe(sp));
    expect(f).toEqual({ q: "aceros", condicion: "credito", zona: ZONA, rubro: undefined, bloqueados: true, inactivos: false });
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
    expect(describirFiltrosClientes({ condicion: "credito" }, { zona: "Callao", rubro: null })).toBe("Zona Callao · a crédito");
    expect(describirFiltrosClientes({}, { zona: null, rubro: null })).toBe("Todas las zonas");
  });
});
