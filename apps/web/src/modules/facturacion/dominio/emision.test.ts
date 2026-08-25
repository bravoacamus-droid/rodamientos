import { describe, expect, it } from "vitest";

import {
  DOC_SUNAT,
  aplicaDetraccion,
  bloqueosEmision,
  cuotasDe,
  docSunatDe,
  montoDetraccion,
  tipoSugerido,
  totalesDe,
  unidadSunat,
  vencimientoDe,
} from "./emision";
import type { CotizacionFacturable } from "./tipos";

const COT: CotizacionFacturable = {
  id: "11111111-1111-1111-1111-111111111111",
  numero: "COT1-00000001",
  fecha: "2026-08-25",
  cliente_id: "22222222-2222-2222-2222-222222222222",
  cliente: "MINERA LOS ANDES S.A.C.",
  cliente_documento: "20100070970",
  cliente_tipo_documento: "RUC",
  orden_compra_cliente: null,
  condicion_pago: "credito",
  dias_credito: 30,
  total: 1000,
  lineas: [
    {
      producto_id: "33333333-3333-3333-3333-333333333333",
      codigo: "6205-2RS1/C3",
      descripcion: "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
      unidad: "NIU",
      cantidad: 10,
      valor_unitario: 3.92,
      descuento_pct: 0,
      importe: 39.2,
    },
  ],
};

describe("docSunatDe", () => {
  it("traduce los tipos del maestro al catálogo 06", () => {
    expect(docSunatDe("RUC")).toBe(DOC_SUNAT.RUC);
    expect(docSunatDe("DNI")).toBe(DOC_SUNAT.DNI);
    expect(docSunatDe("CE")).toBe(DOC_SUNAT.CARNET_EXTRANJERIA);
    expect(docSunatDe("PASAPORTE")).toBe(DOC_SUNAT.PASAPORTE);
  });

  it("lo desconocido cae a «sin documento», no revienta", () => {
    expect(docSunatDe("SIN_DOC")).toBe(DOC_SUNAT.SIN_DOCUMENTO);
    expect(docSunatDe(null)).toBe(DOC_SUNAT.SIN_DOCUMENTO);
    expect(docSunatDe("")).toBe(DOC_SUNAT.SIN_DOCUMENTO);
  });

  it("no distingue mayúsculas", () => {
    expect(docSunatDe("ruc")).toBe(DOC_SUNAT.RUC);
  });
});

describe("tipoSugerido", () => {
  it("con RUC propone factura", () => {
    expect(tipoSugerido("RUC")).toBe("factura");
  });

  it("sin RUC propone boleta", () => {
    expect(tipoSugerido("DNI")).toBe("boleta");
    expect(tipoSugerido("CE")).toBe("boleta");
    expect(tipoSugerido(null)).toBe("boleta");
  });
});

describe("bloqueosEmision", () => {
  it("una factura a un cliente con RUC válido no bloquea", () => {
    expect(bloqueosEmision(COT, "factura")).toEqual([]);
  });

  /**
   * Es el rechazo 2017 de SUNAT, y el correlativo se gasta igual. Por eso se
   * comprueba antes de emitir y no después.
   */
  it("no deja facturar a quien no tiene RUC", () => {
    const sinRuc = { ...COT, cliente_tipo_documento: "DNI", cliente_documento: "46027897" };
    const bloqueos = bloqueosEmision(sinRuc, "factura");
    expect(bloqueos).toHaveLength(1);
    expect(bloqueos[0]!.mensaje).toContain("exige RUC");
  });

  it("rechaza un RUC con formato imposible", () => {
    const malRuc = { ...COT, cliente_documento: "12345678901" };
    expect(bloqueosEmision(malRuc, "factura")[0]!.campo).toBe("documento");
  });

  it("acepta los cuatro prefijos de RUC que existen", () => {
    for (const prefijo of ["10", "15", "17", "20"]) {
      const c = { ...COT, cliente_documento: `${prefijo}123456789` };
      expect(bloqueosEmision(c, "factura")).toEqual([]);
    }
  });

  it("una boleta pequeña sin documento pasa", () => {
    const anonimo = {
      ...COT,
      cliente_tipo_documento: "SIN_DOC",
      cliente_documento: null,
      total: 250,
    };
    expect(bloqueosEmision(anonimo, "boleta")).toEqual([]);
  });

  it("una boleta grande sin documento NO pasa", () => {
    const anonimo = {
      ...COT,
      cliente_tipo_documento: "SIN_DOC",
      cliente_documento: null,
      total: 900,
    };
    expect(bloqueosEmision(anonimo, "boleta")[0]!.mensaje).toContain("700");
  });

  it("comprueba el DNI de la boleta", () => {
    const mal = { ...COT, cliente_tipo_documento: "DNI", cliente_documento: "123" };
    expect(bloqueosEmision(mal, "boleta")[0]!.mensaje).toContain("ocho dígitos");
  });

  it("sin líneas no se emite", () => {
    const vacia = { ...COT, lineas: [] };
    expect(bloqueosEmision(vacia, "factura").some((b) => b.campo === "lineas")).toBe(true);
  });

  it("un total en cero se para", () => {
    const cero = { ...COT, total: 0 };
    expect(bloqueosEmision(cero, "factura").some((b) => b.campo === "montos")).toBe(true);
  });
});

describe("totalesDe", () => {
  it("calcula gravada, IGV y total", () => {
    const t = totalesDe([{ cantidad: 10, valor_unitario: 3.92 }]);
    expect(t.gravada).toBe(39.2);
    expect(t.igv).toBe(7.06); // round(39.20 × 0.18, 2) = 7.056 -> 7.06
    expect(t.total).toBe(46.26);
  });

  it("aplica el descuento de línea y lo reporta", () => {
    const t = totalesDe([{ cantidad: 10, valor_unitario: 10, descuento_pct: 5 }]);
    expect(t.gravada).toBe(95);
    expect(t.descuento).toBe(5);
  });

  /**
   * El caso del medio céntimo: con `redondear2(cantidad × precio)` esta línea
   * daría 3.01, y Postgres guarda 3.02. La cabecera y el detalle no cuadrarían.
   */
  it("cuadra con Postgres en el medio céntimo", () => {
    expect(totalesDe([{ cantidad: 3, valor_unitario: 1.005 }]).gravada).toBe(3.02);
  });

  it("suma las líneas ya redondeadas, no los decimales completos", () => {
    // Tres líneas que redondean hacia arriba por separado.
    const t = totalesDe([
      { cantidad: 1, valor_unitario: 0.125 },
      { cantidad: 1, valor_unitario: 0.125 },
      { cantidad: 1, valor_unitario: 0.125 },
    ]);
    // 0.13 × 3 = 0.39, no round(0.375, 2) = 0.38.
    expect(t.gravada).toBe(0.39);
  });

  it("sin líneas todo es cero", () => {
    expect(totalesDe([])).toEqual({ gravada: 0, igv: 0, total: 0, descuento: 0 });
  });

  /**
   * Estos números salen del Postgres del proyecto, de la MISMA expresión de la
   * columna generada `comprobante_items.importe`.
   *
   * Antes se aplicaba el descuento al precio unitario y luego se multiplicaba
   * por la cantidad. Postgres multiplica los TRES factores con precisión
   * completa y redondea una sola vez, al final; hacerlo en dos pasos redondea
   * el precio con descuento por el camino y separa las cuentas.
   */
  it("el descuento va como tercer factor, como en la base", () => {
    expect(
      totalesDe([{ cantidad: 3, valor_unitario: 1.005, descuento_pct: 33.33 }]).gravada,
    ).toBe(2.01);
    expect(
      totalesDe([{ cantidad: 7, valor_unitario: 2.4567, descuento_pct: 12.5 }]).gravada,
    ).toBe(15.05);
    expect(
      totalesDe([{ cantidad: 2.5, valor_unitario: 4.005, descuento_pct: 10 }]).gravada,
    ).toBe(9.01);
  });

  it("aguanta la línea más grande que admite la base", () => {
    expect(
      totalesDe([
        { cantidad: 9999.99, valor_unitario: 9999.9999, descuento_pct: 99.99 },
      ]).gravada,
    ).toBe(9999.99);
  });
});

describe("detracción", () => {
  it("solo se aplica en factura y por encima del umbral", () => {
    expect(aplicaDetraccion("factura", 800, 700)).toBe(true);
    expect(aplicaDetraccion("factura", 700, 700)).toBe(false);
    expect(aplicaDetraccion("factura", 600, 700)).toBe(false);
  });

  it("la boleta nunca lleva detracción", () => {
    // La base lo impide con `comp_boleta_sin_spot`; aquí se evita llegar ahí.
    expect(aplicaDetraccion("boleta", 5000, 700)).toBe(false);
  });

  it("calcula el monto redondeado", () => {
    expect(montoDetraccion(1000, 12)).toBe(120);
    expect(montoDetraccion(833.33, 12)).toBe(100);
  });
});

describe("cuotasDe", () => {
  it("al contado no hay cuotas", () => {
    expect(cuotasDe(1000, 0, "2026-08-25")).toEqual([]);
  });

  it("una cuota a 30 días", () => {
    expect(cuotasDe(1180, 30, "2026-08-25")).toEqual([
      { numero: 1, monto: 1180, vencimiento: "2026-09-24" },
    ]);
  });

  /**
   * SUNAT rechaza (3251) si la suma de las cuotas no da el total. Con tres
   * partes de 1000 el reparto exacto es 333.333…, así que la última tiene que
   * absorber el céntimo.
   */
  it("la última cuota absorbe el descuadre del redondeo", () => {
    const cuotas = cuotasDe(1000, 90, "2026-08-25", 3);
    expect(cuotas).toHaveLength(3);
    expect(cuotas.reduce((a, c) => a + c.monto, 0)).toBeCloseTo(1000, 2);
    expect(cuotas[2]!.monto).toBe(333.34);
  });

  it("los vencimientos se reparten en el plazo", () => {
    const cuotas = cuotasDe(300, 90, "2026-01-01", 3);
    expect(cuotas.map((c) => c.vencimiento)).toEqual([
      "2026-01-31",
      "2026-03-02",
      "2026-04-01",
    ]);
  });

  it("una fecha inválida no revienta", () => {
    expect(cuotasDe(100, 30, "ayer")).toEqual([]);
  });
});

describe("vencimientoDe", () => {
  it("suma los días de crédito", () => {
    expect(vencimientoDe("2026-08-25", 30)).toBe("2026-09-24");
  });

  it("al contado no hay vencimiento", () => {
    expect(vencimientoDe("2026-08-25", 0)).toBeNull();
  });

  it("cruza fin de año sin despeinarse", () => {
    expect(vencimientoDe("2026-12-20", 30)).toBe("2027-01-19");
  });
});

describe("unidadSunat", () => {
  it("deja pasar el código del maestro", () => {
    expect(unidadSunat("NIU")).toBe("NIU");
    expect(unidadSunat("KGM")).toBe("KGM");
  });

  it("una unidad vacía cae a NIU en vez de impedir emitir", () => {
    expect(unidadSunat(null)).toBe("NIU");
    expect(unidadSunat(" ")).toBe("NIU");
  });

  it("normaliza a mayúsculas", () => {
    expect(unidadSunat("niu")).toBe("NIU");
  });
});
