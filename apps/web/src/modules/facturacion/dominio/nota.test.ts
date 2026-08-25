import { describe, expect, it } from "vitest";

import {
  MOTIVOS_CREDITO,
  MOTIVOS_DEBITO,
  avisosNota,
  bloqueosNota,
  esCorreccionSinImporte,
  esMotivoTotal,
  lineasDeNota,
  serieDeNota,
  totalDeNota,
  valorSinIgv,
} from "./nota";
import type { ComprobanteDetalle } from "./tipos";

const HOY = "2026-08-25";

const FACTURA: ComprobanteDetalle = {
  id: "11111111-1111-1111-1111-111111111111",
  tipo: "factura",
  serie: "F001",
  correlativo: 1,
  numero: "F001-00000001",
  cliente_id: "22222222-2222-2222-2222-222222222222",
  cliente: "MINERA LOS ANDES S.A.C.",
  cliente_documento: "20100047218",
  cliente_tipo_documento: "RUC",
  cliente_direccion: null,
  cliente_email: null,
  cotizacion_id: null,
  cotizacion_numero: null,
  orden_compra_cliente: null,
  referencia_id: null,
  referencia_numero: null,
  motivo_nota_codigo: null,
  fecha_emision: "2026-08-20",
  fecha_vencimiento: "2026-09-19",
  condicion_pago: "credito",
  dias_credito: 30,
  op_gravada: 448.3,
  op_exonerada: 0,
  op_inafecta: 0,
  descuento_global: 0,
  igv: 80.69,
  total: 528.99,
  total_letras: null,
  pagado: 0,
  saldo: 528.99,
  estado: "emitido",
  estado_sunat: "aceptado",
  sunat_codigo_respuesta: null,
  sunat_mensaje: null,
  sunat_enviado_en: null,
  sunat_hash_cdr: null,
  detraccion_aplica: false,
  detraccion_porcentaje: 0,
  detraccion_monto: 0,
  detraccion_codigo: null,
  retencion_aplica: false,
  retencion_monto: 0,
  vendedor: null,
  observaciones: null,
  motivo_anulacion: null,
  creado_en: "2026-08-20T10:00:00Z",
  lineas: [
    {
      id: "l1",
      producto_id: "p1",
      codigo: "6205-2RS1/C3",
      descripcion: "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
      unidad: "NIU",
      cantidad: 20,
      valor_unitario: 3.92,
      descuento_pct: 0,
      importe: 78.4,
    },
    {
      id: "l2",
      producto_id: "p2",
      codigo: "7210 BEP",
      descripcion: "RODAMIENTO DE BOLAS DE CONTACTO ANG.",
      unidad: "NIU",
      cantidad: 6,
      valor_unitario: 41.32,
      descuento_pct: 0,
      importe: 247.92,
    },
  ],
};

const BOLETA: ComprobanteDetalle = { ...FACTURA, tipo: "boleta", serie: "B001", numero: "B001-00000001" };

describe("serieDeNota", () => {
  /**
   * SUNAT exige que la serie de la nota empiece por la misma letra que el
   * documento que corrige. Cruzarlas es un rechazo con el correlativo ya
   * gastado, y el valor por defecto de `emitir_comprobante` solo acierta con
   * facturas.
   */
  it("sobre factura va en serie F", () => {
    expect(serieDeNota("factura", "nota_credito")).toBe("FC01");
    expect(serieDeNota("factura", "nota_debito")).toBe("FD01");
  });

  it("sobre boleta va en serie B", () => {
    expect(serieDeNota("boleta", "nota_credito")).toBe("BC01");
    expect(serieDeNota("boleta", "nota_debito")).toBe("BD01");
  });
});

describe("clasificación de motivos", () => {
  it("anulación y devolución total son motivos totales", () => {
    expect(esMotivoTotal(MOTIVOS_CREDITO.ANULACION)).toBe(true);
    expect(esMotivoTotal(MOTIVOS_CREDITO.ANULACION_RUC)).toBe(true);
    expect(esMotivoTotal(MOTIVOS_CREDITO.DEVOLUCION_TOTAL)).toBe(true);
  });

  it("un descuento NO lo es", () => {
    expect(esMotivoTotal(MOTIVOS_CREDITO.DESCUENTO_GLOBAL)).toBe(false);
    expect(esMotivoTotal(MOTIVOS_CREDITO.DISMINUCION_VALOR)).toBe(false);
  });

  it("la corrección de descripción no mueve dinero", () => {
    expect(esCorreccionSinImporte(MOTIVOS_CREDITO.CORRECCION_DESCRIPCION)).toBe(true);
    expect(esCorreccionSinImporte(MOTIVOS_CREDITO.DESCUENTO_GLOBAL)).toBe(false);
  });
});

describe("bloqueosNota", () => {
  it("una nota de crédito por el total no bloquea", () => {
    expect(
      bloqueosNota(FACTURA, "nota_credito", MOTIVOS_CREDITO.ANULACION, 528.99, HOY),
    ).toEqual([]);
  });

  it("sin documento no se emite", () => {
    const lista = bloqueosNota(null, "nota_credito", "01", 100, HOY);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.campo).toBe("documento");
  });

  it("no se corrige una nota con otra nota", () => {
    const nota = { ...FACTURA, tipo: "nota_credito" as const };
    expect(
      bloqueosNota(nota, "nota_credito", "01", 100, HOY).some((b) => b.campo === "documento"),
    ).toBe(true);
  });

  it("no se corrige un documento ya anulado", () => {
    const anulado = { ...FACTURA, estado: "anulado" as const };
    expect(
      bloqueosNota(anulado, "nota_credito", "01", 528.99, HOY).some(
        (b) => b.campo === "documento",
      ),
    ).toBe(true);
  });

  it("el motivo tiene que ser del catálogo del tipo", () => {
    // «11 · ajustes de exportación» es de débito: en una nota de crédito no
    // existe, y SUNAT rechaza el código.
    expect(
      bloqueosNota(FACTURA, "nota_credito", MOTIVOS_DEBITO.AJUSTE_EXPORTACION, 100, HOY)
        .some((b) => b.campo === "motivo"),
    ).toBe(true);
  });

  /** SUNAT rechaza una nota en cero con el error 2800. */
  it("una nota en cero no se emite", () => {
    expect(
      bloqueosNota(FACTURA, "nota_credito", MOTIVOS_CREDITO.DESCUENTO_GLOBAL, 0, HOY)
        .some((b) => b.campo === "monto"),
    ).toBe(true);
  });

  it("no se acredita más que el total del documento", () => {
    const lista = bloqueosNota(
      FACTURA,
      "nota_credito",
      MOTIVOS_CREDITO.DISMINUCION_VALOR,
      600,
      HOY,
    );
    expect(lista.some((b) => b.mensaje.includes("supera el total"))).toBe(true);
  });

  /**
   * Sin llevar la cuenta de lo ya acreditado se podrían emitir dos notas por
   * el total y acabar acreditando el doble de lo facturado.
   */
  it("descuenta lo que otras notas ya acreditaron", () => {
    const lista = bloqueosNota(
      FACTURA,
      "nota_credito",
      MOTIVOS_CREDITO.DISMINUCION_VALOR,
      300,
      HOY,
      400,
    );
    expect(lista.some((b) => b.mensaje.includes("Ya se acreditaron"))).toBe(true);
  });

  it("un motivo total exige el importe pendiente exacto", () => {
    expect(
      bloqueosNota(FACTURA, "nota_credito", MOTIVOS_CREDITO.ANULACION, 200, HOY)
        .some((b) => b.mensaje.includes("por el total pendiente")),
    ).toBe(true);
  });

  it("la nota no puede ser anterior al documento que corrige", () => {
    const lista = bloqueosNota(
      FACTURA,
      "nota_credito",
      MOTIVOS_CREDITO.ANULACION,
      528.99,
      "2026-08-01",
    );
    expect(lista.some((b) => b.campo === "fecha")).toBe(true);
  });

  it("una nota de DÉBITO puede pasarse del total: es un aumento", () => {
    expect(
      bloqueosNota(FACTURA, "nota_debito", MOTIVOS_DEBITO.INTERESES_MORA, 900, HOY),
    ).toEqual([]);
  });

  it("una boleta se corrige igual, y su nota va en serie B", () => {
    expect(
      bloqueosNota(BOLETA, "nota_credito", MOTIVOS_CREDITO.ANULACION, 528.99, HOY),
    ).toEqual([]);
    expect(serieDeNota(BOLETA.tipo, "nota_credito")).toBe("BC01");
  });
});

describe("avisosNota", () => {
  it("avisa si el documento no está aceptado por SUNAT", () => {
    const pendiente = { ...FACTURA, estado_sunat: "pendiente" as const };
    expect(
      avisosNota(pendiente, "nota_credito", "01", 528.99).some(
        (a) => a.clave === "sin-aceptar",
      ),
    ).toBe(true);
  });

  it("un documento aceptado no genera ese aviso", () => {
    expect(
      avisosNota(FACTURA, "nota_credito", MOTIVOS_CREDITO.DISMINUCION_VALOR, 100)
        .some((a) => a.clave === "sin-aceptar"),
    ).toBe(false);
  });

  it("avisa de que la nota no devuelve el dinero ya cobrado", () => {
    const cobrado = { ...FACTURA, pagado: 528.99, saldo: 0 };
    expect(
      avisosNota(cobrado, "nota_credito", "09", 100).some((a) => a.clave === "ya-cobrado"),
    ).toBe(true);
  });

  it("avisa de que un motivo total anula la operación entera", () => {
    expect(
      avisosNota(FACTURA, "nota_credito", MOTIVOS_CREDITO.ANULACION, 528.99)
        .some((a) => a.clave === "anula-todo"),
    ).toBe(true);
  });

  it("avisa de la detracción al anular", () => {
    const conSpot = { ...FACTURA, detraccion_aplica: true, detraccion_monto: 63.48 };
    expect(
      avisosNota(conSpot, "nota_credito", MOTIVOS_CREDITO.ANULACION, 528.99)
        .some((a) => a.clave === "detraccion"),
    ).toBe(true);
  });
});

describe("lineasDeNota", () => {
  it("un motivo total copia TODAS las líneas del documento", () => {
    const lineas = lineasDeNota(FACTURA, MOTIVOS_CREDITO.ANULACION, 528.99, "");
    expect(lineas).toHaveLength(2);
    expect(lineas.map((l) => l.codigo)).toEqual(["6205-2RS1/C3", "7210 BEP"]);
    expect(lineas[0]!.cantidad).toBe(20);
  });

  it("la corrección de descripción también las copia", () => {
    // Se emite por el mismo importe: el documento corregido sustituye al
    // anterior por completo.
    expect(
      lineasDeNota(FACTURA, MOTIVOS_CREDITO.CORRECCION_DESCRIPCION, 528.99, ""),
    ).toHaveLength(2);
  });

  /**
   * Un descuento va en UNA línea con su concepto. Repartir la rebaja entre las
   * líneas originales no lo decide el sistema: lo decide quien negocia.
   */
  it("un motivo parcial emite una sola línea con el concepto", () => {
    const lineas = lineasDeNota(
      FACTURA,
      MOTIVOS_CREDITO.DESCUENTO_GLOBAL,
      118,
      "Descuento comercial acordado",
    );
    expect(lineas).toHaveLength(1);
    expect(lineas[0]!.descripcion).toBe("Descuento comercial acordado");
    expect(lineas[0]!.cantidad).toBe(1);
    expect(lineas[0]!.producto_id).toBeNull();
  });

  it("sin concepto pone uno que al menos dice a qué documento pertenece", () => {
    const lineas = lineasDeNota(FACTURA, MOTIVOS_CREDITO.DISMINUCION_VALOR, 100, "  ");
    expect(lineas[0]!.descripcion).toContain("F001-00000001");
  });
});

describe("valorSinIgv y totalDeNota", () => {
  it("convierte un importe con IGV a la base gravada", () => {
    expect(valorSinIgv(118)).toBe(100);
    expect(valorSinIgv(528.99)).toBe(448.2966);
  });

  it("no inventa un valor con importes imposibles", () => {
    expect(valorSinIgv(0)).toBe(0);
    expect(valorSinIgv(-50)).toBe(0);
    expect(valorSinIgv(Number.NaN)).toBe(0);
  });

  /**
   * Pedir 118 da 118 justo; pero la vuelta no siempre es exacta, porque el
   * valor unitario tiene cuatro decimales. Enseñarlo antes de emitir evita la
   * sorpresa de teclear un número y ver otro en el documento.
   */
  it("el total de vuelta cuadra con lo que se pidió", () => {
    expect(totalDeNota(118)).toBe(118);
    expect(totalDeNota(528.99)).toBe(528.99);
  });

  it("y cuando no cuadra, es por un céntimo y se puede enseñar", () => {
    // Pedir 100 devuelve 100.01. La base son 84.7458 —cuatro decimales, que es
    // la escala de la columna— y el IGV se calcula sobre los 84.75 ya
    // redondeados: 15.26, no 15.25. La pantalla lo enseña antes de emitir para
    // que nadie teclee un número y vea otro en el documento.
    expect(totalDeNota(100)).toBe(100.01);

    // La diferencia se compara REDONDEADA. Restar dos flotantes y mirar el
    // resultado crudo da 0.010000000000005116, que «no es menor o igual a
    // 0.01» — el mismo error que este proyecto ya cometió una vez.
    for (const pedido of [50, 100, 118, 250.5, 528.99, 1000]) {
      const desvio = Math.round(Math.abs(totalDeNota(pedido) - pedido) * 100) / 100;
      expect(desvio, `${pedido} se desvió ${desvio}`).toBeLessThanOrEqual(0.01);
    }
  });
});
