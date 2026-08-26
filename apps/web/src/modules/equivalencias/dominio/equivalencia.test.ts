import { describe, expect, it } from "vitest";

import {
  agruparPorOrigen,
  contarPorOrigen,
  mismoPar,
  parCanonico,
  resumenSustituto,
  tonoOrigen,
} from "./equivalencia";
import type { OrigenSustituto, Sustituto } from "./tipos";

const A = "aaaaaaaa-1111-1111-1111-111111111111";
const B = "bbbbbbbb-2222-2222-2222-222222222222";

let n = 0;

function sustituto(campos: Partial<Sustituto> = {}): Sustituto {
  n += 1;
  return {
    id: `producto-${n}`,
    codigo: "6205-2RS-FAG",
    descripcion: "Rodamiento rígido de bolas 6205-2RS",
    marca: "FAG",
    stock: 12,
    precio_venta: 8.4,
    precio_minimo: 7.1,
    diferencia_pct: 0,
    origen: "misma_medida",
    prioridad: 2,
    mejor_oferta: false,
    ...campos,
  };
}

describe("parCanonico", () => {
  it("devuelve el mismo par en los dos sentidos", () => {
    expect(parCanonico(A, B)).toEqual(parCanonico(B, A));
  });

  it("pone primero el uuid menor", () => {
    expect(parCanonico(B, A)).toEqual([A, B]);
  });

  it("no distingue mayúsculas: un uuid es el mismo escrito como sea", () => {
    // Postgres devuelve los uuid en minúsculas, pero un id que llegue de un
    // formulario puede venir en mayúsculas. Comparando en crudo, "BBBB" va
    // ANTES que "aaaa" —la tabla ASCII pone las mayúsculas primero—, así que
    // el par se guardaría en el sentido contrario y `equiv_unica` dejaría
    // entrar el duplicado.
    const bMayus = B.toUpperCase();
    expect(parCanonico(bMayus, A)).toEqual([A, bMayus]);
    expect(parCanonico(A, bMayus)).toEqual([A, bMayus]);
  });
});

describe("mismoPar", () => {
  it("reconoce el par al revés", () => {
    expect(mismoPar([A, B], [B, A])).toBe(true);
  });

  it("distingue pares distintos", () => {
    const C = "33333333-3333-3333-3333-333333333333";
    expect(mismoPar([A, B], [A, C])).toBe(false);
  });
});

describe("agruparPorOrigen", () => {
  it("respeta el orden de la cascada, no el de llegada", () => {
    const grupos = agruparPorOrigen([
      sustituto({ origen: "subfamilia", prioridad: 4 }),
      sustituto({ origen: "equivalencia", prioridad: 1 }),
      sustituto({ origen: "tipo", prioridad: 3 }),
    ]);

    expect(grupos.map((g) => g.origen)).toEqual(["equivalencia", "tipo", "subfamilia"]);
  });

  it("junta los del mismo origen", () => {
    const grupos = agruparPorOrigen([
      sustituto({ origen: "misma_medida", prioridad: 2 }),
      sustituto({ origen: "misma_medida", prioridad: 2 }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.sustitutos).toHaveLength(2);
  });

  it("de una lista vacía no inventa grupos", () => {
    expect(agruparPorOrigen([])).toEqual([]);
  });
});

describe("resumenSustituto", () => {
  it("escribe el signo también cuando es más caro", () => {
    expect(resumenSustituto(sustituto({ diferencia_pct: 12.5 }))).toContain("+12.5 %");
  });

  it("el menos ya lo trae el número", () => {
    expect(resumenSustituto(sustituto({ diferencia_pct: -8 }))).toContain("-8.0 %");
  });

  it("dice «mismo precio» en lugar de «0 %»", () => {
    expect(resumenSustituto(sustituto({ diferencia_pct: 0 }))).toContain("mismo precio");
  });

  it("sin stock lo dice con palabras, no con un cero", () => {
    expect(resumenSustituto(sustituto({ stock: 0 }))).toContain("sin stock");
  });
});

describe("contarPorOrigen", () => {
  it("resume en una línea", () => {
    const texto = contarPorOrigen([
      sustituto({ origen: "equivalencia", prioridad: 1 }),
      sustituto({ origen: "misma_medida", prioridad: 2 }),
      sustituto({ origen: "misma_medida", prioridad: 2 }),
    ]);

    expect(texto).toBe("1 declarada · 2 misma medida");
  });

  it("sin alternativas lo dice", () => {
    expect(contarPorOrigen([])).toBe("sin alternativas");
  });
});

describe("tonoOrigen", () => {
  const casos: Array<[OrigenSustituto, string]> = [
    ["equivalencia", "success"],
    ["misma_medida", "brand"],
    ["tipo", "warning"],
    ["subfamilia", "neutral"],
  ];

  it.each(casos)("%s → %s", (origen, tono) => {
    expect(tonoOrigen(origen)).toBe(tono);
  });
});
