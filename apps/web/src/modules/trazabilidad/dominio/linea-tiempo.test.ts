import { describe, expect, it } from "vitest";

import {
  agruparPorDia,
  contarPorLado,
  dispersionCotizada,
  margenDeReferencia,
  ordenarEventos,
  porCliente,
  porProveedor,
  tonoEvento,
} from "./linea-tiempo";
import type { Evento, EventoTrazabilidad, ResumenTrazabilidad } from "./tipos";

const PRODUCTO = "aaaaaaaa-1111-1111-1111-111111111111";

/** Secuencia por evento, igual que la de la vista. */
const SEQ: Record<Evento, number> = {
  compra: 1,
  recepcion: 2,
  cotizacion: 3,
  factura: 4,
  nota_credito: 5,
  nota_debito: 5,
};

let n = 0;

function evento(campos: Partial<EventoTrazabilidad> = {}): EventoTrazabilidad {
  n += 1;
  const ev = campos.evento ?? "compra";
  const dia = campos.dia ?? "2026-08-25";
  return {
    producto_id: PRODUCTO,
    fecha: `${dia}T00:00:00+00:00`,
    dia,
    lado: ev === "compra" || ev === "recepcion" ? "compra" : "venta",
    evento: ev,
    documento_id: `doc-${n}`,
    documento: `DOC-${n}`,
    contraparte_id: `parte-${n}`,
    contraparte: "PROVEEDOR UNO",
    contraparte_doc: "20100047218",
    cantidad: 10,
    unitario: 3.26,
    importe: 32.6,
    estado: "recibida",
    referencia: null,
    secuencia: SEQ[ev],
    ...campos,
  };
}

describe("ordenarEventos", () => {
  it("los días van del más reciente al más antiguo", () => {
    const orden = ordenarEventos([
      evento({ dia: "2026-08-20" }),
      evento({ dia: "2026-08-26" }),
      evento({ dia: "2026-08-22" }),
    ]);
    expect(orden.map((e) => e.dia)).toEqual([
      "2026-08-26",
      "2026-08-22",
      "2026-08-20",
    ]);
  });

  it("dentro del día se cuenta la historia hacia adelante", () => {
    const orden = ordenarEventos([
      evento({ evento: "factura" }),
      evento({ evento: "compra" }),
      evento({ evento: "cotizacion" }),
      evento({ evento: "recepcion" }),
    ]);
    expect(orden.map((e) => e.evento)).toEqual([
      "compra",
      "recepcion",
      "cotizacion",
      "factura",
    ]);
  });

  it("la recepción no se va al final del día por llevar hora", () => {
    // Es el fallo que se vio con datos reales: la recepción viene del kardex,
    // que sí guarda hora, mientras el resto cae a medianoche. Ordenando por
    // `fecha` se colaba detrás de la factura del mismo día.
    const orden = ordenarEventos([
      evento({ evento: "factura", fecha: "2026-08-25T00:00:00+00:00" }),
      evento({ evento: "recepcion", fecha: "2026-08-25T14:32:00+00:00" }),
    ]);
    expect(orden[0]?.evento).toBe("recepcion");
  });

  it("no toca el array que recibe", () => {
    const entrada = [evento({ dia: "2026-08-20" }), evento({ dia: "2026-08-26" })];
    const copia = [...entrada];
    ordenarEventos(entrada);
    expect(entrada).toEqual(copia);
  });
});

describe("agruparPorDia", () => {
  it("un encabezado por fecha", () => {
    const grupos = agruparPorDia([
      evento({ dia: "2026-08-25", evento: "compra" }),
      evento({ dia: "2026-08-25", evento: "factura" }),
      evento({ dia: "2026-08-26", evento: "cotizacion" }),
    ]);
    expect(grupos.map((g) => g.dia)).toEqual(["2026-08-26", "2026-08-25"]);
    expect(grupos[1]?.eventos).toHaveLength(2);
  });

  it("de una lista vacía no inventa días", () => {
    expect(agruparPorDia([])).toEqual([]);
  });
});

describe("porProveedor", () => {
  it("ordena por el mejor precio, no por la fecha", () => {
    const lista = porProveedor([
      evento({ evento: "compra", contraparte_id: "caro", contraparte: "CARO", unitario: 4 }),
      evento({ evento: "compra", contraparte_id: "barato", contraparte: "BARATO", unitario: 3 }),
    ]);
    expect(lista.map((p) => p.nombre)).toEqual(["BARATO", "CARO"]);
  });

  it("no cuenta la recepción: repetiría la misma compra", () => {
    // La recepción trae el mismo trato con el costo ya cargado de gastos.
    // Sumarla diría que se le compró dos veces al proveedor.
    const lista = porProveedor([
      evento({ evento: "compra", contraparte_id: "p1", unitario: 3 }),
      evento({ evento: "recepcion", contraparte_id: "p1", unitario: 3.4 }),
    ]);
    expect(lista).toHaveLength(1);
    expect(lista[0]?.veces).toBe(1);
    expect(lista[0]?.mejorPrecio).toBe(3);
  });

  it("guarda el mejor y el último por separado", () => {
    const lista = porProveedor([
      evento({ evento: "compra", contraparte_id: "p1", unitario: 3, dia: "2026-01-10" }),
      evento({ evento: "compra", contraparte_id: "p1", unitario: 5, dia: "2026-08-10" }),
    ]);
    expect(lista[0]?.mejorPrecio).toBe(3);
    expect(lista[0]?.ultimoPrecio).toBe(5);
    expect(lista[0]?.ultimaFecha).toBe("2026-08-10");
  });
});

describe("porCliente", () => {
  it("ordena por lo más reciente", () => {
    const lista = porCliente([
      evento({ evento: "factura", contraparte_id: "viejo", contraparte: "VIEJO", dia: "2026-01-01" }),
      evento({ evento: "factura", contraparte_id: "nuevo", contraparte: "NUEVO", dia: "2026-08-01" }),
    ]);
    expect(lista.map((c) => c.nombre)).toEqual(["NUEVO", "VIEJO"]);
  });

  it("separa cotizaciones de ventas", () => {
    const lista = porCliente([
      evento({ evento: "cotizacion", contraparte_id: "c1" }),
      evento({ evento: "cotizacion", contraparte_id: "c1" }),
      evento({ evento: "factura", contraparte_id: "c1" }),
    ]);
    expect(lista[0]?.cotizaciones).toBe(2);
    expect(lista[0]?.ventas).toBe(1);
  });

  it("las notas no son un precio ofrecido", () => {
    const lista = porCliente([
      evento({ evento: "factura", contraparte_id: "c1", unitario: 10, dia: "2026-08-01" }),
      evento({ evento: "nota_credito", contraparte_id: "c1", unitario: 10, dia: "2026-08-05" }),
    ]);
    expect(lista[0]?.ventas).toBe(1);
    expect(lista[0]?.ultimaFecha).toBe("2026-08-01");
  });
});

describe("margenDeReferencia", () => {
  const resumen = (campos: Partial<ResumenTrazabilidad> = {}): ResumenTrazabilidad => ({
    eventos: 0,
    mejorProveedor: null,
    ultimaCompra: null,
    proveedores: 0,
    ultimaCotizacion: null,
    ultimaVenta: null,
    clientes: 0,
    unidadesVendidas: 0,
    cotizadoMin: null,
    cotizadoMax: null,
    ...campos,
  });

  const ref = (unitario: number) => ({
    id: "x",
    nombre: "X",
    unitario,
    fecha: "2026-08-25",
    documento: "D",
  });

  it("mide sobre el costo, como el resto del sistema", () => {
    const m = margenDeReferencia(
      resumen({ mejorProveedor: ref(10), ultimaCotizacion: ref(12) }),
    );
    expect(m).toBe(20);
  });

  it("sin compra o sin cotización no inventa un número", () => {
    expect(margenDeReferencia(resumen({ ultimaCotizacion: ref(12) }))).toBeNull();
    expect(margenDeReferencia(resumen({ mejorProveedor: ref(10) }))).toBeNull();
  });
});

describe("dispersionCotizada", () => {
  const base: ResumenTrazabilidad = {
    eventos: 0,
    mejorProveedor: null,
    ultimaCompra: null,
    proveedores: 0,
    ultimaCotizacion: null,
    ultimaVenta: null,
    clientes: 0,
    unidadesVendidas: 0,
    cotizadoMin: null,
    cotizadoMax: null,
  };

  it("dice cuánto se separa el precio más caro del más barato", () => {
    expect(dispersionCotizada({ ...base, cotizadoMin: 3.9, cotizadoMax: 7 })).toBe(
      79.49,
    );
  });

  it("un precio único no tiene dispersión", () => {
    expect(dispersionCotizada({ ...base, cotizadoMin: 3.92, cotizadoMax: 3.92 })).toBe(0);
  });

  it("sin cotizaciones devuelve null, no cero", () => {
    expect(dispersionCotizada(base)).toBeNull();
  });
});

describe("tonoEvento", () => {
  it.each([
    ["compra", "brand"],
    ["recepcion", "brand"],
    ["factura", "success"],
    ["nota_credito", "warning"],
    ["cotizacion", "neutral"],
  ] as Array<[Evento, string]>)("%s → %s", (ev, tono) => {
    expect(tonoEvento(ev)).toBe(tono);
  });
});

describe("contarPorLado", () => {
  it("cuenta cada lado por separado", () => {
    const eventos = [
      evento({ evento: "compra" }),
      evento({ evento: "recepcion" }),
      evento({ evento: "factura" }),
    ];
    expect(contarPorLado(eventos, "compra")).toBe(2);
    expect(contarPorLado(eventos, "venta")).toBe(1);
  });
});
