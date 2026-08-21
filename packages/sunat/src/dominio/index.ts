/**
 * Modelo de dominio del conector.
 *
 * Estas formas son el CONTRATO del paquete: la app traduce sus datos (pedidos,
 * clientes, ítems) a estos objetos y el conector devuelve XML y CDR. Nada aquí
 * conoce Rodatech, Supabase ni tabla alguna — por eso el paquete se copia a otro
 * proyecto sin arrastrar dependencias.
 */
import type {
  TipoDocumento,
  TipoDocIdentidad,
  Moneda,
  UnidadMedida,
  AfectacionIgv,
  MotivoNotaCredito,
  MotivoNotaDebito,
} from "../catalogos/index";

/** Datos fiscales del emisor (la empresa que factura). */
export interface Emisor {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  direccion: string;
  ubigeo: string; // 6 dígitos
  distrito?: string;
  provincia?: string;
  departamento?: string;
}

/** Datos del receptor (el cliente). */
export interface Receptor {
  tipoDoc: TipoDocIdentidad;
  numDoc: string;
  razonSocial: string;
  direccion?: string;
  email?: string;
}

/** Una línea del comprobante. */
export interface ItemComprobante {
  descripcion: string;
  cantidad: number;
  unidad: UnidadMedida;
  /** Valor unitario SIN IGV. */
  valorUnitario: number;
  /** Precio unitario CON IGV (referencial, catálogo 16). */
  precioUnitario: number;
  afectacionIgv: AfectacionIgv;
  /** IGV de la línea. */
  igv: number;
  /** Total de la línea sin IGV (valorUnitario * cantidad). */
  valorVenta: number;
  /** Código interno del vendedor (SKU). */
  codigoProducto?: string;
  /** Código de producto SUNAT — catálogo 25 (UNSPSC), 8 dígitos. Opcional. */
  codigoSunat?: string;
}

/** Totales del comprobante, ya calculados por la app. */
export interface Totales {
  /** Suma de operaciones gravadas (sin IGV). */
  gravadas: number;
  exoneradas?: number;
  inafectas?: number;
  /** IGV total. */
  igv: number;
  /** Importe total del comprobante (con IGV). */
  total: number;
}

/**
 * Una cuota del crédito, tal como se declara ante SUNAT.
 *
 * SUNAT no admite «crédito» a secas: exige el detalle (Cuota001, Cuota002…) con su
 * importe y su fecha de vencimiento. Sin esto, el comprobante se rechaza con el
 * error 3251.
 */
export interface CuotaCredito {
  /** 1, 2, 3… Se rotula Cuota001 en el XML. */
  numero: number;
  monto: number;
  /** Fecha de vencimiento (aaaa-mm-dd). */
  vencimiento: string;
}

/**
 * Forma de pago del comprobante (catálogo 59 de SUNAT).
 *
 * Obligatoria desde 2022 y con dos formas muy distintas: al contado basta decirlo,
 * al crédito hay que declarar el saldo pendiente y el cronograma completo.
 */
export type FormaPagoComprobante =
  | { tipo: "contado" }
  | { tipo: "credito"; pendiente: number; cuotas: CuotaCredito[] };

/** Comprobante base: factura (01) o boleta (03). */
export interface Comprobante {
  tipoDocumento: Extract<TipoDocumento, "01" | "03">;
  serie: string; // F001 / B001
  correlativo: number;
  fechaEmision: Date;
  moneda: Moneda;
  emisor: Emisor;
  receptor: Receptor;
  items: ItemComprobante[];
  totales: Totales;
  /** Tasa de IGV aplicada, para reflejarla en el XML. */
  tasaIgv: number;
  /** Forma de pago. Si no se manda, se declara al contado. */
  formaPago?: FormaPagoComprobante;
}

/** Referencia al documento que una nota afecta. */
export interface DocumentoAfectado {
  tipoDocumento: Extract<TipoDocumento, "01" | "03">;
  serie: string;
  correlativo: number;
}

/** Nota de crédito o débito (comparte estructura con Comprobante + motivo). */
export interface NotaComprobante extends Omit<Comprobante, "tipoDocumento"> {
  tipoDocumento: Extract<TipoDocumento, "07" | "08">;
  motivo: MotivoNotaCredito | MotivoNotaDebito;
  descripcionMotivo: string;
  documentoAfectado: DocumentoAfectado;
}

/** Resultado de procesar el CDR devuelto por SUNAT. */
export interface ResultadoCdr {
  aceptado: boolean;
  codigo: string; // código de respuesta SUNAT (0 = aceptado)
  descripcion: string;
  /** Observaciones (aceptado con notas). */
  observaciones: string[];
  /** XML del CDR, para archivar. */
  cdrXml?: string;
}

/** Salida de la generación+firma: lo que se envía y se persiste. */
export interface ComprobanteFirmado {
  /** Nombre del documento según SUNAT: RUC-tipo-serie-correlativo. */
  nombre: string;
  /** XML UBL 2.1 ya firmado. */
  xmlFirmado: string;
  /** Hash del contenido firmado (para el campo `hash` de la BD). */
  hash: string;
}

// Las cuentas del pie de un documento (base, IGV y descuento) viajan con el
// dominio: las necesitan tanto el panel como la tienda, y aquí se pueden importar
// desde un componente de navegador sin arrastrar la firma ni el SOAP.
export * from "./totales";

// La cotización impresa también: no lleva QR ni firma, así que su armado puede
// vivir aquí y ser importado por los dos apps sin arrastrar el conector.
export * from "./cotizacion-impresa";
