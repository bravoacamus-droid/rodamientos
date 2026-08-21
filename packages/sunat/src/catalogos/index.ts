/**
 * Catálogos SUNAT tipados.
 *
 * Son las tablas oficiales de SUNAT (Anexo VIII de la normativa de comprobantes
 * electrónicos). Cambian poco; cuando SUNAT publica una actualización se ajusta
 * aquí en un solo lugar. Todo el paquete se apoya en estos tipos para que un
 * valor inválido falle en compilación, no en un rechazo de SUNAT.
 */

// ---- Catálogo 01: Tipo de documento (comprobante) ----
export const TIPO_DOCUMENTO = {
  FACTURA: "01",
  BOLETA: "03",
  NOTA_CREDITO: "07",
  NOTA_DEBITO: "08",
  GUIA_REMISION_REMITENTE: "09",
  GUIA_REMISION_TRANSPORTISTA: "31",
} as const;
export type TipoDocumento = (typeof TIPO_DOCUMENTO)[keyof typeof TIPO_DOCUMENTO];

export const NOMBRE_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  "01": "Factura",
  "03": "Boleta de Venta",
  "07": "Nota de Crédito",
  "08": "Nota de Débito",
  "09": "Guía de Remisión Remitente",
  "31": "Guía de Remisión Transportista",
};

// ---- Catálogo 06: Tipo de documento de identidad del receptor ----
export const TIPO_DOC_IDENTIDAD = {
  SIN_DOCUMENTO: "0",
  DNI: "1",
  CARNET_EXTRANJERIA: "4",
  RUC: "6",
  PASAPORTE: "7",
} as const;
export type TipoDocIdentidad =
  (typeof TIPO_DOC_IDENTIDAD)[keyof typeof TIPO_DOC_IDENTIDAD];

// ---- Catálogo 02: Moneda (ISO 4217) ----
export const MONEDA = {
  SOLES: "PEN",
  DOLARES: "USD",
  EUROS: "EUR",
} as const;
export type Moneda = (typeof MONEDA)[keyof typeof MONEDA];

// ---- Catálogo 03: Unidad de medida (subconjunto usual del comercio) ----
export const UNIDAD_MEDIDA = {
  UNIDAD: "NIU", // ítem comercial (lo habitual en retail)
  UNIDAD_SERVICIO: "ZZ", // servicios (p.ej. reparaciones)
  KILOGRAMO: "KGM",
  METRO: "MTR",
  LITRO: "LTR",
} as const;
export type UnidadMedida = (typeof UNIDAD_MEDIDA)[keyof typeof UNIDAD_MEDIDA];

// ---- Catálogo 07: Tipo de afectación del IGV ----
export const AFECTACION_IGV = {
  GRAVADO: "10", // Gravado - Operación onerosa
  EXONERADO: "20", // Exonerado - Operación onerosa
  INAFECTO: "30", // Inafecto - Operación onerosa
  EXPORTACION: "40", // Exportación
} as const;
export type AfectacionIgv = (typeof AFECTACION_IGV)[keyof typeof AFECTACION_IGV];

// ---- Catálogo 05: Tributos ----
export const TRIBUTO = {
  IGV: { codigo: "1000", nombre: "IGV", tipo: "VAT" },
  EXONERADO: { codigo: "9997", nombre: "EXO", tipo: "VAT" },
  INAFECTO: { codigo: "9998", nombre: "INA", tipo: "FRE" },
  EXPORTACION: { codigo: "9995", nombre: "EXP", tipo: "FRE" },
} as const;

// ---- Catálogo 09: Tipo de nota de crédito ----
export const MOTIVO_NOTA_CREDITO = {
  ANULACION_OPERACION: "01",
  ANULACION_ERROR_RUC: "02",
  CORRECCION_DESCRIPCION: "03",
  DESCUENTO_GLOBAL: "04",
  DESCUENTO_POR_ITEM: "05",
  DEVOLUCION_TOTAL: "06",
  DEVOLUCION_POR_ITEM: "07",
} as const;
export type MotivoNotaCredito =
  (typeof MOTIVO_NOTA_CREDITO)[keyof typeof MOTIVO_NOTA_CREDITO];

// ---- Catálogo 10: Tipo de nota de débito ----
export const MOTIVO_NOTA_DEBITO = {
  INTERESES_MORA: "01",
  AUMENTO_VALOR: "02",
  PENALIDADES: "03",
} as const;
export type MotivoNotaDebito =
  (typeof MOTIVO_NOTA_DEBITO)[keyof typeof MOTIVO_NOTA_DEBITO];

/** IGV vigente en Perú (18%). Configurable por si cambia la tasa. */
export const IGV_TASA_DEFECTO = 18;
