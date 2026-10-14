import { describe, expect, it } from "vitest";

import type { GuiaRemision } from "../dominio/guia";
import { generarGuiaXml } from "./guia";

const BASE: GuiaRemision = {
  tipoDocumento: "09",
  serie: "T002",
  correlativo: 559,
  fechaEmision: new Date("2026-10-15T10:30:00-05:00"),
  emisor: { ruc: "20562681206", razonSocial: "INVERSIONES RODATECH E.I.R.L." },
  destinatario: { tipoDoc: "6", numDoc: "20100005566", razonSocial: "REACTIVOS NACIONALES S A" },
  motivo: "01",
  modalidad: "02",
  fechaInicioTraslado: new Date("2026-10-15T00:00:00-05:00"),
  pesoTotal: 14,
  unidadPeso: "KGM",
  numeroBultos: 2,
  puntoPartida: { ubigeo: "150132", direccion: "JR. LOS HUERTOS 2232" },
  puntoLlegada: { ubigeo: "070101", direccion: "AV. NESTOR GAMBETTA 6448" },
  conductor: { tipoDoc: "1", numDoc: "12345678", nombres: "JUAN CARLOS", apellidos: "PEREZ LOPEZ", licencia: "Q12345678" },
  vehiculo: { placa: "ABC123" },
  items: [{ descripcion: "RODAMIENTO 6205", cantidad: 3, unidad: "NIU", codigoProducto: "6205" }],
};

describe("XML de la guía (GRE 2022)", () => {
  const xml = generarGuiaXml(BASE);

  it("cabecera de la GRE remitente 2.1 / 2.0", () => {
    expect(xml).toContain("<cbc:UBLVersionID>2.1</cbc:UBLVersionID>");
    expect(xml).toContain("<cbc:CustomizationID>2.0</cbc:CustomizationID>");
    expect(xml).toContain("<cbc:ID>T002-559</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2026-10-15</cbc:IssueDate>");
    expect(xml).toContain("<cbc:IssueTime>10:30:00</cbc:IssueTime>");
    expect(xml).toMatch(/<cbc:DespatchAdviceTypeCode[^>]*catalogo01">09</);
  });

  it("las partes llevan los atributos del catálogo 06", () => {
    expect(xml).toMatch(/schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="[^"]*catalogo06">20100005566</);
  });

  it("el envío: motivo, peso a tres decimales, bultos, etapa y direcciones", () => {
    expect(xml).toMatch(/<cbc:HandlingCode[^>]*catalogo20">01</);
    expect(xml).toContain('<cbc:GrossWeightMeasure unitCode="KGM">14.000</cbc:GrossWeightMeasure>');
    expect(xml).toContain("<cbc:TotalTransportHandlingUnitQuantity>2</cbc:TotalTransportHandlingUnitQuantity>");
    expect(xml).toMatch(/<cbc:TransportModeCode[^>]*catalogo18">02</);
    expect(xml).toContain("<cbc:StartDate>2026-10-15</cbc:StartDate>");
    expect(xml).toMatch(/<cbc:FirstName>(?:<!\[CDATA\[)?JUAN CARLOS/);
    expect(xml).toMatch(/<cbc:FamilyName>(?:<!\[CDATA\[)?PEREZ LOPEZ/);
    expect(xml).toContain("<cbc:JobTitle>Principal</cbc:JobTitle>");
    expect(xml).toMatch(/<cac:DeliveryAddress><cbc:ID schemeAgencyName="PE:INEI" schemeName="Ubigeos">070101</);
    expect(xml).toMatch(/<cac:TransportEquipment><cbc:ID>ABC123</);
  });

  it("los fallos de la versión anterior no vuelven", () => {
    expect(xml).not.toContain("SplitConsignmentIndicator");
    expect(xml).not.toContain("<cbc:Name>RODAMIENTO");
    expect(xml).toMatch(/<cbc:Description>(?:<!\[CDATA\[)?RODAMIENTO 6205/);
    const conMotivo = generarGuiaXml({ ...BASE, motivo: "13", descripcionMotivo: "Préstamo" });
    expect(conMotivo).toMatch(/<cbc:HandlingInstructions>(?:<!\[CDATA\[)?Préstamo/);
    expect(conMotivo).not.toContain("<cbc:Information>");
  });

  it("el orden del envío es el del XSD", () => {
    const orden = ["<cbc:HandlingCode", "<cbc:GrossWeightMeasure", "<cbc:TotalTransportHandlingUnitQuantity", "<cac:ShipmentStage>", "<cac:Delivery>", "<cac:TransportHandlingUnit>"];
    const posiciones = orden.map((t) => xml.indexOf(t));
    expect(posiciones.every((p) => p > 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it("transporte público: transportista y no conductor", () => {
    const pub = generarGuiaXml({
      ...BASE,
      modalidad: "01",
      conductor: undefined,
      vehiculo: undefined,
      transportista: { ruc: "20111111111", razonSocial: "AGENCIA SAC" },
    });
    expect(pub).toContain("<cac:CarrierParty>");
    expect(pub).not.toContain("<cac:DriverPerson>");
  });
});
