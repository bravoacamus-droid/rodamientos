/**
 * Tipos del módulo de cobranzas.
 *
 * Cierra el ciclo del dinero: la factura dice cuánto se debe, esto registra
 * cuánto se pagó. `registrar_pagos()` solo inserta en `pagos`; el trigger
 * `trg_pagos_recalcular` se encarga del resto —actualiza `comprobantes.pagado`,
 * mueve el estado a parcial/pagado/vencido y reparte sobre las cuotas de la
 * más antigua a la más nueva—.
 *
 * Eso significa que aquí NO se calcula ningún saldo para guardarlo. Se leen los
 * que la base ya mantiene. Un saldo calculado en dos sitios es un saldo que
 * acaba diciendo dos cosas.
 */

/** Los ocho medios que acepta `pago_medio_ok`. */
export type MedioPago =
  | "efectivo"
  | "transferencia"
  | "deposito"
  | "cheque"
  | "letra"
  | "detraccion"
  | "retencion"
  | "nota_credito";

export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  deposito: "Depósito",
  cheque: "Cheque",
  letra: "Letra",
  detraccion: "Detracción",
  retencion: "Retención",
  nota_credito: "Nota de crédito",
};

/**
 * Medios que NO son dinero que entra a la cuenta.
 *
 * La detracción la deposita el cliente en el Banco de la Nación y la retención
 * se la queda él para pagarla a SUNAT. Las dos reducen el saldo igual, pero
 * quien concilia el banco no las va a encontrar en el extracto — y esa
 * diferencia es la que hace perder una tarde.
 */
export const MEDIOS_SIN_CAJA: readonly MedioPago[] = [
  "detraccion",
  "retencion",
  "nota_credito",
];

/** Los tramos de aging que devuelve `v_cartera`. */
export type TramoAging =
  | "sin_vencimiento"
  | "por_vencer"
  | "1_30"
  | "31_60"
  | "61_90"
  | "mas_90";

/** Una fila de la cartera: un comprobante con saldo vivo. */
export interface DocumentoPorCobrar {
  id: string;
  numero: string;
  tipo: string;
  cliente_id: string;
  cliente: string;
  documento: string | null;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  condicion_pago: string;
  total: number;
  pagado: number;
  saldo: number;
  estado: string;
  orden_compra_cliente: string | null;
  dias_vencido: number;
  tramo_aging: TramoAging;
  vendedor: string | null;
  detraccion_aplica: boolean;
  detraccion_monto: number;
  retencion_aplica: boolean;
  retencion_monto: number;
}

/** Un pago ya registrado. */
export interface PagoRegistrado {
  id: string;
  comprobante_id: string;
  comprobante_numero: string;
  cliente: string | null;
  fecha: string;
  monto: number;
  medio: MedioPago;
  referencia: string | null;
  observaciones: string | null;
  registrado_por: string | null;
}

/** Una cuota del cronograma, con lo que lleva pagado. */
export interface CuotaComprobante {
  id: string;
  numero: number;
  fecha_vencimiento: string;
  monto: number;
  pagado: number;
  saldo: number;
}

/** Una gestión de cobranza: la llamada, el WhatsApp, la promesa de pago. */
export interface Gestion {
  id: string;
  cliente_id: string;
  comprobante_id: string | null;
  comprobante_numero: string | null;
  fecha: string;
  canal: string;
  resultado: string | null;
  compromiso_fecha: string | null;
  nota: string | null;
  usuario: string | null;
}

export const CANALES = [
  "whatsapp",
  "llamada",
  "correo",
  "visita",
  "otro",
] as const;

export const ETIQUETA_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  correo: "Correo",
  visita: "Visita",
  otro: "Otro",
};

/** Resumen de la cartera por cliente, para perseguir al que más debe. */
export interface ClienteEnCartera {
  cliente_id: string;
  cliente: string;
  documento: string | null;
  documentos: number;
  saldo: number;
  vencido: number;
  /** Los días del documento más atrasado. */
  diasMasAntiguo: number;
}

/** Filtros del listado. Viajan en los search params, así que todo es texto. */
export interface FiltrosCartera {
  q?: string;
  cliente?: string;
  tramo?: string;
  vendedor?: string;
  /** `1` para ver solo lo ya vencido. */
  vencido?: string;
}
