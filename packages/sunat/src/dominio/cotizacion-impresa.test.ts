import { describe, it, expect } from "vitest";
import { armarCotizacionImpresa, type DatosCotizacion } from "./cotizacion-impresa";

/**
 * Lo que decide qué se ve en la hoja de la cotización.
 *
 * Estas reglas estaban escritas dos veces —una en el panel y otra en la hoja
 * pública— y cada copia tenía su criterio. Ahora hay una sola, y aquí se fija:
 * si alguna cambia sin querer, el vendedor y el cliente vuelven a mirar papeles
 * distintos del mismo trato y nadie se enteraría hasta el reclamo.
 */

function datos(extra: Partial<DatosCotizacion> = {}): DatosCotizacion {
  return {
    emisor: { razonSocial: "RODATECH SAC", ruc: "20000000001", direccion: "AV DEMO 123" },
    numero: "COT-001004",
    emision: "2026-08-03",
    validaHasta: "2026-08-18",
    cliente: { nombre: "Cliente mostrador" },
    total: 180,
    lineas: [
      { descripcion: "Batería", cantidad: 1, unitario: 180, importe: 180 },
    ],
    ...extra,
  };
}

describe("fechas y validez", () => {
  it("las fechas van en AAAA-MM-DD, como el comprobante que sale de la cotización", async () => {
    const c = armarCotizacionImpresa(datos());
    expect(c.fechaEmision).toBe("2026-08-03");
    expect(c.validaHasta).toBe("2026-08-18");
  });

  it("calcula los días de validez, que se entienden sin mirar el calendario", () => {
    expect(armarCotizacionImpresa(datos()).diasValidez).toBe(15);
  });

  it("una cotización ya vencida no anuncia días de validez negativos", () => {
    const c = armarCotizacionImpresa(
      datos({ emision: "2026-08-03", validaHasta: "2026-07-20" }),
    );
    expect(c.diasValidez).toBeNull();
  });

  it("sin fecha de vencimiento no inventa una validez", () => {
    const c = armarCotizacionImpresa(datos({ validaHasta: null }));
    expect(c.validaHasta).toBeNull();
    expect(c.diasValidez).toBeNull();
  });
});

describe("documento del cliente", () => {
  // La cotización guarda el número pero no el tipo: se pide un dato al vuelo en
  // el mostrador. El tipo se deduce del largo, y solo cuando es inequívoco.
  it("once dígitos es un RUC", () => {
    const c = armarCotizacionImpresa(
      datos({ cliente: { nombre: "Empresa SAC", doc: "20505973522" } }),
    );
    expect(c.cliente.tipoDoc).toBe("RUC");
  });

  it("ocho dígitos es un DNI", () => {
    const c = armarCotizacionImpresa(
      datos({ cliente: { nombre: "Juan", doc: "44556677" } }),
    );
    expect(c.cliente.tipoDoc).toBe("DNI");
  });

  it("cualquier otro largo se rotula «Doc.» en vez de arriesgar una etiqueta falsa", () => {
    // Un carné de extranjería o un pasaporte etiquetados como DNI en un papel
    // que después se usa para facturar es peor que no etiquetarlos.
    const c = armarCotizacionImpresa(
      datos({ cliente: { nombre: "Visitante", doc: "X1234" } }),
    );
    expect(c.cliente.tipoDoc).toBe("Doc.");
  });

  it("sin documento no rotula nada", () => {
    expect(armarCotizacionImpresa(datos()).cliente.tipoDoc).toBeNull();
  });
});

describe("totales y moneda", () => {
  it("el total es lo que paga el cliente y el IGV sale por dentro", () => {
    // Los precios incluyen IGV: la base se obtiene dividiendo, no multiplicando.
    const c = armarCotizacionImpresa(datos({ total: 180 }));
    expect(c.total).toBe(180);
    expect(c.opGravada).toBe(152.54);
    expect(c.igv).toBe(27.46);
    expect(c.opGravada + c.igv).toBe(180);
  });

  it("con descuento el subtotal es lo de antes de la rebaja", () => {
    // `quotes.total` viene con el descuento YA restado (0119).
    const c = armarCotizacionImpresa(datos({ total: 170, descuento: 10 }));
    expect(c.subtotal).toBe(180);
    expect(c.descuento).toBe(10);
    expect(c.total).toBe(170);
  });

  it("en soles el símbolo es S/ y las letras dicen SOLES", () => {
    const c = armarCotizacionImpresa(datos({ total: 180 }));
    expect(c.simbolo).toBe("S/");
    expect(c.enLetras).toContain("SOLES");
  });

  it("en dólares cambian el símbolo y las letras: un US$ rotulado S/ es un error de precio", () => {
    const c = armarCotizacionImpresa(
      datos({ moneda: "USD", tipoCambio: 3.75, total: 100 }),
    );
    expect(c.simbolo).toBe("US$");
    expect(c.enLetras).toContain("DÓLARES");
    expect(c.tipoCambio).toBe(3.75);
  });

  it("una moneda desconocida cae a soles antes que imprimir un símbolo inventado", () => {
    const c = armarCotizacionImpresa(datos({ moneda: "EUR" }));
    expect(c.moneda).toBe("PEN");
    expect(c.simbolo).toBe("S/");
  });
});

describe("cabecera del emisor", () => {
  it("une distrito, provincia y departamento como el comprobante", () => {
    const c = armarCotizacionImpresa(
      datos({
        emisor: {
          razonSocial: "RODATECH SAC",
          ruc: "20000000001",
          direccion: "AV DEMO 123",
          distrito: "LIMA",
          provincia: "LIMA",
          departamento: "LIMA",
        },
      }),
    );
    expect(c.emisor.ubicacion).toBe("LIMA - LIMA - LIMA");
  });

  it("sin distrito la ubicación queda nula, no una línea en blanco", () => {
    // `join` sobre una lista vacía devuelve "", que imprimiría un renglón vacío
    // en la cabecera del papel.
    expect(armarCotizacionImpresa(datos()).emisor.ubicacion).toBeNull();
  });

  it("si la ubicación ya viene armada se respeta: así la manda la RPC pública", () => {
    const c = armarCotizacionImpresa(
      datos({
        emisor: {
          razonSocial: "RODATECH SAC",
          ruc: "20000000001",
          ubicacion: "LIMA, LIMA, LIMA",
        },
      }),
    );
    expect(c.emisor.ubicacion).toBe("LIMA, LIMA, LIMA");
  });
});

describe("condición de pago", () => {
  it("traduce el código a palabras", () => {
    expect(armarCotizacionImpresa(datos({ condicionPago: "credito" })).condicionPago)
      .toBe("Crédito");
  });

  it("sin condición asume contado, que es como se cotiza normalmente", () => {
    expect(armarCotizacionImpresa(datos()).condicionPago).toBe("Contado");
  });
});
