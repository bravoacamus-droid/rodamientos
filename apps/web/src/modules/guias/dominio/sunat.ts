import { INDICADOR_ENVIO, type GuiaRemision, type MotivoTraslado } from "@rodatech/sunat/guia";

import type { GuiaDetalle } from "./tipos";

/**
 * De la guía del ERP a la guía que se manda a SUNAT (15/10).
 *
 * Puro: sin base ni reloj. La hora de emisión entra como argumento.
 */

/** Los datos del emisor que viajan en el XML. */
export interface EmisorGuia {
  ruc: string;
  razonSocial: string;
}

/**
 * Nombres y apellidos de quien conduce. SUNAT los pide por separado y aquí
 * se guarda uno solo, tal como lo trae RENIEC: «WILLY ANGEL FERNANDEZ
 * PAREDES» — nombres y luego los dos apellidos.
 */
export function partirNombre(completo: string): { nombres: string; apellidos: string } {
  const partes = completo.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { nombres: partes[0] ?? "", apellidos: partes[0] ?? "" };
  if (partes.length === 2) return { nombres: partes[0]!, apellidos: partes[1]! };
  return { nombres: partes.slice(0, -2).join(" "), apellidos: partes.slice(-2).join(" ") };
}

/** El tipo de documento del catálogo 06 por su forma: 11 dígitos RUC, 8 DNI. */
export function tipoDocumentoDe(numero: string | null): string {
  const n = (numero ?? "").trim();
  if (/^\d{11}$/.test(n)) return "6";
  if (/^\d{8}$/.test(n)) return "1";
  return "0";
}

/** Lo que falta para poder mandarla. Vacío si se puede. */
export function faltaParaSunat(g: GuiaDetalle): string[] {
  const falta: string[] = [];
  if (g.estado !== "emitida") falta.push("Solo se manda una guía emitida.");
  if (!g.cliente_documento) falta.push("El destinatario no tiene RUC ni DNI.");
  if (!/^\d{6}$/.test(g.ubigeo_partida ?? "")) falta.push("Falta el distrito (ubigeo) del punto de partida.");
  if (!/^\d{6}$/.test(g.ubigeo_llegada ?? "")) falta.push("Falta el distrito (ubigeo) del punto de llegada.");
  if (!(g.peso_bruto_kg > 0)) falta.push("Falta el peso bruto.");
  if (g.lineas.length === 0) falta.push("La guía no lleva productos.");
  if (g.modalidad_traslado === "01") {
    if (!/^\d{11}$/.test(g.transportista_documento ?? "")) falta.push("Falta el RUC del transportista.");
    if (!g.transportista_razon_social) falta.push("Falta la razón social del transportista.");
  } else if (!g.a_pie) {
    if (!g.transportista_placa) falta.push("Falta la placa del vehículo.");
    if (!g.conductor_documento) falta.push("Falta el DNI del conductor.");
    if (!g.conductor_nombre) falta.push("Falta el nombre del conductor.");
    if (!g.conductor_licencia) falta.push("Falta la licencia del conductor.");
  }
  return falta;
}

/**
 * La guía para SUNAT.
 *
 * «A pie» (062) no existe en SUNAT: lo más cercano es el traslado en
 * vehículo M1 o L (auto o moto), que exime de placa y conductor con un
 * indicador. Es una aproximación y está dicha en el informe: la primera
 * guía real dirá si SUNAT la acepta así.
 */
export function guiaParaSunat(g: GuiaDetalle, emisor: EmisorGuia, emitidaEn: Date): GuiaRemision {
  const privado = g.modalidad_traslado === "02";
  const conVehiculo = privado && !g.a_pie;
  const lugar = (direccion: string | null, ubigeo: string | null) => ({
    ubigeo: ubigeo ?? "",
    direccion: (direccion ?? "").trim() || "—",
  });

  return {
    tipoDocumento: "09",
    serie: g.serie,
    correlativo: g.correlativo,
    fechaEmision: emitidaEn,
    emisor,
    destinatario: {
      tipoDoc: tipoDocumentoDe(g.cliente_documento),
      numDoc: g.cliente_documento ?? "",
      razonSocial: g.cliente ?? "",
    },
    motivo: g.motivo_codigo as MotivoTraslado,
    // «Otros» (13) exige decir cuál; en los demás sobra.
    ...(g.motivo_codigo === "13" && g.motivo_descripcion ? { descripcionMotivo: g.motivo_descripcion } : {}),
    modalidad: privado ? "02" : "01",
    // Con su zona: sin ella, un servidor en UTC la fecha un día antes.
    fechaInicioTraslado: new Date(`${g.fecha_traslado.slice(0, 10)}T00:00:00-05:00`),
    pesoTotal: Number(g.peso_bruto_kg),
    unidadPeso: g.unidad_peso === "TNE" ? "TNE" : "KGM",
    numeroBultos: g.numero_bultos > 0 ? g.numero_bultos : undefined,
    indicadores: privado && g.a_pie ? [INDICADOR_ENVIO.VEHICULO_M1_L] : undefined,
    puntoPartida: lugar(g.direccion_partida, g.ubigeo_partida),
    puntoLlegada: lugar(g.direccion_llegada, g.ubigeo_llegada),
    transportista:
      !privado && g.transportista_documento
        ? { ruc: g.transportista_documento, razonSocial: g.transportista_razon_social ?? "" }
        : undefined,
    conductor:
      conVehiculo && g.conductor_documento
        ? {
            tipoDoc: tipoDocumentoDe(g.conductor_documento),
            numDoc: g.conductor_documento,
            ...partirNombre(g.conductor_nombre ?? ""),
            licencia: g.conductor_licencia ?? "",
          }
        : undefined,
    vehiculo: conVehiculo && g.transportista_placa ? { placa: g.transportista_placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase() } : undefined,
    items: g.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: (l.unidad || "NIU").toUpperCase(),
      codigoProducto: l.codigo,
    })),
    // La factura, si ya salió (normalmente no: la guía va antes).
    documentosRelacionados: g.comprobante
      ? [{ tipoDocumento: "01", descripcion: "Factura", numero: g.comprobante.numero, emisorRuc: emisor.ruc }]
      : undefined,
    observaciones: g.observaciones ?? undefined,
  };
}
