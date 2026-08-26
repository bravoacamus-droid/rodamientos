/**
 * Tipos del módulo de configuración.
 *
 * Tres cosas que hoy solo se pueden tocar con SQL y que hacen falta el día de
 * la puesta en marcha:
 *
 *   1. Los datos fiscales del emisor, que viajan en cada comprobante.
 *   2. Las series y **el correlativo de partida**. Willy fue explícito:
 *      *«los correlativos van a iniciar desde el número que usted se quedó»*
 *      (06:08). Sin esta pantalla, arrancar la numeración donde la dejó el
 *      sistema anterior es un `update` a mano contra producción.
 *   3. Quién entra y con qué rol.
 */

/** Los seis roles de `rol_usuario`. */
export type Rol = "gerencia" | "admin" | "ventas" | "almacen" | "compras" | "cobranzas";

export const ROLES: readonly Rol[] = [
  "gerencia",
  "admin",
  "ventas",
  "almacen",
  "compras",
  "cobranzas",
];

export const ETIQUETA_ROL: Record<Rol, string> = {
  gerencia: "Gerencia",
  admin: "Administración",
  ventas: "Ventas",
  almacen: "Almacén",
  compras: "Compras",
  cobranzas: "Cobranzas",
};

/** Qué puede hacer cada rol, dicho para quien lo va a asignar. */
export const AYUDA_ROL: Record<Rol, string> = {
  gerencia: "Todo, incluido el ajuste de inventario y los permisos.",
  admin: "Todo salvo lo que gerencia se reservó.",
  ventas: "Cotiza, factura, despacha y da de alta clientes. No ve costos de compra.",
  almacen: "Recibe, despacha y mueve stock. No fija precios.",
  compras: "Proveedores, compras, recepciones y el maestro de productos.",
  cobranzas: "Cartera, pagos y gestiones. No emite.",
};

/** Los nueve valores de `tipo_documento`. */
export type TipoDocumento =
  | "cotizacion"
  | "guia_remision"
  | "factura"
  | "boleta"
  | "nota_credito"
  | "nota_debito"
  | "compra"
  | "recepcion"
  | "ajuste_inventario";

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  cotizacion: "Cotización",
  guia_remision: "Guía de remisión",
  factura: "Factura",
  boleta: "Boleta",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  compra: "Orden de compra",
  recepcion: "Recepción",
  ajuste_inventario: "Ajuste de inventario",
};

/**
 * Los tipos que SUNAT numera y los que son internos.
 *
 * La distinción importa: un hueco en la numeración de una factura hay que
 * explicárselo a SUNAT; uno en las recepciones no se lo tiene que explicar a
 * nadie. La pantalla avisa distinto según de cuál se trate.
 */
export const TIPOS_FISCALES: readonly TipoDocumento[] = [
  "factura",
  "boleta",
  "nota_credito",
  "nota_debito",
  "guia_remision",
];

/** La fila única de `empresa`. */
export interface Empresa {
  razon_social: string;
  nombre_comercial: string;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  email_ventas: string | null;
  web: string | null;
  eslogan: string | null;
  igv_porcentaje: number;
  detraccion_monto_minimo: number;
  detraccion_porcentaje: number;
  retencion_porcentaje: number;
  cuenta_detraccion: string | null;
  agente_retencion: boolean;

  /**
   * La cuenta a la que COBRA. Nada que ver con `cuenta_detraccion`, que es la
   * del Banco de la Nación para el SPOT y no sirve para que le transfieran.
   *
   * Willy 26/08 (14:40): en la cotización sale siempre; en la factura por
   * defecto sí, con opción de quitarla.
   */
  banco: string | null;
  cuenta_corriente: string | null;
  cci: string | null;
  actualizado_en: string;
}

/** Una serie de numeración. */
export interface SerieDocumento {
  id: string;
  tipo: TipoDocumento;
  serie: string;
  /** Desde dónde continúa la numeración del sistema anterior. */
  correlativo_inicial: number;
  /** El último efectivamente emitido. */
  correlativo_actual: number;
  longitud: number;
  predeterminada: boolean;
  activo: boolean;
  descripcion: string | null;
}

/** Un usuario del ERP. */
export interface Usuario {
  id: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  cargo: string | null;
  activo: boolean;
  ultimo_acceso: string | null;
}

/** Cuántas filas tiene cada catálogo. */
export interface ConteosCatalogo {
  marcas: number;
  familias: number;
  subfamilias: number;
  tipos: number;
  unidades: number;
}
