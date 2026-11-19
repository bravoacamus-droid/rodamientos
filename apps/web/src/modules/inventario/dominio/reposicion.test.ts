import { describe, expect, it } from "vitest";

import { FILTRO_INICIAL, contarPorEstado, familiasDe, filtrarReposicion } from "./reposicion";
import type { FilaReposicion } from "./tipos";

function fila(p: Partial<FilaReposicion>): FilaReposicion {
  return {
    id: p.codigo ?? "x",
    codigo: "X",
    descripcion: "",
    marca: "",
    familia: "RODAMIENTO",
    subfamilia: "",
    stock: 0,
    stock_minimo: 0,
    stock_maximo: 0,
    estado_stock: "sin_stock",
    costo_promedio: 0,
    precio_venta: 0,
    valorizado: 0,
    sugerido_comprar: 0,
    consumo_diario: 0,
    dias_cobertura: null,
    ...p,
  };
}

const FILAS = [
  fila({ codigo: "6205", descripcion: "RODAMIENTO RÍGIDO DE BOLAS", marca: "SKF", estado_stock: "negativo" }),
  fila({ codigo: "6205-2Z", descripcion: "RODAMIENTO RIGIDO", marca: "FAG", estado_stock: "sin_stock" }),
  fila({ codigo: "B-56", descripcion: "FAJA EN V", marca: "OPTIBELT", familia: "TRANSMISION", estado_stock: "sobrestock" }),
];

describe("filtrarReposicion", () => {
  it("sin filtros devuelve todo", () => {
    expect(filtrarReposicion(FILAS, FILTRO_INICIAL)).toHaveLength(3);
  });

  it("busca sin tildes ni mayúsculas", () => {
    const r = filtrarReposicion(FILAS, { ...FILTRO_INICIAL, texto: "rigido" });
    expect(r.map((f) => f.codigo)).toEqual(["6205", "6205-2Z"]);
  });

  it("cada palabra por su lado, también contra la marca", () => {
    const r = filtrarReposicion(FILAS, { ...FILTRO_INICIAL, texto: "6205 skf" });
    expect(r.map((f) => f.codigo)).toEqual(["6205"]);
  });

  it("por estado y por familia", () => {
    expect(filtrarReposicion(FILAS, { ...FILTRO_INICIAL, estado: "sin_stock" })).toHaveLength(1);
    expect(filtrarReposicion(FILAS, { ...FILTRO_INICIAL, familia: "TRANSMISION" })).toHaveLength(1);
  });
});

describe("contarPorEstado", () => {
  it("no cuenta con el estado elegido, sí con los demás filtros", () => {
    const c = contarPorEstado(FILAS, { ...FILTRO_INICIAL, estado: "negativo", familia: "RODAMIENTO" });
    expect(c).toMatchObject({ todos: 2, negativo: 1, sin_stock: 1, sobrestock: 0 });
  });
});

describe("familiasDe", () => {
  it("sin repetir y en orden", () => {
    expect(familiasDe(FILAS)).toEqual(["RODAMIENTO", "TRANSMISION"]);
  });
});
