import { describe, expect, it } from "vitest";

import {
  DOC_SUNAT,
  aplicaDetraccion,
  bloqueosEmision,
  cuadreConGuias,
  cuotasDe,
  despachadoPorLinea,
  docSunatDe,
  enMonedaDocumento,
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
  cliente_direccion: null,
  orden_compra_cliente: null,
  condicion_pago: "credito",
  dias_credito: 30,
  total: 1000,
  moneda: "USD",
  tipo_cambio: null,
  cliente_agente_retencion: false,
  lineas_ya_facturadas: 0,
  lineas_sin_despachar: 0,
  // Con guía, que es el caso normal: primero sale la mercadería y luego se
  // factura. Sin ella no se puede emitir (17/09).
  guias: [{ id: "99999999-9999-9999-9999-999999999999", numero: "T001-00000012", fecha: "2026-08-26" }],
  guias_borrador: [],
  guias_facturadas: [],
  despacho: [
    {
      guia_id: "99999999-9999-9999-9999-999999999999",
      linea_id: "44444444-4444-4444-4444-444444444444",
      codigo: "6205-2RS1/C3",
      unidades: 10,
    },
  ],
  lineas: [
    {
      linea_id: "44444444-4444-4444-4444-444444444444",
      producto_id: "33333333-3333-3333-3333-333333333333",
      codigo: "6205-2RS1/C3",
      descripcion: "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
      unidad: "NIU",
      cantidad: 10,
      cantidad_cotizada: 10,
      cantidad_atendida: 0,
      stock: 10,
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
   * Los dos casos acaban sin líneas y llevan a sitios opuestos: uno se
   * arregla editando la cotización, el otro no se arregla porque ya está
   * hecho. Antes de la 047 el segundo no podía ni ocurrir — la cotización
   * se cerraba entera con la primera factura.
   */
  it("sin líneas y sin nada facturado, dice que la cotización está vacía", () => {
    const r = bloqueosEmision({ ...COT, lineas: [], lineas_ya_facturadas: 0 }, "factura");
    expect(r.map((b) => b.mensaje)).toContain("La cotización no tiene líneas.");
  });

  /*
    La guía va ANTES que la factura, y ahora es una regla y no una costumbre.

    Luis, 17/09: *«no debería emitir la factura si no tengo la guía hecha; la
    guía va sujeta a la cotización, si no, no deja facturar»*. Hasta entonces
    la pantalla no lo pedía y salió que NINGUNA factura tenía guía.
  */
  it("sin guía emitida no se puede facturar", () => {
    const r = bloqueosEmision({ ...COT, guias: [] }, "factura");
    expect(r.some((b) => b.campo === "guia")).toBe(true);
  });

  it("la boleta tampoco se libra: también mueve mercadería", () => {
    const r = bloqueosEmision(
      { ...COT, guias: [], cliente_tipo_documento: "DNI", cliente_documento: "45678912" },
      "boleta",
    );
    expect(r.some((b) => b.campo === "guia")).toBe(true);
  });

  it("con guía, ese bloqueo desaparece", () => {
    expect(bloqueosEmision(COT, "factura").some((b) => b.campo === "guia")).toBe(false);
  });

  /*
    157: se factura lo que SALIÓ. Lo confirmado que todavía no tiene guía no
    sale abajo, y la cotización no está vacía ni facturada: falta la guía.
  */
  it("sin líneas porque lo pendiente no salió en ninguna guía, pide la guía", () => {
    const r = bloqueosEmision({ ...COT, lineas: [], lineas_sin_despachar: 1 }, "factura");
    expect(r.map((b) => b.mensaje)).toContain(
      "Lo que queda por facturar todavía no salió en una guía. Emite la guía de lo que falta y luego factura.",
    );
    expect(r.map((b) => b.mensaje)).not.toContain("La cotización no tiene líneas.");
  });

  it("sin ninguna guía, el aviso de la guía basta y no se repite", () => {
    const r = bloqueosEmision({ ...COT, guias: [], lineas: [], lineas_sin_despachar: 1 }, "factura");
    expect(r.filter((b) => b.campo === "lineas")).toEqual([]);
    expect(r.some((b) => b.campo === "guia")).toBe(true);
  });

  it("sin líneas porque ya se facturó todo, lo dice así", () => {
    const r = bloqueosEmision({ ...COT, lineas: [], lineas_ya_facturadas: 2 }, "factura");
    expect(r.map((b) => b.mensaje)).toContain(
      "Ya se facturó todo lo que el cliente confirmó de esta cotización.",
    );
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

describe("la factura en soles (116)", () => {
  it("convierte el unitario a céntimos y suma como emitir_comprobante", () => {
    // El caso del centinela de la 116: 3 × 10.87 a 3.448.
    const pen = enMonedaDocumento([{ cantidad: 3, valor_unitario: 10.87, descuento_pct: 0 }], 3.448);
    expect(pen[0]?.valor_unitario).toBe(37.48);
    const t = totalesDe(pen);
    expect(t.gravada).toBe(112.44);
    expect(t.igv).toBe(20.24);
    expect(t.total).toBe(132.68);
  });

  it("en dólares no toca nada", () => {
    const l = [{ cantidad: 1, valor_unitario: 10.8765 }];
    expect(enMonedaDocumento(l, null)).toEqual(l);
  });
});

describe("despachadoPorLinea (157)", () => {
  const sinKits = new Map<string, Map<string, number>>();

  it("suma lo que salió de cada línea en todas las guías", () => {
    const r = despachadoPorLinea(
      [
        { guia_id: "g1", cotizacion_item_id: "l1", producto_id: "p1", cantidad: 1 },
        { guia_id: "g2", cotizacion_item_id: "l1", producto_id: "p1", cantidad: 2 },
        { guia_id: "g2", cotizacion_item_id: "l2", producto_id: "p2", cantidad: 5 },
      ],
      sinKits,
    );
    expect(r.get("l1")).toBe(3);
    expect(r.get("l2")).toBe(5);
  });

  it("una fila sin línea de cotización no cuenta para ninguna", () => {
    const r = despachadoPorLinea(
      [{ guia_id: "g1", cotizacion_item_id: null, producto_id: "p1", cantidad: 4 }],
      sinKits,
    );
    expect(r.size).toBe(0);
  });

  /*
    Un kit sale como sus piezas: 2 kits de (2 rodamientos + 1 retén) son 4 y
    2 en la guía. Cada pieza dice «2 kits»; se cuenta una vez por guía, como
    `despacho_por_item` en la base.
  */
  it("un kit cuenta en kits, una vez por guía", () => {
    const kits = new Map([["lk", new Map([["rod", 2], ["ret", 1]])]]);
    const r = despachadoPorLinea(
      [
        { guia_id: "g1", cotizacion_item_id: "lk", producto_id: "rod", cantidad: 4 },
        { guia_id: "g1", cotizacion_item_id: "lk", producto_id: "ret", cantidad: 2 },
        { guia_id: "g2", cotizacion_item_id: "lk", producto_id: "rod", cantidad: 2 },
        { guia_id: "g2", cotizacion_item_id: "lk", producto_id: "ret", cantidad: 1 },
      ],
      kits,
    );
    expect(r.get("lk")).toBe(3);
  });
});

/*
  157, tras la verificación: la tabla ofrece lo que salió en TODAS las guías
  libres, y la factura tiene que llevar lo mismo que las MARCADAS. Antes la
  acción recortaba en silencio (salía una factura de 1 tras aprobar una previa
  de 3), y facturar de menos dejaba el resto de la guía sin cobrar.
*/
describe("cuadreConGuias (157)", () => {
  const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const L = "44444444-4444-4444-4444-444444444444";
  const dosGuias = {
    guias: [
      { id: A, numero: "T001-00000003", fecha: "2026-10-27" },
      { id: B, numero: "T001-00000004", fecha: "2026-10-27" },
    ],
    despacho: [
      { guia_id: A, linea_id: L, codigo: "6205", unidades: 1 },
      { guia_id: B, linea_id: L, codigo: "6205", unidades: 2 },
    ],
  };

  it("con las dos guías marcadas y las 3 unidades, cuadra", () => {
    expect(cuadreConGuias(dosGuias, [{ linea_id: L, cantidad: 3 }], [A, B])).toEqual([]);
  });

  it("3 con solo la guía de 1 marcada: pide marcar la otra o bajar a 1", () => {
    const r = cuadreConGuias(dosGuias, [{ linea_id: L, cantidad: 3 }], [A]);
    expect(r).toHaveLength(1);
    expect(r[0]!.campo).toBe("cantidades");
    expect(r[0]!.mensaje).toBe(
      "6205: se facturan 3 y la guía T001-00000003 lleva 1. Marca también la guía T001-00000004, o baja la cantidad a 1.",
    );
  });

  it("1 con la guía de 1 marcada, cuadra", () => {
    expect(cuadreConGuias(dosGuias, [{ linea_id: L, cantidad: 1 }], [A])).toEqual([]);
  });

  it("de menos: avisa que el resto se quedaría sin cobrar", () => {
    const r = cuadreConGuias(dosGuias, [{ linea_id: L, cantidad: 1 }], [A, B]);
    expect(r).toHaveLength(1);
    expect(r[0]!.mensaje).toContain("se quedarían sin cobrar");
    expect(r[0]!.mensaje).toContain("Factura 3");
  });

  it("quitar la línea entera cuenta como cero", () => {
    const r = cuadreConGuias(dosGuias, [], [A]);
    expect(r.map((b) => b.mensaje)).toEqual([
      "6205: la guía T001-00000003 lleva 1 y se facturan 0. Una guía facturada ya no se puede volver a facturar, así que esa 1 se quedaría sin cobrar. Factura 1; si el cliente devolvió parte, emite después una nota de crédito por la devolución.",
    ]);
  });

  it("una línea que ninguna guía marcada lleva, dice cuál la lleva", () => {
    const r = cuadreConGuias(
      { ...dosGuias, despacho: [{ guia_id: B, linea_id: L, codigo: "6205", unidades: 2 }] },
      [{ linea_id: L, cantidad: 2 }],
      [A],
    );
    expect(r[0]!.mensaje).toBe(
      "6205: se facturan 2 y ninguna de las guías marcadas lo lleva. Marca también la guía T001-00000004, o baja la cantidad a 0.",
    );
  });

  it("bloqueosEmision lo incluye solo si recibe las guías marcadas", () => {
    const cot = { ...COT, ...dosGuias, lineas: COT.lineas.map((l) => ({ ...l, cantidad: 3 })) };
    expect(bloqueosEmision(cot, "factura").some((b) => b.campo === "cantidades")).toBe(false);
    expect(bloqueosEmision(cot, "factura", [A]).some((b) => b.campo === "cantidades")).toBe(true);
  });
});

describe("guía ya facturada y un resto sin despachar (157)", () => {
  it("no dice que no hay ninguna guía: dice cuál está facturada", () => {
    const r = bloqueosEmision(
      {
        ...COT,
        guias: [],
        lineas: [],
        lineas_sin_despachar: 1,
        guias_facturadas: [{ id: "x", numero: "T001-00000002" }],
      },
      "factura",
    );
    const guia = r.filter((b) => b.campo === "guia");
    expect(guia).toHaveLength(1);
    expect(guia[0]!.mensaje).toBe(
      "La guía T001-00000002 ya está facturada, y lo que queda por facturar todavía no salió en ninguna. Emite la guía de lo que falta y luego factura.",
    );
  });

  it("con todo facturado no pide guía", () => {
    const r = bloqueosEmision(
      {
        ...COT,
        guias: [],
        lineas: [],
        lineas_ya_facturadas: 1,
        guias_facturadas: [{ id: "x", numero: "T001-00000002" }],
      },
      "factura",
    );
    expect(r.some((b) => b.campo === "guia")).toBe(false);
    expect(r.map((b) => b.mensaje)).toContain(
      "Ya se facturó todo lo que el cliente confirmó de esta cotización.",
    );
  });
});
