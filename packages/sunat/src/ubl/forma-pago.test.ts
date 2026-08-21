import { describe, it, expect } from "vitest";
import { generarFacturaXml } from "./factura";
import type { Comprobante, ItemComprobante } from "../dominio/index";

/**
 * La forma de pago del XML.
 *
 * Existen estas pruebas porque aquí había un error que nadie habría visto: el nodo
 * `PaymentMeansID` llevaba la palabra «Contado» escrita a mano, y en cuanto el
 * sistema aprendió a vender al crédito, cada factura a 30 días se le declaró a
 * SUNAT como cobrada. El XML se generaba igual, SUNAT lo aceptaba igual, y la
 * diferencia solo habría salido en un cruce de información.
 *
 * Al crédito SUNAT exige el saldo pendiente y una cuota por nodo, rotulada
 * Cuota001, Cuota002…, con importe y vencimiento. Si falta, rechazo 3251.
 */

const EMISOR = {
  ruc: "20000000001",
  razonSocial: "RODATECH SAC",
  direccion: "AV DEMO 123",
  ubigeo: "150101",
};

const ITEM: ItemComprobante = {
  descripcion: "Laptop",
  cantidad: 1,
  unidad: "NIU",
  valorUnitario: 1000,
  precioUnitario: 1180,
  afectacionIgv: "10",
  igv: 180,
  valorVenta: 1000,
};

function comprobante(formaPago?: Comprobante["formaPago"]): Comprobante {
  return {
    tipoDocumento: "01",
    serie: "F002",
    correlativo: 7,
    fechaEmision: new Date("2026-08-05T15:00:00Z"),
    moneda: "PEN",
    tasaIgv: 18,
    emisor: EMISOR,
    receptor: { tipoDoc: "6", numDoc: "20505973522", razonSocial: "EMPRESA SAC" },
    items: [ITEM],
    totales: { gravadas: 1000, igv: 180, total: 1180 },
    formaPago,
  };
}

describe("al contado", () => {
  it("declara Contado", () => {
    const xml = generarFacturaXml(comprobante({ tipo: "contado" }));
    expect(xml).toContain("<cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>");
  });

  it("sin forma de pago declarada asume contado, que es la venta normal", () => {
    // Todo lo emitido antes de este cambio no manda `formaPago`: el comportamiento
    // por defecto tiene que seguir siendo el que ya funcionaba.
    const xml = generarFacturaXml(comprobante());
    expect(xml).toContain("<cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>");
  });

  it("no cuela cuotas donde no las hay", () => {
    const xml = generarFacturaXml(comprobante({ tipo: "contado" }));
    expect(xml).not.toContain("Cuota001");
    expect(xml).not.toContain("PaymentDueDate");
  });
});

describe("al crédito", () => {
  const xml = generarFacturaXml(
    comprobante({
      tipo: "credito",
      pendiente: 1180,
      cuotas: [
        { numero: 1, monto: 500, vencimiento: "2026-09-04" },
        { numero: 2, monto: 680, vencimiento: "2026-10-04" },
      ],
    }),
  );

  it("declara Credito y no Contado", () => {
    expect(xml).toContain("<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>");
    expect(xml).not.toContain("<cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>");
  });

  it("declara el saldo pendiente con su moneda", () => {
    expect(xml).toContain('<cbc:Amount currencyID="PEN">1180.00</cbc:Amount>');
  });

  it("rotula las cuotas con tres dígitos, como exige el catálogo", () => {
    expect(xml).toContain("<cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>");
    expect(xml).toContain("<cbc:PaymentMeansID>Cuota002</cbc:PaymentMeansID>");
    // No "Cuota1": SUNAT valida el formato.
    expect(xml).not.toContain("Cuota1<");
  });

  it("cada cuota lleva su importe y su vencimiento", () => {
    expect(xml).toContain('<cbc:Amount currencyID="PEN">500.00</cbc:Amount>');
    expect(xml).toContain("<cbc:PaymentDueDate>2026-09-04</cbc:PaymentDueDate>");
    expect(xml).toContain('<cbc:Amount currencyID="PEN">680.00</cbc:Amount>');
    expect(xml).toContain("<cbc:PaymentDueDate>2026-10-04</cbc:PaymentDueDate>");
  });

  it("emite un PaymentTerms por cuota más el del saldo", () => {
    // Tres nodos hermanos: el saldo pendiente y las dos cuotas. Con un solo nodo
    // SUNAT no sabría el cronograma.
    const nodos = xml.match(/<cac:PaymentTerms>/g) ?? [];
    expect(nodos).toHaveLength(3);
  });

  it("las cuotas suman el pendiente declarado", () => {
    // Si no cuadraran, SUNAT rechaza. Se comprueba leyendo el XML, no el objeto:
    // es lo que de verdad se firma y se manda.
    const montos = [...xml.matchAll(/<cbc:Amount currencyID="PEN">([\d.]+)<\/cbc:Amount>/g)]
      .map((m) => Number(m[1]));
    const [pendiente, ...cuotas] = montos;
    expect(cuotas.reduce((s, n) => s + n, 0)).toBe(pendiente);
  });

  it("en dólares el importe de las cuotas va en dólares", () => {
    const enUsd = generarFacturaXml({
      ...comprobante({
        tipo: "credito",
        pendiente: 300,
        cuotas: [{ numero: 1, monto: 300, vencimiento: "2026-09-04" }],
      }),
      moneda: "USD",
    });
    expect(enUsd).toContain('<cbc:Amount currencyID="USD">300.00</cbc:Amount>');
  });
});
