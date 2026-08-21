import { describe, expect, it } from "vitest";

import {
  armarCotizacionImpresa,
  limpiarDescripcion,
  sumarDias,
  type DatosImpresion,
} from "./impresion";

const EMISOR = {
  razonSocial: "INVERSIONES RODATECH E.I.R.L.",
  nombreComercial: "RODATECH",
  ruc: "20601234567",
  direccion: "Av. Argentina 123, Lima",
  telefono: "01 4567890",
  email: "ventas@rodatech.pe",
  web: null,
  logoUrl: null,
};

const base = (parcial: Partial<DatosImpresion> = {}): DatosImpresion => ({
  emisor: EMISOR,
  numero: "COT1-000012",
  fecha: "2026-08-21",
  validezDias: 15,
  cliente: {
    razonSocial: "MINERA LOS ANDES S.A.C.",
    documento: "20100047218",
    tipoDocumento: "RUC",
    direccion: null,
    contacto: "Jorge Ramos",
  },
  vendedor: "Willy",
  tiempoEntrega: "Stock inmediato",
  condiciones: null,
  observaciones: null,
  ordenCompraCliente: null,
  mostrarDescuento: false,
  lineas: [
    {
      codigo: "6209-2RS1/C3",
      marca: "SKF",
      descripcion: "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
      cantidad: 4,
      unidad: "NIU",
      valorUnitario: 12.84,
      descuentoPct: 0,
    },
  ],
  ...parcial,
});

describe("C1 · solo valor unitario", () => {
  it("el papel NO tiene ninguna columna de precio con IGV", () => {
    // Es la corrección que motivó todo (13:25): el cliente comparaba el precio
    // con IGV contra el valor de la competencia y lo veía caro.
    const c = armarCotizacionImpresa(base());
    expect(c.columnas).toContain("Valor unit.");
    expect(c.columnas.join(" ")).not.toMatch(/precio unit/i);
    expect(c.lineas[0]).not.toHaveProperty("precioUnitario");
  });

  it("el valor unitario es el del maestro, sin multiplicar por 1.18", () => {
    const c = armarCotizacionImpresa(base());
    expect(c.lineas[0]?.valorUnitario).toBe(12.84);
  });
});

describe("C2 y C3 · marca en columna propia y código fuera de la descripción", () => {
  it("saca la marca y el código embebidos en la descripción", () => {
    const c = armarCotizacionImpresa(
      base({
        lineas: [
          {
            codigo: "6209-2RS1/C3",
            marca: "SKF",
            descripcion: "SKF 6209-2RS1/C3 RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
            cantidad: 1,
            unidad: "NIU",
            valorUnitario: 12.84,
            descuentoPct: 0,
          },
        ],
      }),
    );
    expect(c.lineas[0]?.descripcion).toBe("RODAMIENTO RIGIDO DE BOLAS 1 HIL.");
    expect(c.lineas[0]?.marca).toBe("SKF");
    expect(c.lineas[0]?.codigo).toBe("6209-2RS1/C3");
  });

  it("sin marca pone una raya, no una celda en blanco", () => {
    // Una celda vacía en un papel se lee como un olvido.
    const c = armarCotizacionImpresa(
      base({
        lineas: [{ ...base().lineas[0]!, marca: null }],
      }),
    );
    expect(c.lineas[0]?.marca).toBe("—");
  });
});

describe("limpiarDescripcion", () => {
  it("no toca una descripción que ya está limpia", () => {
    expect(
      limpiarDescripcion("RODAMIENTO RIGIDO DE BOLAS 1 HIL.", "6209-2RS1/C3", "SKF"),
    ).toBe("RODAMIENTO RIGIDO DE BOLAS 1 HIL.");
  });

  it("quita el código venga donde venga", () => {
    expect(limpiarDescripcion("RODAMIENTO 6205 BOLAS", "6205", null)).toBe(
      "RODAMIENTO BOLAS",
    );
  });

  it("solo quita palabras SUELTAS, no trozos de otra palabra", () => {
    // "6205" dentro de "62050" no es el código; mutilarlo dejaría "0".
    expect(limpiarDescripcion("RODAMIENTO 62050 ESPECIAL", "6205", null)).toBe(
      "RODAMIENTO 62050 ESPECIAL",
    );
  });

  it("no distingue mayúsculas", () => {
    expect(limpiarDescripcion("skf RODAMIENTO", "X", "SKF")).toBe("RODAMIENTO");
  });

  it("limpia los separadores que quedan huérfanos", () => {
    expect(limpiarDescripcion("SKF - RODAMIENTO", "X", "SKF")).toBe("RODAMIENTO");
  });

  it("aguanta un código con caracteres de expresión regular", () => {
    // "6205-2RS1/C3" trae / y -; sin escapar reventaría el RegExp.
    expect(
      limpiarDescripcion("6205-2RS1/C3 RODAMIENTO", "6205-2RS1/C3", null),
    ).toBe("RODAMIENTO");
  });
});

describe("C4 · el orden de las columnas", () => {
  it("sin descuento son siete columnas en su orden", () => {
    expect(armarCotizacionImpresa(base()).columnas).toEqual([
      "Código", "Marca", "Descripción", "Cant.", "U.M.", "Valor unit.", "Importe",
    ]);
  });

  it("con descuento se intercala antes del importe", () => {
    const c = armarCotizacionImpresa(
      base({
        mostrarDescuento: true,
        lineas: [{ ...base().lineas[0]!, descuentoPct: 5 }],
      }),
    );
    expect(c.columnas).toEqual([
      "Código", "Marca", "Descripción", "Cant.", "U.M.", "Valor unit.", "Dscto.", "Importe",
    ]);
  });
});

describe("C5 · el descuento es una casilla", () => {
  it("desactivada, la columna no aparece aunque haya descuento", () => {
    const c = armarCotizacionImpresa(
      base({
        mostrarDescuento: false,
        lineas: [{ ...base().lineas[0]!, descuentoPct: 10 }],
      }),
    );
    expect(c.mostrarDescuento).toBe(false);
    expect(c.columnas).not.toContain("Dscto.");
    // El importe SÍ lleva el descuento aplicado: se cobra, solo que no se
    // desglosa en el papel.
    expect(c.lineas[0]?.importe).toBe(46.22); // 4 x 12.84 x 0.90
  });

  it("activada pero sin nada que descontar, tampoco aparece", () => {
    // Una columna de ceros es peor que no tenerla.
    const c = armarCotizacionImpresa(base({ mostrarDescuento: true }));
    expect(c.mostrarDescuento).toBe(false);
    expect(c.columnas).not.toContain("Dscto.");
  });

  it("activada y con descuento real, aparece", () => {
    const c = armarCotizacionImpresa(
      base({
        mostrarDescuento: true,
        lineas: [{ ...base().lineas[0]!, descuentoPct: 5 }],
      }),
    );
    expect(c.mostrarDescuento).toBe(true);
    expect(c.descuento).toBe(2.57); // 51.36 - 48.79
  });
});

describe("C6 · moneda", () => {
  it("es siempre dólares y no hay forma de cambiarla", () => {
    const c = armarCotizacionImpresa(base());
    expect(c.moneda).toBe("USD");
    expect(c.simbolo).toBe("$");
    expect(c.enLetras).toMatch(/DÓLARES|DOLARES/i);
  });
});

describe("totales", () => {
  it("cuadran con la suma de la columna Importe que ve el cliente", () => {
    const c = armarCotizacionImpresa(
      base({
        lineas: [
          { ...base().lineas[0]!, cantidad: 4 },
          {
            codigo: "7210 BEP",
            marca: "SKF",
            descripcion: "RODAMIENTO DE BOLAS DE CONTACTO ANG. DE 1 HIL.",
            cantidad: 2,
            unidad: "NIU",
            valorUnitario: 41.32,
            descuentoPct: 0,
          },
        ],
      }),
    );
    const suma = c.lineas.reduce((a, l) => a + l.importe, 0);
    expect(c.subtotal).toBe(Number(suma.toFixed(2)));
    expect(c.subtotal).toBe(134.0); // 51.36 + 82.64
    expect(c.igv).toBe(24.12);
    expect(c.total).toBe(158.12);
  });

  it("el monto en letras corresponde al total", () => {
    const c = armarCotizacionImpresa(base());
    expect(c.total).toBe(60.6);
    expect(c.enLetras).toMatch(/SESENTA/i);
  });
});

describe("validez", () => {
  it("calcula hasta cuándo vale", () => {
    const c = armarCotizacionImpresa(base());
    expect(c.fecha).toBe("2026-08-21");
    expect(c.validaHasta).toBe("2026-09-05");
  });

  it("sumarDias no se corre un día por husos ni horario de verano", () => {
    // Una cotización que dice "válida hasta el 5" y vence el 4 es una
    // discusión con el cliente.
    expect(sumarDias("2026-08-21", 15)).toBe("2026-09-05");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-02-28", 1)).toBe("2026-03-01"); // 2026 no es bisiesto
    expect(sumarDias("2026-01-01", 0)).toBe("2026-01-01");
  });
});

describe("unidades", () => {
  it("traduce el código de SUNAT a algo legible", () => {
    const c = armarCotizacionImpresa(
      base({ lineas: [{ ...base().lineas[0]!, unidad: "NIU" }] }),
    );
    expect(c.lineas[0]?.unidad).toBe("UND");
  });

  it("una unidad que no está en la tabla se imprime tal cual", () => {
    const c = armarCotizacionImpresa(
      base({ lineas: [{ ...base().lineas[0]!, unidad: "KGM" }] }),
    );
    expect(c.lineas[0]?.unidad).toBe("KGM");
  });
});
