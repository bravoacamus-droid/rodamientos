/**
 * Modelo de dominio de la guía de remisión electrónica (GRE).
 *
 * Una guía no es un comprobante de pago: no lleva importes ni IGV. Documenta el
 * TRASLADO de la mercadería —de dónde sale, a dónde va, quién la lleva y en qué
 * vehículo—, y por eso su forma no se parece a la de una factura.
 *
 * Dos tipos, y la diferencia decide qué campos son obligatorios:
 *   09 — Remitente:     la emite quien envía la mercadería.
 *   31 — Transportista: la emite la empresa de transporte contratada.
 *
 * Y dos modalidades de traslado dentro de la 09:
 *   01 — Transporte PÚBLICO:  lo lleva un tercero. Hace falta su RUC.
 *   02 — Transporte PRIVADO:  lo lleva el propio remitente. Hacen falta la
 *                             placa del vehículo y el conductor con su licencia.
 */

/** Motivo del traslado (catálogo 20 de SUNAT). */
export const MOTIVO_TRASLADO = {
  VENTA: "01",
  COMPRA: "02",
  VENTA_ENTREGA_A_TERCEROS: "03",
  TRASLADO_ENTRE_ESTABLECIMIENTOS: "04",
  CONSIGNACION: "05",
  DEVOLUCION: "06",
  RECOJO_BIENES_TRANSFORMADOS: "07",
  IMPORTACION: "08",
  EXPORTACION: "09",
  OTROS: "13",
  VENTA_SUJETA_A_CONFIRMACION: "14",
  TRASLADO_PARA_TRANSFORMACION: "17",
  EMISOR_ITINERANTE: "18",
  ZONA_PRIMARIA: "19",
} as const;
export type MotivoTraslado = (typeof MOTIVO_TRASLADO)[keyof typeof MOTIVO_TRASLADO];

/** Modalidad de traslado (catálogo 18). */
export const MODALIDAD_TRASLADO = {
  PUBLICO: "01",
  PRIVADO: "02",
} as const;
export type ModalidadTraslado =
  (typeof MODALIDAD_TRASLADO)[keyof typeof MODALIDAD_TRASLADO];

/** Un punto del traslado: de dónde sale o a dónde llega. */
export interface PuntoTraslado {
  /** Ubigeo de 6 dígitos. Obligatorio: SUNAT valida contra su tabla. */
  ubigeo: string;
  direccion: string;
  /** Código del establecimiento anexo, si el punto es uno declarado ante SUNAT. */
  codigoEstablecimiento?: string;
}

/** Transportista, cuando el traslado es público. */
export interface Transportista {
  ruc: string;
  razonSocial: string;
  /** Registro del MTC, si lo tiene. */
  registroMtc?: string;
}

/** Conductor y vehículo, cuando el traslado es privado. */
export interface Conductor {
  tipoDoc: string; // catálogo 06; normalmente "1" (DNI)
  numDoc: string;
  nombres: string;
  apellidos: string;
  /** Número de licencia de conducir. */
  licencia: string;
}

export interface Vehiculo {
  /** Placa. Sin guiones ni espacios. */
  placa: string;
  /** Certificado de habilitación vehicular, si aplica. */
  certificado?: string;
}

/** Una línea de la guía: qué se traslada y cuánto. */
export interface ItemGuia {
  descripcion: string;
  cantidad: number;
  /** Unidad de medida (catálogo 03). NIU para unidades. */
  unidad: string;
  codigoProducto?: string;
}

/** Documento que originó el traslado (la factura o boleta de la venta). */
export interface DocumentoRelacionado {
  /** Tipo de documento (catálogo 01): 01 factura, 03 boleta. */
  tipoDocumento: string;
  /** Serie y correlativo, p. ej. F001-123. */
  numero: string;
}

export interface GuiaRemision {
  /** 09 remitente, 31 transportista. */
  tipoDocumento: "09" | "31";
  /** Serie. Las guías electrónicas usan series que empiezan por T (T001). */
  serie: string;
  correlativo: number;
  fechaEmision: Date;

  emisor: {
    ruc: string;
    razonSocial: string;
  };
  /** Quien recibe la mercadería. */
  destinatario: {
    tipoDoc: string;
    numDoc: string;
    razonSocial: string;
  };

  motivo: MotivoTraslado;
  /** Descripción del motivo cuando es "18 — Otros". */
  descripcionMotivo?: string;
  modalidad: ModalidadTraslado;
  /** Fecha en que empieza el traslado. Puede ser posterior a la emisión. */
  fechaInicioTraslado: Date;
  /** Peso bruto total de la carga. */
  pesoTotal: number;
  /** Unidad del peso (catálogo 03): KGM kilogramos, TNE toneladas. */
  unidadPeso: string;
  /** El envío se reparte en varios vehículos. */
  envioParcial?: boolean;

  puntoPartida: PuntoTraslado;
  puntoLlegada: PuntoTraslado;

  /** Obligatorio si modalidad = 01 (público). */
  transportista?: Transportista;
  /** Obligatorios si modalidad = 02 (privado). */
  conductor?: Conductor;
  vehiculo?: Vehiculo;

  items: ItemGuia[];
  documentoRelacionado?: DocumentoRelacionado;
  observaciones?: string;
}
