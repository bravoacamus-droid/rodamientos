import { describe, expect, it } from "vitest";

import {
  costoEnAlmacen,
  diasDeAtraso,
  diasParaLlegar,
  estadoTransito,
  incidenciaGastos,
  ordenarImportaciones,
  resumir,
  sumarGastos,
  tonoTransito,
} from "./transito";
import type { EstadoTransito, Importacion } from "./tipos";

const HOY = "2026-08-26";

let n = 0;

function compra(campos: Partial<Importacion> = {}): Importacion {
  n += 1;
  return {
    id: `compra-${n}`,
    numero: `CMP-26-${String(n).padStart(5, "0")}`,
    proveedor_id: "p1",
    proveedor: "RODAMIENTOS DEL PACIFICO",
    fecha: "2026-08-01",
    fecha_estimada: "2026-09-15",
    documento_proveedor: "INV-4471",
    courier: "DHL",
    tracking: "1Z999AA1",
    subtotal: 1000,
    gastos: 200,
    total: 1180,
    estado: "registrada",
    lineas: 3,
    lineasRecibidas: 0,
    ...campos,
  };
}

describe("estadoTransito", () => {
  it("lo que ya llegó no está atrasado, aunque llegara tarde", () => {
    // El orden de las preguntas importa: al revés, una importación de marzo
    // que llegó en abril seguiría en rojo para siempre.
    const c = compra({ estado: "recibida", fecha_estimada: "2026-03-01" });
    expect(estadoTransito(c, HOY)).toBe("recibida");
  });

  it("lo que llegó a medias se distingue de lo que no ha llegado", () => {
    expect(estadoTransito(compra({ estado: "recibida_parcial" }), HOY)).toBe("parcial");
  });

  it("pasada la fecha, atrasada", () => {
    expect(estadoTransito(compra({ fecha_estimada: "2026-08-20" }), HOY)).toBe("atrasada");
  });

  it("el mismo día de la fecha todavía no está atrasada", () => {
    expect(estadoTransito(compra({ fecha_estimada: HOY }), HOY)).toBe("en_camino");
  });

  it("sin fecha estimada se dice, no se inventa", () => {
    // El courier no siempre la da al pedir. «Sin fecha» es información: no se
    // puede reclamar un retraso que nadie prometió.
    expect(estadoTransito(compra({ fecha_estimada: null }), HOY)).toBe("sin_fecha");
  });
});

describe("diasDeAtraso", () => {
  it("cuenta desde la fecha prometida", () => {
    expect(diasDeAtraso(compra({ fecha_estimada: "2026-08-20" }), HOY)).toBe(6);
  });

  it("cero si todavía no toca", () => {
    expect(diasDeAtraso(compra({ fecha_estimada: "2026-09-15" }), HOY)).toBe(0);
  });

  it("cero si ya llegó, aunque llegara tarde", () => {
    expect(
      diasDeAtraso(compra({ estado: "recibida", fecha_estimada: "2026-01-01" }), HOY),
    ).toBe(0);
  });
});

describe("diasParaLlegar", () => {
  it("cuenta lo que falta", () => {
    expect(diasParaLlegar(compra({ fecha_estimada: "2026-09-05" }), HOY)).toBe(10);
  });

  it("null cuando ya se pasó: eso es atraso, no espera", () => {
    expect(diasParaLlegar(compra({ fecha_estimada: "2026-08-01" }), HOY)).toBeNull();
  });

  it("null sin fecha", () => {
    expect(diasParaLlegar(compra({ fecha_estimada: null }), HOY)).toBeNull();
  });
});

describe("incidenciaGastos", () => {
  it("dice cuánto encarecen la mercadería", () => {
    expect(incidenciaGastos({ subtotal: 1000, gastos: 200 })).toBe(20);
  });

  it("sin gastos, cero", () => {
    expect(incidenciaGastos({ subtotal: 1000, gastos: 0 })).toBe(0);
  });

  it("sin subtotal devuelve null, no infinito", () => {
    // Una compra sin importe es un documento a medio llenar, no una
    // importación carísima.
    expect(incidenciaGastos({ subtotal: 0, gastos: 200 })).toBeNull();
  });
});

describe("costoEnAlmacen", () => {
  it("aplica el mismo factor que la base al recibir", () => {
    // 1 + 200/1000 = 1,2. Es exactamente lo que hace `recepcionar_mercaderia`
    // desde la 022.
    expect(costoEnAlmacen({ subtotal: 1000, gastos: 200 }, 10)).toBe(12);
  });

  it("sin gastos el costo no cambia", () => {
    expect(costoEnAlmacen({ subtotal: 1000, gastos: 0 }, 10)).toBe(10);
  });

  it("sin subtotal devuelve el costo tal cual, no cero", () => {
    expect(costoEnAlmacen({ subtotal: 0, gastos: 50 }, 10)).toBe(10);
  });
});

describe("ordenarImportaciones", () => {
  it("lo atrasado primero, y dentro de eso lo que más lleva esperando", () => {
    const orden = ordenarImportaciones(
      [
        compra({ numero: "A", fecha_estimada: "2026-09-01" }),
        compra({ numero: "B", fecha_estimada: "2026-07-01" }),
        compra({ numero: "C", fecha_estimada: "2026-08-20" }),
      ],
      HOY,
    );
    expect(orden.map((c) => c.numero)).toEqual(["B", "C", "A"]);
  });

  it("lo ya recibido va al final, no estorba", () => {
    const orden = ordenarImportaciones(
      [
        compra({ numero: "LLEGO", estado: "recibida" }),
        compra({ numero: "VIENE", fecha_estimada: "2026-09-01" }),
      ],
      HOY,
    );
    expect(orden[0]?.numero).toBe("VIENE");
  });

  it("entre las que vienen, la que llega antes arriba", () => {
    const orden = ordenarImportaciones(
      [
        compra({ numero: "TARDE", fecha_estimada: "2026-12-01" }),
        compra({ numero: "PRONTO", fecha_estimada: "2026-09-01" }),
      ],
      HOY,
    );
    expect(orden[0]?.numero).toBe("PRONTO");
  });

  it("no toca el array que recibe", () => {
    const entrada = [compra({ numero: "A" }), compra({ numero: "B" })];
    const copia = [...entrada];
    ordenarImportaciones(entrada, HOY);
    expect(entrada).toEqual(copia);
  });
});

describe("resumir", () => {
  it("todo lo que no ha llegado del todo cuenta como en camino", () => {
    // Incluida la atrasada y la que llegó a medias: la pregunta es cuánto
    // dinero hay fuera, no cuántos paquetes van puntuales.
    const r = resumir(
      [
        compra({ fecha_estimada: "2026-09-01", subtotal: 100, gastos: 10 }),
        compra({ fecha_estimada: "2026-08-01", subtotal: 200, gastos: 20 }),
        compra({ estado: "recibida_parcial", subtotal: 300, gastos: 30 }),
        compra({ estado: "recibida", subtotal: 999, gastos: 99 }),
      ],
      HOY,
    );
    expect(r.enCamino).toBe(3);
    expect(r.atrasadas).toBe(1);
    expect(r.valorEnCamino).toBe(600);
    expect(r.gastosEnCamino).toBe(60);
  });

  it("sin importaciones abiertas, ceros", () => {
    const r = resumir([compra({ estado: "recibida" })], HOY);
    expect(r.enCamino).toBe(0);
    expect(r.valorEnCamino).toBe(0);
  });
});

describe("sumarGastos", () => {
  it("suma sin arrastrar decimales de coma flotante", () => {
    expect(sumarGastos([{ monto: 0.1 }, { monto: 0.2 }])).toBe(0.3);
  });

  it("de una lista vacía, cero", () => {
    expect(sumarGastos([])).toBe(0);
  });
});

describe("tonoTransito", () => {
  it.each([
    ["atrasada", "danger"],
    ["en_camino", "brand"],
    ["parcial", "warning"],
    ["recibida", "success"],
    ["sin_fecha", "neutral"],
  ] as Array<[EstadoTransito, string]>)("%s → %s", (estado, tono) => {
    expect(tonoTransito(estado)).toBe(tono);
  });
});
