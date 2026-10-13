import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { armarHojaPdf, nombreArchivo, textoPdf, type HojaPdf } from "./pdf-hoja";

const hoja = (lineas: number): HojaPdf => ({
  emisor: {
    razonSocial: "INVERSIONES RODATECH E.I.R.L.",
    nombreComercial: "RODATECH",
    ruc: "20562681206",
    direccion: "JR. LOS HUERTOS 2232, SAN JUAN DE LURIGANCHO",
    telefono: "366-9012",
    email: "ventas@rodatech.pe",
    web: null,
    logoUrl: null,
  },
  titulo: "Cotización",
  numero: "COT1-000099",
  datos: [
    { etiqueta: "Señores", valor: "MINERA LOS ANDES S.A.C.", ancho: true },
    { etiqueta: "RUC", valor: "20100047218" },
    { etiqueta: "Fecha", valor: "14/10/2026" },
  ],
  columnas: [
    { clave: "n", titulo: "#", alinear: "centro" },
    { clave: "codigo", titulo: "Código" },
    { clave: "descripcion", titulo: "Descripción" },
    { clave: "importe", titulo: "Importe", alinear: "derecha" },
  ],
  filas: Array.from({ length: lineas }, (_, i) => ({
    n: String(i + 1),
    codigo: `6205-2RS/C3-${i}`,
    descripcion:
      i % 3 === 0
        ? {
            texto: "KIT DE REPARACIÓN DE BOMBA CENTRÍFUGA",
            debajo: [
              "Contiene: 2 × 6205-2RS RODAMIENTO · 1 × RETÉN 30X47X7 · 1 × O-RING 45X3 · 4 × PERNO M8 · 1 × JUNTA",
              "Nota: entrega en el almacén de Chilca, preguntar por el señor Ramos",
            ],
          }
        : "RODAMIENTO RIGIDO DE BOLAS",
    importe: "58.35",
  })),
  totales: [
    { etiqueta: "Valor de venta", valor: "$ 236.79" },
    { etiqueta: "Total", valor: "$ 279.41", destacado: true },
  ],
  enLetras: "DOSCIENTOS SETENTA Y NUEVE CON 41/100 DÓLARES AMERICANOS",
  pie: [
    { tipo: "parrafo", trozos: [{ texto: "Condiciones: ", negrita: true }, { texto: "FACTURA 30 DIAS" }] },
    { tipo: "parrafo", trozos: [{ texto: "ENTREGA INMEDIATA\nSALVO VENTA PREVIA" }] },
    { tipo: "cuentas", titulo: "CUENTAS BANCARIAS", filas: [["BCP", "DÓLARES", "191-99", "002-191"]] },
    { tipo: "firma", izquierda: "Atendido por Willy", derecha: "ventas@rodatech.pe" },
  ],
});

describe("la hoja en PDF (14/10)", () => {
  it("es un PDF de verdad, y una cotización corta cabe en una hoja", async () => {
    const doc = await armarHojaPdf(hoja(3));
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output().startsWith("%PDF-")).toBe(true);
  });

  it("una larga, con kits y notas, sigue en otra hoja sin perder líneas", async () => {
    const doc = await armarHojaPdf(hoja(45));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const texto = doc.output();
    expect(texto).toContain("6205-2RS/C3-44");
    // La nota de un kit no se corta: se parte en renglones.
    expect(texto).toContain("Ramos");
    if (process.env.PDF_SALIDA) writeFileSync(process.env.PDF_SALIDA, Buffer.from(doc.output("arraybuffer")));
  });

  it("el nombre del archivo no lleva lo que Windows no admite", () => {
    expect(nombreArchivo("COT1-000011", "GRUPO KLAUS S.A.C.")).toBe("COT1-000011 - GRUPO KLAUS S.A.C.pdf");
    expect(nombreArchivo("CT02-000890", 'ACEROS "LIMA": S/A')).toBe("CT02-000890 - ACEROS LIMA SA.pdf");
    expect(nombreArchivo(null, "")).toBe("documento.pdf");
  });

  it("cambia lo que la fuente del PDF no sabe escribir", () => {
    expect(textoPdf("$ − 5.00")).toBe("$ - 5.00");
    expect(textoPdf("15 %")).toBe("15 %");
  });
});
