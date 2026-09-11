/**
 * Tipos del módulo de facturación.
 *
 * El comprobante es el final del ciclo comercial: nace de una cotización
 * aprobada, descarga stock y va a SUNAT. La emisión ya la resuelve
 * `emitir_comprobante()` en Postgres —correlativo, totales, SPOT, kardex— y el
 * envío lo resuelve `@rodatech/sunat`. Este módulo es el pegamento.
 */

/** Los cuatro tipos fiscales que maneja el sistema. */
export type TipoComprobante = "factura" | "boleta" | "nota_credito" | "nota_debito";

export const ETIQUETA_TIPO: Record<TipoComprobante, string> = {
  factura: "Factura",
  boleta: "Boleta",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
};

/** Estado comercial del documento. */
export type EstadoComprobante = "emitido" | "pagado" | "anulado" | "vencido";

/** Ciclo de vida ante SUNAT. */
export type EstadoSunat =
  | "no_enviado"
  | "pendiente"
  | "enviado"
  | "aceptado"
  | "observado"
  | "rechazado"
  | "baja_solicitada"
  | "baja_aceptada";

export const ETIQUETA_SUNAT: Record<EstadoSunat, string> = {
  no_enviado: "Sin enviar",
  pendiente: "En cola",
  enviado: "Enviado",
  aceptado: "Aceptado",
  observado: "Observado",
  rechazado: "Rechazado",
  baja_solicitada: "Baja pedida",
  baja_aceptada: "Dado de baja",
};

/*
  Aquí vivía TONO_SUNAT, el mapa de tonos de la insignia. Se va el 11/09, con
  la ficha siguiendo al listado a `EstadoBadge`: ya no lo importaba nadie, y un
  mapa suelto es lo que hace que reaparezca un estado sin punto.

  El motivo que lo justificaba no se pierde: «Observado» sigue en ámbar y no en
  rojo —SUNAT lo aceptó, pero con reparos, y en rojo se trataría como un
  rechazo y se reemitiría un documento que ya es válido—, y eso está escrito
  con esas palabras en `packages/ui/src/dominio/estado-badge.tsx`.
*/

/** Una fila del listado. */
export interface ComprobanteLista {
  id: string;
  tipo: TipoComprobante;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  cliente: string | null;
  cliente_documento: string | null;
  cotizacion_numero: string | null;
  total: number;
  pagado: number;
  saldo: number;
  estado: EstadoComprobante;
  estado_sunat: EstadoSunat;
  vendedor: string | null;
}

/** Una línea de la ficha. */
export interface LineaComprobante {
  id: string;
  producto_id: string | null;
  codigo: string;
  /** En columna propia, no pegada a la descripción (Willy, 11:07). */
  marca: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  valor_unitario: number;
  descuento_pct: number;
  importe: number;
}

/** Una cuota del crédito, tal como sale impresa al pie. */
export interface CuotaComprobante {
  numero: number;
  fecha_vencimiento: string;
  monto: number;
  pagado: number;
}

/** La ficha completa. */
export interface ComprobanteDetalle {
  id: string;
  tipo: TipoComprobante;
  serie: string;
  correlativo: number;
  numero: string;
  cliente_id: string;
  cliente: string | null;
  cliente_documento: string | null;
  cliente_tipo_documento: string | null;
  cliente_direccion: string | null;
  cliente_email: string | null;
  cotizacion_id: string | null;
  cotizacion_numero: string | null;
  orden_compra_cliente: string | null;
  referencia_id: string | null;
  referencia_numero: string | null;
  motivo_nota_codigo: string | null;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  condicion_pago: string;
  dias_credito: number;
  /** `PEN` o `USD`: decide qué cuenta bancaria sale primero al pie. */
  moneda: string;
  /** Si la factura imprime las cuentas para pagar (029). */
  mostrar_cuenta: boolean;
  /** La guía con la que salió la mercadería. Su formato la imprime. */
  guia_numero: string | null;
  /** Cuándo vence cada parte de lo que debe. Vacío si es al contado. */
  cuotas: CuotaComprobante[];
  op_gravada: number;
  op_exonerada: number;
  op_inafecta: number;
  descuento_global: number;
  igv: number;
  total: number;
  total_letras: string | null;
  pagado: number;
  saldo: number;
  estado: EstadoComprobante;
  estado_sunat: EstadoSunat;
  sunat_codigo_respuesta: string | null;
  sunat_mensaje: string | null;
  sunat_enviado_en: string | null;
  sunat_hash_cdr: string | null;
  detraccion_aplica: boolean;
  detraccion_porcentaje: number;
  detraccion_monto: number;
  detraccion_codigo: string | null;
  retencion_aplica: boolean;
  retencion_monto: number;
  vendedor: string | null;
  observaciones: string | null;
  motivo_anulacion: string | null;
  creado_en: string;
  lineas: LineaComprobante[];
}

/** Filtros del listado. Viajan en los search params, así que todo es texto. */
export interface FiltrosComprobantes {
  q?: string;
  cliente?: string;
  tipo?: string;
  estado?: string;
  sunat?: string;
  desde?: string;
  hasta?: string;
  cursor?: string;
  /**
   * Hacia dónde se mueve el cursor.
   *
   * `ant` es la página anterior: el mismo keyset del revés —`gt` en vez de
   * `lt` y orden ascendente— y las filas se devuelven dadas la vuelta. Sin
   * esto, el cursor solo sabía avanzar.
   */
  direccion?: "sig" | "ant";
  /**
   * Filas por página, ya validado.
   *
   * Lo pone la página leyendo `?n=` con `leerTamano`, no llega crudo de la
   * URL: es un límite de consulta y aceptar cualquier número es aceptar que
   * alguien pida cien mil filas.
   */
  limite?: number;
}

/** Lo visible de la configuración fiscal. */
export interface ConfigFiscal {
  ambiente: "beta" | "produccion";
  usuario_sol: string | null;
  certificado_nombre: string | null;
  certificado_sujeto: string | null;
  certificado_caduca_en: string | null;
  serie_factura: string;
  serie_boleta: string;
  probado_en: string | null;
  probado_ok: boolean | null;
  probado_mensaje: string | null;
  actualizado_en: string | null;
}

/** Qué falta para poder emitir de verdad. */
export interface EstadoConfiguracion {
  listo: boolean;
  /** Lo que hay que resolver, en frases. Vacío si está todo. */
  faltan: string[];
  ambiente: "beta" | "produccion";
  /** Aviso si el certificado está por caducar o ya caducó. */
  avisoCaducidad: string | null;
}

/** Una cotización aprobada, lista para facturar. */
export interface CotizacionFacturable {
  id: string;
  numero: string;
  fecha: string;
  cliente_id: string;
  cliente: string;
  cliente_documento: string | null;
  cliente_tipo_documento: string | null;
  orden_compra_cliente: string | null;
  condicion_pago: string;
  dias_credito: number;
  total: number;
  /**
   * Cuántas líneas de la cotización ya se facturaron ENTERAS y por eso no
   * salen abajo. Sirve para distinguir «esta cotización no tiene líneas»
   * de «ya está toda facturada», que llevan a acciones opuestas.
   */
  lineas_ya_facturadas: number;
  /** Solo lo que queda por facturar. Lo entregado ya no está aquí. */
  lineas: {
    producto_id: string;
    codigo: string;
    descripcion: string;
    unidad: string;
    /**
     * Lo PENDIENTE de facturar: lo que el cliente confirmó menos lo que ya
     * se le emitió. No es lo que se cotizó.
     *
     * Era `cantidad` a secas —lo cotizado— y ese era el fallo de la 047: al
     * cliente que confirmaba 4 de 6 se le facturaban 6.
     */
    cantidad: number;
    /** Lo que se le cotizó en su día, para poder enseñarlo al lado. */
    cantidad_cotizada: number;
    /** Y lo que ya se le facturó de esta línea. */
    cantidad_atendida: number;
    /**
     * Lo que hay en el almacén de este producto, hoy.
     *
     * Va aquí porque la casilla «la mercadería sale con esta factura»
     * descuenta stock, y `stock.cantidad` PUEDE quedar negativo a propósito
     * (002: «preferimos un descuadre visible a bloquear el despacho»). Esa
     * decisión es buena mientras alguien la tome a sabiendas — y sin este
     * número no había cómo saberlo: la pantalla precargaba las 5 unidades
     * confirmadas con 1 sola en el estante y no decía nada.
     */
    stock: number;
    valor_unitario: number;
    descuento_pct: number;
    importe: number;
  }[];
}
