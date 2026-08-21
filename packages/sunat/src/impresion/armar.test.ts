import { describe, it, expect } from "vitest";
import { armarComprobanteImpreso, type DatosComprobante } from "./armar";

/**
 * Lo que decide qué se ve en el papel.
 *
 * El comprobante impreso no lo revisa nadie hasta que un cliente reclama: si
 * una regla se rompe, el error viaja impreso y en el enlace que recibe el
 * comprador. Aquí se fijan las decisiones del formato que pidió Oscar y que un
 * cambio despistado dejaría en blanco sin que salte ningún error.
 */

function datos(extra: Partial<DatosComprobante> = {}): DatosComprobante {
  return {
    emisor: {
      ruc: "20000000001",
      razonSocial: "RODATECH SAC",
      direccion: "AV DEMO 123",
      esPrueba: false,
    },
    tipoDocumento: "03",
    serie: "B001",
    correlativo: 1,
    // Mediodía UTC: cae en el mismo día en Lima (UTC-5) con cualquier ajuste.
    fechaEmision: new Date("2026-08-03T12:00:00Z"),
    moneda: "PEN",
    receptor: { nombre: "Cliente", tipoDoc: "1", numDoc: "44556677" },
    opGravada: 84.75,
    igv: 15.25,
    total: 100,
    estado: "aceptado",
    items: [
      { descripcion: "Batería", cantidad: 1, importeConIgv: 100, igv: 15.25 },
    ],
    ...extra,
  };
}

describe("condición de pago y vencimiento", () => {
  it("al contado no imprime vencimiento: sería repetir la fecha de emisión", async () => {
    const c = await armarComprobanteImpreso(datos({ condicionPago: "contado" }));
    expect(c.condicionPago).toBe("Contado");
    expect(c.fechaVencimiento).toBe("");
  });

  it("a crédito imprime el vencimiento, que es el dato que reclama el cobro", async () => {
    const c = await armarComprobanteImpreso(
      datos({ condicionPago: "credito", fechaVencimiento: "2026-09-02" }),
    );
    expect(c.condicionPago).toBe("Crédito");
    expect(c.fechaVencimiento).toBe("2026-09-02");
  });

  it("el vencimiento no se adelanta un día por la zona horaria", async () => {
    // `due_date` es un `date` de Postgres: llega como "2026-09-02", sin hora.
    // Leído como medianoche UTC y convertido a Lima (UTC-5) retrocedería al
    // día 1, e imprimiríamos un vencimiento anterior al pactado.
    const c = await armarComprobanteImpreso(
      datos({ condicionPago: "credito", fechaVencimiento: "2026-01-01" }),
    );
    expect(c.fechaVencimiento).toBe("2026-01-01");
  });

  it("sin condición declarada asume contado, que es la venta normal", async () => {
    const c = await armarComprobanteImpreso(datos());
    expect(c.condicionPago).toBe("Contado");
  });
});

describe("los cobros del papel", () => {
  it("lista cada cobro con su monto: una venta mixta se pagó dos veces", async () => {
    // Con un solo método y el total al lado, esta venta salía impresa como
    // «Efectivo — S/ 100», un cobro que nunca ocurrió.
    const c = await armarComprobanteImpreso(
      datos({
        pagos: [
          { metodo: "efectivo", monto: 60 },
          { metodo: "yape", monto: 40 },
        ],
      }),
    );
    expect(c.pagos).toEqual([
      { metodo: "Efectivo", monto: 60 },
      { metodo: "Yape", monto: 40 },
    ]);
  });

  it("una lista vacía es una venta a crédito sin cobrar, no un dato que falta", async () => {
    // Distinto de no mandar nada: aquí SÍ se sabe, y lo que se sabe es que no
    // ha entrado plata. El papel no imprime el bloque de pagos.
    const c = await armarComprobanteImpreso(
      datos({ condicionPago: "credito", formaPago: "credito", pagos: [] }),
    );
    expect(c.pagos).toEqual([]);
  });

  it("sin lista cae al método principal por el total, que es lo único que se sabe", async () => {
    const c = await armarComprobanteImpreso(datos({ formaPago: "tarjeta" }));
    expect(c.pagos).toEqual([{ metodo: "Tarjeta", monto: 100 }]);
  });

  it("sin lista y sin método no inventa un cobro", async () => {
    const c = await armarComprobanteImpreso(datos());
    expect(c.pagos).toEqual([]);
  });

  it("descarta los cobros en cero: ocupan una línea y no dicen nada", async () => {
    const c = await armarComprobanteImpreso(
      datos({ pagos: [{ metodo: "efectivo", monto: 100 }, { metodo: "yape", monto: 0 }] }),
    );
    expect(c.pagos).toEqual([{ metodo: "Efectivo", monto: 100 }]);
  });

  it("un método desconocido se muestra tal cual también en la lista", async () => {
    const c = await armarComprobanteImpreso(
      datos({ pagos: [{ metodo: "izipay", monto: 100 }] }),
    );
    expect(c.pagos).toEqual([{ metodo: "izipay", monto: 100 }]);
  });
});

describe("enlace para consultar el comprobante", () => {
  it("viaja al pie del papel cuando hay página pública", async () => {
    const c = await armarComprobanteImpreso(
      datos({ enlace: "https://tienda.pe/comprobante/abc123" }),
    );
    expect(c.enlace).toBe("https://tienda.pe/comprobante/abc123");
  });

  it("sin enlace queda vacío y el pie cae a la leyenda de SUNAT", async () => {
    const c = await armarComprobanteImpreso(datos());
    expect(c.enlace).toBe("");
  });
});

describe("forma de pago", () => {
  it("traduce el código a palabras", async () => {
    const c = await armarComprobanteImpreso(datos({ formaPago: "yape" }));
    expect(c.formaPago).toBe("Yape");
  });

  it("un método desconocido se muestra tal cual, no desaparece", async () => {
    // Preferimos leer "izipay" en el papel a no saber cómo se cobró.
    const c = await armarComprobanteImpreso(datos({ formaPago: "izipay" }));
    expect(c.formaPago).toBe("izipay");
  });

  it("sin método registrado queda vacío y el papel no imprime la línea", async () => {
    const c = await armarComprobanteImpreso(datos());
    expect(c.formaPago).toBe("");
  });
});

describe("código interno de la línea", () => {
  it("viaja al papel cuando la línea tiene producto", async () => {
    const c = await armarComprobanteImpreso(
      datos({
        items: [
          { descripcion: "Batería", cantidad: 1, importeConIgv: 100, igv: 15.25, codigo: "BAT-001" },
        ],
      }),
    );
    expect(c.lineas[0]!.codigo).toBe("BAT-001");
  });

  it("queda vacío en una venta libre o el cobro de una reparación", async () => {
    // Esas líneas no tienen product_id, así que no hay sku que congelar.
    const c = await armarComprobanteImpreso(datos());
    expect(c.lineas[0]!.codigo).toBe("");
  });

  it("la columna DTO. del A4 sale en cero mientras no haya descuento por línea", async () => {
    // Se imprime igual: está en el formato, y un comprador que la busca y no la
    // encuentra pregunta. Cuando exista el descuento por línea, saldrá de aquí.
    const c = await armarComprobanteImpreso(datos());
    expect(c.lineas[0]!.descuento).toBe(0);
  });
});

describe("cuentas bancarias", () => {
  it("traduce la moneda a como se rotula una cuenta", async () => {
    const c = await armarComprobanteImpreso(
      datos({
        cuentas: [
          { bank: "Scotiabank", currency: "PEN", account_number: "198-656", cci: null },
          { bank: "BBVA", currency: "USD", account_number: "745-859", cci: "0091" },
        ],
      }),
    );
    expect(c.cuentas).toEqual([
      { banco: "Scotiabank", moneda: "Soles", numero: "198-656", cci: null },
      { banco: "BBVA", moneda: "Dólares", numero: "745-859", cci: "0091" },
    ]);
  });

  it("sin cuentas cargadas devuelve lista vacía, no explota", async () => {
    const c = await armarComprobanteImpreso(datos());
    expect(c.cuentas).toEqual([]);
  });
});

describe("emisor y receptor del ticket", () => {
  it("la hora sale en horario de Lima, no en el del servidor", async () => {
    // 12:00 UTC son las 07:00 en Lima. Vercel corre en UTC: sin la zona
    // horaria explícita el ticket diría una hora que no ocurrió en la tienda.
    const c = await armarComprobanteImpreso(datos());
    expect(c.horaEmision).toBe("07:00:00");
    // AAAA-MM-DD, el formato de las dos referencias de Oscar y el único que no
    // se puede confundir con el del otro hemisferio.
    expect(c.fechaEmision).toBe("2026-08-03");
  });

  it("la fecha se toma en Lima, no en UTC: una venta de la noche no salta al día siguiente", async () => {
    // 01:30 UTC del día 4 son las 20:30 del día 3 en Lima. El papel tiene que
    // decir el día en que se vendió en la tienda.
    const c = await armarComprobanteImpreso(
      datos({ fechaEmision: new Date("2026-08-04T01:30:00Z") }),
    );
    expect(c.fechaEmision).toBe("2026-08-03");
    expect(c.horaEmision).toBe("20:30:00");
  });

  it("los datos de contacto ausentes quedan vacíos, no como 'null'", async () => {
    const c = await armarComprobanteImpreso(datos());
    expect(c.emisor.telefono).toBe("");
    expect(c.emisor.email).toBe("");
    expect(c.emisor.logoUrl).toBe("");
    expect(c.receptor.direccion).toBe("");
    expect(c.vendedor).toBe("");
  });
});
