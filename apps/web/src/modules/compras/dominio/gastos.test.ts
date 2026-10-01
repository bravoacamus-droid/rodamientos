import { describe, expect, it } from "vitest";

import {
  CONCEPTOS_SUGERIDOS,
  ETIQUETA_MODALIDAD,
  ETIQUETA_REPARTO,
  MODALIDADES,
  costeoEstimado,
  gastosParaEnviar,
  modalidadDe,
  repartoSugerido,
  tipoYVia,
  totalGastos,
  type GastoEditable,
  type Reparto,
} from "./gastos";

const g = (
  concepto: string,
  monto: number,
  key = concepto,
  reparto: Reparto = "valor",
): GastoEditable => ({ key, concepto, monto, reparto });

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
    for (const r of ["peso", "valor"] as const) expect(ETIQUETA_REPARTO[r]).not.toMatch(/_/);
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

describe("repartoSugerido (097)", () => {
  // Willy, 01/10: «el costo de DHL […] lo divido entre el peso total».
  it("lo que mueve la carga va por kilo", () => {
    for (const c of ["Courier", "DHL", "Flete marítimo", "flete aéreo", "Envío FedEx"]) {
      expect(repartoSugerido(c)).toBe("peso");
    }
  });

  it("impuestos y comisiones, por valor", () => {
    for (const c of ["Desaduanaje", "Derechos de aduana", "Agente de aduanas", "Transporte", ""]) {
      expect(repartoSugerido(c)).toBe("valor");
    }
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
  it("solo viajan los que tienen concepto y dinero, con su reparto", () => {
    expect(
      gastosParaEnviar([
        g("Flete", 100, "f", "peso"),
        g("Almacenaje", 0),
        g("   ", 30, "sin-concepto"),
        g("  Levante  ", 12.5),
      ]),
    ).toEqual([
      { concepto: "Flete", monto: 100, reparto: "peso" },
      { concepto: "Levante", monto: 12.5, reparto: "valor" },
    ]);
  });
});

describe("costeoEstimado (097): la cuenta del Excel de Willy", () => {
  const l = (key: string, cantidad: number, costoUnitario: number, pesoKg: number) => ({
    key,
    cantidad,
    costoUnitario,
    pesoKg,
  });

  /*
    Su hoja: PU Lima = FOB + 10.15 × peso. Con dos de sus productos y un
    courier que da exactamente 10.15 $/kg sobre su peso:
      6312 2Z/C3   × 6, FOB 9.432,  1.73 kg  → 9.432 + 10.15 × 1.73  = 26.9915
      HK 1012      × 20, FOB 0.393, 0.00454  → 0.393 + 10.15 × 0.005 ≈ 0.4438
    (el peso va a tres decimales, como en `productos.peso_kg`).
  */
  it("reparte el courier por kilo, como en su hoja", () => {
    const lineas = [l("pesado", 6, 9.432, 1.73), l("liviano", 20, 0.393, 0.005)];
    const kilos = 6 * 1.73 + 20 * 0.005;
    const c = costeoEstimado(lineas, [g("Courier", 10.15 * kilos, "c", "peso")]);

    expect(c.repartePorPeso).toBe(true);
    expect(c.porKg).toBeCloseTo(10.15, 2);
    expect(c.porLinea.pesado).toBeCloseTo(26.99, 2);
    expect(c.porLinea.liviano).toBeCloseTo(0.44, 2);
  });

  it("por valor como hasta ahora: el pesado sale barato y el liviano caro", () => {
    const lineas = [l("pesado", 6, 9.432, 1.73), l("liviano", 20, 0.393, 0.005)];
    const kilos = 6 * 1.73 + 20 * 0.005;
    const c = costeoEstimado(lineas, [g("Courier", 10.15 * kilos, "c", "valor")]);

    expect(c.repartePorPeso).toBe(false);
    // Con dos productos la distorsión es menor que en su pedido de 29, pero
    // va en el mismo sentido: el pesado, de menos; el liviano, más del doble.
    expect(c.porLinea.pesado).toBeLessThan(26.99);
    expect(c.porLinea.liviano).toBeGreaterThan(0.44 * 2);
  });

  // El mismo caso que el centinela de la 097.
  it("mezcla: courier por kilo y desaduanaje por valor", () => {
    const c = costeoEstimado(
      [l("a", 1, 10, 1), l("b", 1, 10, 0.1)],
      [g("Courier", 11, "c", "peso"), g("Desaduanaje", 4, "d", "valor")],
    );
    expect(c.porLinea.a).toBe(22);
    expect(c.porLinea.b).toBe(13);
    expect(c.gastosPorPeso).toBe(11);
    expect(c.gastosPorValor).toBe(4);
  });

  // Repartir por kilo con una pieza sin peso le regalaría el flete.
  it("si falta un peso, todo por valor, y dice cuál falta", () => {
    const c = costeoEstimado(
      [l("a", 1, 10, 1), l("sinpeso", 1, 10, 0)],
      [g("Courier", 10, "c", "peso")],
    );
    expect(c.repartePorPeso).toBe(false);
    expect(c.faltaPeso).toEqual(["sinpeso"]);
    expect(c.porLinea.a).toBe(15);
    expect(c.porLinea.sinpeso).toBe(15);
  });

  it("sin gastos por kilo no pide pesos", () => {
    const c = costeoEstimado([l("a", 1, 10, 0)], [g("Transporte", 5)]);
    expect(c.faltaPeso).toEqual([]);
    expect(c.porLinea.a).toBe(15);
  });

  it("sin gastos, el costo es el de la factura", () => {
    const c = costeoEstimado([l("a", 3, 7.5, 0)], []);
    expect(c.porLinea.a).toBe(7.5);
  });
});
