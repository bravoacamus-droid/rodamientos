import { describe, expect, it } from "vitest";

import { faltaParaSunat, guiaParaSunat, partirNombre, tipoDocumentoDe } from "./sunat";
import type { GuiaDetalle } from "./tipos";

const GUIA: GuiaDetalle = {
  id: "g1",
  serie: "T002",
  correlativo: 559,
  numero: "T002-00000559",
  cliente_id: "c1",
  cliente: "REACTIVOS NACIONALES S A",
  cliente_documento: "20100005566",
  cliente_telefono: null,
  cliente_direccion: null,
  partida_lugar: null,
  llegada_lugar: null,
  cotizacion_id: null,
  cotizacion_numero: null,
  orden_compra_cliente: "OC-1",
  fecha_emision: "2026-10-15",
  fecha_traslado: "2026-10-16",
  motivo_codigo: "01",
  motivo_descripcion: "Venta",
  ubigeo_partida: "150132",
  direccion_partida: "JR. LOS HUERTOS 2232",
  ubigeo_llegada: "070101",
  direccion_llegada: "AV. NESTOR GAMBETTA 6448",
  peso_bruto_kg: 14,
  unidad_peso: "KGM",
  numero_bultos: 1,
  modalidad_traslado: "02",
  transportista_documento: null,
  transportista_razon_social: null,
  transportista_placa: "abc-123",
  conductor_documento: "09655141",
  conductor_nombre: "WILLY ANGEL FERNANDEZ PAREDES",
  conductor_licencia: "Q09655141",
  conductor_telefono: null,
  a_pie: false,
  entregado_por: null,
  recibido_por: null,
  estado: "emitida",
  estado_sunat: "pendiente",
  sunat_mensaje: null,
  observaciones: null,
  motivo_anulacion: null,
  creado_en: "2026-10-15T15:00:00Z",
  lineas: [{ id: "l1", producto_id: "p1", codigo: "6205", descripcion: "RODAMIENTO", unidad: "NIU", cantidad: 3, peso_kg: 0 }],
  comprobante: null,
};

const EMISOR = { ruc: "20562681206", razonSocial: "INVERSIONES RODATECH E.I.R.L." };

describe("guía para SUNAT", () => {
  it("parte el nombre de RENIEC en nombres y los dos apellidos", () => {
    expect(partirNombre("WILLY ANGEL FERNANDEZ PAREDES")).toEqual({ nombres: "WILLY ANGEL", apellidos: "FERNANDEZ PAREDES" });
    expect(partirNombre("JUAN PEREZ")).toEqual({ nombres: "JUAN", apellidos: "PEREZ" });
  });

  it("deduce el tipo de documento por su forma", () => {
    expect(tipoDocumentoDe("20100005566")).toBe("6");
    expect(tipoDocumentoDe("09655141")).toBe("1");
  });

  it("privado con vehículo: conductor, placa limpia y fecha de traslado en Lima", () => {
    const s = guiaParaSunat(GUIA, EMISOR, new Date("2026-10-15T10:00:00-05:00"));
    expect(s.destinatario).toEqual({ tipoDoc: "6", numDoc: "20100005566", razonSocial: "REACTIVOS NACIONALES S A" });
    expect(s.conductor).toMatchObject({ tipoDoc: "1", nombres: "WILLY ANGEL", apellidos: "FERNANDEZ PAREDES", licencia: "Q09655141" });
    expect(s.vehiculo).toEqual({ placa: "ABC123" });
    expect(s.fechaInicioTraslado.toISOString()).toBe("2026-10-16T05:00:00.000Z");
    expect(s.descripcionMotivo).toBeUndefined();
    expect(s.indicadores).toBeUndefined();
  });

  it("a pie: sin vehículo ni conductor, con el indicador M1/L", () => {
    const s = guiaParaSunat({ ...GUIA, a_pie: true }, EMISOR, new Date());
    expect(s.vehiculo).toBeUndefined();
    expect(s.conductor).toBeUndefined();
    expect(s.indicadores).toEqual(["SUNAT_Envio_IndicadorTrasladoVehiculoM1L"]);
  });

  it("público: el transportista, y dice lo que le falta", () => {
    const pub = { ...GUIA, modalidad_traslado: "01" as const, transportista_documento: null };
    expect(faltaParaSunat(pub)).toContain("Falta el RUC del transportista.");
    const s = guiaParaSunat({ ...pub, transportista_documento: "20111111111", transportista_razon_social: "AGENCIA" }, EMISOR, new Date());
    expect(s.transportista).toEqual({ ruc: "20111111111", razonSocial: "AGENCIA" });
    expect(s.conductor).toBeUndefined();
  });

  it("no deja mandar un borrador ni una guía sin ubigeo", () => {
    expect(faltaParaSunat({ ...GUIA, estado: "borrador", ubigeo_llegada: null })).toEqual([
      "Solo se manda una guía emitida.",
      "Falta el distrito (ubigeo) del punto de llegada.",
    ]);
    expect(faltaParaSunat(GUIA)).toEqual([]);
  });
});
