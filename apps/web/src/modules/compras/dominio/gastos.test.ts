import { describe, expect, it } from "vitest";

import {
  CONCEPTOS_SUGERIDOS,
  ETIQUETA_MODALIDAD,
  MODALIDADES,
  gastosParaEnviar,
  modalidadDe,
  tipoYVia,
  totalGastos,
  type GastoEditable,
} from "./gastos";

const g = (concepto: string, monto: number, key = concepto): GastoEditable => ({
  key,
  concepto,
  monto,
});

describe("modalidad ↔ tipo y vía", () => {
  it("ida y vuelta dan lo mismo en las tres", () => {
    for (const m of MODALIDADES) {
      const { tipo, via } = tipoYVia(m);
      expect(modalidadDe(tipo, via ?? "aerea")).toBe(m);
    }
  });

  /*
    Willy (32:28): «compra local, compra importación, y la importación se
    subdivide en aéreo y marítimo». La vía cuelga de la importación; una
    compra local no tiene.
  */
  it("la local no lleva vía", () => {
    expect(tipoYVia("local")).toEqual({ tipo: "local", via: null });
    expect(tipoYVia("maritima")).toEqual({ tipo: "importacion", via: "maritima" });
  });

  it("ninguna etiqueta es jerga", () => {
    for (const m of MODALIDADES) expect(ETIQUETA_MODALIDAD[m]).not.toMatch(/_/);
  });
});

describe("los gastos propuestos", () => {
  it("cada modalidad propone los suyos", () => {
    expect(CONCEPTOS_SUGERIDOS.local).toEqual(["Transporte"]);
    // Aérea: el courier va en la factura del proveedor, el desaduanaje aparte.
    expect(CONCEPTOS_SUGERIDOS.aerea).toEqual(["Courier", "Desaduanaje"]);
    expect(CONCEPTOS_SUGERIDOS.maritima).toContain("Levante");
    expect(CONCEPTOS_SUGERIDOS.maritima).toContain("Ajuste de valor");
  });
});

describe("totalGastos", () => {
  it("suma sin la trampa de la coma flotante", () => {
    // 0.1 + 0.2 en coma flotante da 0.30000000000000004.
    expect(totalGastos([g("a", 0.1), g("b", 0.2)])).toBe(0.3);
  });

  it("un monto negativo no resta", () => {
    expect(totalGastos([g("a", 50), g("b", -20)])).toBe(50);
  });
});

describe("gastosParaEnviar", () => {
  it("solo viajan los que tienen concepto y dinero", () => {
    expect(
      gastosParaEnviar([
        g("Flete", 100),
        g("Almacenaje", 0),
        g("   ", 30, "sin-concepto"),
        g("  Levante  ", 12.5),
      ]),
    ).toEqual([
      { concepto: "Flete", monto: 100 },
      { concepto: "Levante", monto: 12.5 },
    ]);
  });
});
