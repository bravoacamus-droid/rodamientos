import { describe, it, expect } from "vitest";
import { generarFacturaXml } from "./factura";
import type { Comprobante, ItemComprobante } from "../dominio/index";

/**
 * Lo que SUNAT rechaza es un comprobante que no cuadra.
 *
 * Estas pruebas fijan las tres reglas que costaron entender y que un cambio
 * despistado rompería en silencio (el XML se genera igual, y el rechazo llega
 * horas después con un código):
 *
 *   1. LineExtensionAmount = gravadas + exoneradas + inafectas.
 *   2. Un TaxSubtotal por tipo de operación, y solo la gravada lleva IGV.
 *   3. La línea exonerada declara su afectación y un IGV de cero.
 */

const EMISOR = {
  ruc: "20000000001",
  razonSocial: "RODATECH SAC",
  direccion: "AV DEMO 123",
  ubigeo: "150101",
};

function item(p: Partial<ItemComprobante> & { valorVenta: number }): ItemComprobante {
  return {
    descripcion: "Artículo",
    cantidad: 1,
    unidad: "NIU",
    valorUnitario: p.valorVenta,
    precioUnitario: p.valorVenta + (p.igv ?? 0),
    afectacionIgv: "10",
    igv: 0,
    ...p,
  };
}

function comprobante(
  items: ItemComprobante[],
  totales: Comprobante["totales"],
): Comprobante {
  return {
    tipoDocumento: "03",
    serie: "B002",
    correlativo: 123,
    fechaEmision: new Date("2026-07-31T15:00:00Z"),
    moneda: "PEN",
    tasaIgv: 18,
    emisor: EMISOR,
    receptor: { tipoDoc: "1", numDoc: "12345678", razonSocial: "JUAN PEREZ" },
    items,
    totales,
  };
}

describe("comprobante solo con operaciones gravadas", () => {
  const xml = generarFacturaXml(
    comprobante([item({ valorVenta: 100, igv: 18 })], {
      gravadas: 100,
      igv: 18,
      total: 118,
    }),
  );

  it("declara el valor de venta sin IGV y el total con IGV", () => {
    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="PEN">118.00</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">118.00</cbc:PayableAmount>');
  });

  it("lleva un solo tributo, el IGV", () => {
    expect(xml.match(/<cac:TaxSubtotal>/g)).toHaveLength(2); // uno de línea, uno de total
    expect(xml).toContain("<cbc:ID>1000</cbc:ID>");
    expect(xml).not.toContain("<cbc:ID>9997</cbc:ID>");
  });
});

describe("comprobante que mezcla gravado, exonerado e inafecto", () => {
  const xml = generarFacturaXml(
    comprobante(
      [
        item({ descripcion: "Funda", valorVenta: 100, igv: 18, afectacionIgv: "10", codigoSunat: "52161500" }),
        item({ descripcion: "Libro", valorVenta: 50, afectacionIgv: "20" }),
        item({ descripcion: "Servicio inafecto", valorVenta: 30, afectacionIgv: "30", unidad: "ZZ" }),
      ],
      { gravadas: 100, exoneradas: 50, inafectas: 30, igv: 18, total: 198 },
    ),
  );

  it("suma los tres tipos en el valor de venta", () => {
    // 100 + 50 + 30. Si esto sumara solo lo gravado, SUNAT rechaza por descuadre.
    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="PEN">180.00</cbc:LineExtensionAmount>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="PEN">198.00</cbc:TaxInclusiveAmount>');
  });

  it("declara un tributo por tipo de operación", () => {
    expect(xml).toContain("<cbc:ID>1000</cbc:ID>"); // IGV
    expect(xml).toContain("<cbc:ID>9997</cbc:ID>"); // EXO
    expect(xml).toContain("<cbc:ID>9998</cbc:ID>"); // INA
  });

  it("solo cobra IGV sobre la parte gravada", () => {
    // El IGV total del comprobante es el de la línea gravada, ni un céntimo más.
    const totalTax = xml.match(/<cac:TaxTotal><cbc:TaxAmount currencyID="PEN">([\d.]+)</);
    expect(totalTax?.[1]).toBe("18.00");
    // Los subtotales exonerado e inafecto van con impuesto cero.
    expect(xml).toContain('<cbc:TaxableAmount currencyID="PEN">50.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">0.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="PEN">30.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">0.00</cbc:TaxAmount>');
  });

  it("marca la afectación en cada línea", () => {
    expect(xml).toContain("<cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>");
    expect(xml).toContain("<cbc:TaxExemptionReasonCode>20</cbc:TaxExemptionReasonCode>");
    expect(xml).toContain("<cbc:TaxExemptionReasonCode>30</cbc:TaxExemptionReasonCode>");
  });

  it("manda el código de producto SUNAT solo cuando existe", () => {
    expect(xml).toContain('listID="UNSPSC"');
    expect(xml.match(/<cac:CommodityClassification>/g)).toHaveLength(1);
  });

  it("respeta la unidad de medida de cada línea", () => {
    expect(xml).toContain('unitCode="NIU"');
    expect(xml).toContain('unitCode="ZZ"');
  });
});

describe("comprobante enteramente exonerado", () => {
  const xml = generarFacturaXml(
    comprobante([item({ descripcion: "Libro", valorVenta: 50, afectacionIgv: "20" })], {
      gravadas: 0,
      exoneradas: 50,
      igv: 0,
      total: 50,
    }),
  );

  it("no declara un tributo IGV vacío", () => {
    // Declarar base 0 con IGV 0 bajo 1000 es lo que hacía la versión anterior;
    // el comprobante correcto solo lleva el tributo que aplica.
    expect(xml).toContain("<cbc:ID>9997</cbc:ID>");
    expect(xml).not.toContain("<cbc:Name>IGV</cbc:Name>");
    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="PEN">50.00</cbc:LineExtensionAmount>');
  });
});
