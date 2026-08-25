import { describe, expect, it } from "vitest";

import {
  aPayload,
  avisos,
  bloqueosBorrador,
  bloqueosEmision,
  estadoInicial,
  faltaPeso,
  pesoCalculado,
  pesoEfectivo,
  reducir,
  type Accion,
  type EstadoGuiaEnCurso,
} from "./constructor";
import type { CotizacionDespachable } from "./tipos";

const HOY = "2026-08-25";

/** Una cotización con una línea a medio despachar, que es el caso interesante. */
const COT: CotizacionDespachable = {
  id: "11111111-1111-1111-1111-111111111111",
  numero: "COT1-000001",
  fecha: HOY,
  cliente_id: "22222222-2222-2222-2222-222222222222",
  cliente: "MINERA LOS ANDES S.A.C.",
  cliente_documento: "20100047218",
  cliente_direccion: "Av. Industrial 1200, Ate",
  cliente_ubigeo: "150103",
  orden_compra_cliente: "OC-4471",
  lineas: [
    {
      cotizacion_item_id: "aaaa1111-1111-1111-1111-111111111111",
      producto_id: "p1",
      codigo: "6205-2RS1/C3",
      descripcion: "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
      unidad: "NIU",
      cantidad: 20,
      despachado: 5,
      peso_kg: 0.13,
    },
    {
      cotizacion_item_id: "bbbb2222-2222-2222-2222-222222222222",
      producto_id: "p2",
      codigo: "7210 BEP",
      descripcion: "RODAMIENTO DE BOLAS DE CONTACTO ANG.",
      unidad: "NIU",
      cantidad: 6,
      despachado: 6,
      peso_kg: 0.55,
    },
  ],
};

function construir(...acciones: Accion[]): EstadoGuiaEnCurso {
  return acciones.reduce(reducir, estadoInicial(HOY));
}

const conCotizacion = (...extra: Accion[]) =>
  construir({ tipo: "cargarCotizacion", cotizacion: COT }, ...extra);

describe("cargarCotizacion", () => {
  it("precarga SOLO lo que falta por despachar", () => {
    const estado = conCotizacion();

    // La segunda línea está entera despachada: no aparece. Volver a
    // proponerla es la forma más fácil de sacar lo mismo dos veces.
    expect(estado.lineas).toHaveLength(1);
    expect(estado.lineas[0]!.codigo).toBe("6205-2RS1/C3");
    expect(estado.lineas[0]!.cantidad).toBe(15);
  });

  it("toma la dirección del cliente como destino por defecto", () => {
    const estado = conCotizacion();
    expect(estado.direccionLlegada).toBe("Av. Industrial 1200, Ate");
    expect(estado.ubigeoLlegada).toBe("150103");
  });

  it("las claves son las de la línea de cotización, que ya son únicas", () => {
    const a = conCotizacion();
    const b = conCotizacion();
    expect(a.lineas.map((l) => l.key)).toEqual(b.lineas.map((l) => l.key));
  });
});

describe("cantidad", () => {
  const key = "aaaa1111-1111-1111-1111-111111111111";

  /**
   * Es la regla que de verdad importa: la guía saca stock, y sacar de más deja
   * el kardex diciendo que salió algo que nunca se vendió. No lo arregla
   * ningún documento posterior.
   */
  it("no deja despachar más de lo que queda pendiente", () => {
    const estado = conCotizacion({ tipo: "cantidad", key, valor: 99 });
    expect(estado.lineas[0]!.cantidad).toBe(15);
  });

  it("deja despachar menos", () => {
    const estado = conCotizacion({ tipo: "cantidad", key, valor: 4 });
    expect(estado.lineas[0]!.cantidad).toBe(4);
  });

  it("una cantidad basura cae a cero, no a uno", () => {
    // Cero significa «esta línea no va en esta guía», que es distinto de
    // «va una unidad».
    const estado = conCotizacion({ tipo: "cantidad", key, valor: Number.NaN });
    expect(estado.lineas[0]!.cantidad).toBe(0);
  });

  it("una clave que no existe no rompe nada", () => {
    const estado = conCotizacion({ tipo: "cantidad", key: "no-existe", valor: 5 });
    expect(estado.lineas[0]!.cantidad).toBe(15);
  });
});

describe("peso", () => {
  it("lo calcula del maestro cuando los productos lo tienen", () => {
    const estado = conCotizacion();
    // 15 × 0.13 = 1.95
    expect(pesoCalculado(estado)).toBe(1.95);
    expect(pesoEfectivo(estado)).toBe(1.95);
    expect(faltaPeso(estado)).toBe(false);
  });

  /**
   * El caso de HOY: ningún producto del catálogo tiene peso, así que el
   * cálculo da cero y la base rechaza la guía con `guia_peso_pos`.
   */
  it("sin pesos en el maestro, avisa de que falta", () => {
    const sinPeso: CotizacionDespachable = {
      ...COT,
      lineas: COT.lineas.map((l) => ({ ...l, peso_kg: 0 })),
    };
    const estado = construir({ tipo: "cargarCotizacion", cotizacion: sinPeso });

    expect(pesoCalculado(estado)).toBe(0);
    expect(faltaPeso(estado)).toBe(true);
    expect(bloqueosBorrador(estado).some((b) => b.campo === "peso")).toBe(true);
  });

  it("el peso declarado a mano manda sobre el del maestro", () => {
    const estado = conCotizacion({ tipo: "peso", valor: 12.5 });
    expect(pesoEfectivo(estado)).toBe(12.5);
    expect(faltaPeso(estado)).toBe(false);
  });

  it("un peso cero o negativo se trata como «no declarado»", () => {
    expect(conCotizacion({ tipo: "peso", valor: 0 }).pesoDeclarado).toBeNull();
    expect(conCotizacion({ tipo: "peso", valor: -3 }).pesoDeclarado).toBeNull();
  });

  it("redondea a tres decimales, que es lo que guarda la columna", () => {
    const estado = conCotizacion({ tipo: "peso", valor: 1.23456 });
    expect(estado.pesoDeclarado).toBe(1.235);
  });
});

describe("modalidad", () => {
  it("pasar a público suelta la placa", () => {
    const estado = conCotizacion(
      { tipo: "campo", campo: "transportistaPlaca", valor: "ABC-123" },
      { tipo: "modalidad", valor: "01" },
    );
    expect(estado.transportistaPlaca).toBe("");
  });

  it("pasar a privado suelta los datos del transportista", () => {
    const estado = conCotizacion(
      { tipo: "modalidad", valor: "01" },
      { tipo: "campo", campo: "transportistaDocumento", valor: "20100070970" },
      { tipo: "modalidad", valor: "02" },
    );
    expect(estado.transportistaDocumento).toBe("");
  });
});

describe("bloqueos", () => {
  it("sin cotización no se guarda", () => {
    const lista = bloqueosBorrador(estadoInicial(HOY));
    expect(lista.some((b) => b.campo === "cotizacion")).toBe(true);
  });

  it("con todo lo mínimo, el borrador se guarda", () => {
    const estado = conCotizacion({ tipo: "peso", valor: 2 });
    expect(bloqueosBorrador(estado)).toEqual([]);
  });

  it("sin dirección de entrega no se guarda", () => {
    const estado = conCotizacion({ tipo: "campo", campo: "direccionLlegada", valor: "  " });
    expect(bloqueosBorrador(estado).some((b) => b.campo === "destino")).toBe(true);
  });

  it("todas las líneas en cero es no despachar nada", () => {
    const estado = conCotizacion({
      tipo: "cantidad",
      key: "aaaa1111-1111-1111-1111-111111111111",
      valor: 0,
    });
    expect(bloqueosBorrador(estado).some((b) => b.campo === "lineas")).toBe(true);
  });

  /**
   * La separación borrador/emisión es la que pidió Willy: preparar la guía al
   * cerrar la venta, completarla cuando el camión ya tiene placa. La base hace
   * lo mismo con `guia_transporte_ok`.
   */
  it("el borrador NO exige transporte, pero emitir SÍ", () => {
    const estado = conCotizacion({ tipo: "peso", valor: 2 });

    expect(bloqueosBorrador(estado)).toEqual([]);
    expect(bloqueosEmision(estado).some((b) => b.campo === "transporte")).toBe(true);
  });

  it("con placa, el transporte privado ya puede emitir", () => {
    const estado = conCotizacion(
      { tipo: "peso", valor: 2 },
      { tipo: "campo", campo: "transportistaPlaca", valor: "ABC-123" },
    );
    expect(bloqueosEmision(estado)).toEqual([]);
  });

  it("el transporte público pide RUC y no placa", () => {
    const conPlaca = conCotizacion(
      { tipo: "peso", valor: 2 },
      { tipo: "modalidad", valor: "01" },
      { tipo: "campo", campo: "transportistaPlaca", valor: "ABC-123" },
    );
    expect(bloqueosEmision(conPlaca).some((b) => b.campo === "transporte")).toBe(true);

    const conRuc = conCotizacion(
      { tipo: "peso", valor: 2 },
      { tipo: "modalidad", valor: "01" },
      { tipo: "campo", campo: "transportistaDocumento", valor: "20100070970" },
    );
    expect(bloqueosEmision(conRuc)).toEqual([]);
  });
});

describe("avisos", () => {
  it("avisa de un despacho parcial y de cuánto queda", () => {
    const estado = conCotizacion({
      tipo: "cantidad",
      key: "aaaa1111-1111-1111-1111-111111111111",
      valor: 10,
    });
    const lista = avisos(estado);
    expect(lista.some((a) => a.mensaje.includes("Quedan 5"))).toBe(true);
  });

  it("un despacho completo no molesta", () => {
    const estado = conCotizacion({ tipo: "campo", campo: "ubigeoLlegada", valor: "150103" });
    expect(avisos(estado).some((a) => a.key.startsWith("aaaa"))).toBe(false);
  });

  it("avisa si el peso a mano no cuadra con el del maestro", () => {
    const estado = conCotizacion({ tipo: "peso", valor: 50 });
    expect(avisos(estado).some((a) => a.key === "peso")).toBe(true);
  });

  it("avisa de que falta el ubigeo, que SUNAT va a pedir", () => {
    const estado = conCotizacion({ tipo: "campo", campo: "ubigeoLlegada", valor: "" });
    expect(avisos(estado).some((a) => a.key === "ubigeo")).toBe(true);
  });
});

describe("aPayload", () => {
  it("nace SIEMPRE en borrador: emitir es otro paso, y es el que mueve stock", () => {
    const estado = conCotizacion({ tipo: "peso", valor: 2 });
    expect(aPayload(estado).estado).toBe("borrador");
  });

  it("manda el peso efectivo, no deja que lo calcule la función", () => {
    // Si lo calculara ella daría cero mientras el maestro no tenga pesos, y el
    // insert fallaría contra `guia_peso_pos` con un mensaje que no ayuda.
    const estado = conCotizacion({ tipo: "peso", valor: 7.5 });
    expect(aPayload(estado).peso_bruto_kg).toBe(7.5);
  });

  it("no manda las líneas en cero", () => {
    const estado = conCotizacion(
      { tipo: "peso", valor: 2 },
      { tipo: "cantidad", key: "aaaa1111-1111-1111-1111-111111111111", valor: 0 },
    );
    expect(aPayload(estado).items).toEqual([]);
  });

  it("en privado no viaja el transportista, y al revés", () => {
    const privado = aPayload(
      conCotizacion(
        { tipo: "peso", valor: 2 },
        { tipo: "campo", campo: "transportistaPlaca", valor: "ABC-123" },
      ),
    );
    expect(privado.transportista_placa).toBe("ABC-123");
    expect(privado.transportista_documento).toBeNull();

    const publico = aPayload(
      conCotizacion(
        { tipo: "peso", valor: 2 },
        { tipo: "modalidad", valor: "01" },
        { tipo: "campo", campo: "transportistaDocumento", valor: "20100070970" },
      ),
    );
    expect(publico.transportista_documento).toBe("20100070970");
    expect(publico.transportista_placa).toBeNull();
  });

  it("arrastra el vínculo con la línea de cotización", () => {
    const estado = conCotizacion({ tipo: "peso", valor: 2 });
    // Sin esto no se puede saber cuánto queda por despachar de cada línea.
    expect(aPayload(estado).items[0]!.cotizacion_item_id).toBe(
      "aaaa1111-1111-1111-1111-111111111111",
    );
  });
});
