/**
 * Tipos del módulo de alertas.
 *
 * La bandeja es la mitad visible de algo que en realidad es una COLA DE ENVÍO.
 * `alertas.notificado_en` existe porque Willy dijo la frase que originó el
 * módulo: *«pero no te llega como una alerta, tú tienes que entrar y ver»*
 * (25:21). Un worker toma las que tienen `notificado_en` en null y las empuja
 * por WhatsApp o correo; esta pantalla es para cuando ya estás dentro.
 *
 * Nada de lo que hay aquí calcula alertas. Las calcula `generar_alertas()` en
 * la base, de una sola pasada y de forma idempotente por `huella`. Duplicar esa
 * lógica en TypeScript sería tener dos definiciones de «stock bajo» que
 * acabarían discrepando.
 */

/** Los cinco niveles del enum `severidad_alerta`. */
export type Severidad = "info" | "baja" | "media" | "alta" | "critica";

/** Los veinticuatro valores que admite la restricción `alerta_tipo_ok` (161). */
export type TipoAlerta =
  | "quiebre_stock"
  | "stock_bajo"
  | "sobrestock"
  | "stock_negativo"
  | "credito_por_vencer"
  | "credito_vencido"
  | "linea_credito"
  | "cotizacion_por_vencer"
  | "sunat_rechazo"
  | "sin_rotacion"
  | "margen_bajo"
  | "sunat_atascado"
  | "certificado_por_vencer"
  | "respaldo_atrasado"
  | "gre_rechazo"
  | "baja_rechazada"
  | "fallos_pendientes"
  // 161: lo que se queda atrás en el día a día.
  | "guia_sin_facturar"
  | "pedido_sin_guia"
  | "pedido_por_despachar"
  | "cotizacion_sin_respuesta"
  | "cotizaciones_sin_cerrar"
  | "cotizacion_borrador"
  | "compra_sin_recibir";

/**
 * Los avisos de lo que se queda atrás (161), en el orden del flujo: de la
 * cotización al cobro. Luis, 27/10: *«que me avise que tengo cotizaciones sin
 * cerrar o aprobar, que no se haya sacado una guía… que el app sea
 * interactivo y ayude al sr Willy en su día a día»*.
 *
 * No son fallos: son cosas que nadie ha hecho todavía. Por eso tienen su
 * propio grupo en la bandeja y su propio recuadro en el tablero.
 */
export const TIPOS_DEL_DIA_A_DIA: readonly TipoAlerta[] = [
  "cotizacion_borrador",
  "cotizacion_sin_respuesta",
  "cotizacion_por_vencer",
  "cotizaciones_sin_cerrar",
  "compra_sin_recibir",
  "pedido_sin_guia",
  "pedido_por_despachar",
  "guia_sin_facturar",
];

/**
 * Los tipos que `generar_alertas()` produce hoy.
 *
 * `sin_rotacion` y `margen_bajo` están permitidos por la restricción pero
 * todavía no los genera nadie: quedaron reservados en el esquema. Se listan
 * aparte para que el filtro de la pantalla no ofrezca dos opciones que siempre
 * devuelven cero.
 */
export const TIPOS_QUE_SE_GENERAN: readonly TipoAlerta[] = [
  "quiebre_stock",
  "stock_bajo",
  "sobrestock",
  "stock_negativo",
  "credito_por_vencer",
  "credito_vencido",
  "linea_credito",
  "cotizacion_por_vencer",
  "sunat_rechazo",
  // 102: un envío que se quedó sin respuesta. Se generaba y la pantalla no
  // le tenía nombre (visto el 23/10).
  "sunat_atascado",
  "certificado_por_vencer",
  // 159: lo que solo se veía en «Datos de la empresa», /sunat y /actividad.
  "respaldo_atrasado",
  "gre_rechazo",
  "baja_rechazada",
  "fallos_pendientes",
  // 161: lo que se queda atrás.
  "guia_sin_facturar",
  "pedido_sin_guia",
  "pedido_por_despachar",
  "cotizacion_sin_respuesta",
  "cotizaciones_sin_cerrar",
  "cotizacion_borrador",
  "compra_sin_recibir",
];

export const ETIQUETA_TIPO: Record<TipoAlerta, string> = {
  quiebre_stock: "Quiebre de stock",
  stock_bajo: "Stock bajo el mínimo",
  sobrestock: "Sobrestock",
  stock_negativo: "Saldo negativo",
  credito_por_vencer: "Factura por vencer",
  credito_vencido: "Factura vencida",
  linea_credito: "Línea de crédito",
  cotizacion_por_vencer: "Cotización por vencer",
  sunat_rechazo: "Rechazo de SUNAT",
  sin_rotacion: "Sin rotación",
  margen_bajo: "Margen bajo",
  sunat_atascado: "Envío a SUNAT sin respuesta",
  certificado_por_vencer: "Certificado digital por caducar",
  respaldo_atrasado: "Copia de seguridad atrasada",
  gre_rechazo: "Guía rechazada por SUNAT",
  baja_rechazada: "Baja rechazada por SUNAT",
  fallos_pendientes: "Errores sin revisar",
  guia_sin_facturar: "Guía sin facturar",
  pedido_sin_guia: "Pedido sin guía",
  pedido_por_despachar: "Pedido a medio despachar",
  cotizacion_sin_respuesta: "Cotización sin respuesta",
  cotizaciones_sin_cerrar: "Cotizaciones vencidas sin respuesta",
  cotizacion_borrador: "Cotización sin mandar",
  compra_sin_recibir: "Compra que no llega",
};

export const ETIQUETA_SEVERIDAD: Record<Severidad, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  info: "Informativa",
};

/**
 * Las familias en las que se agrupa la bandeja.
 *
 * No es una columna de la tabla: se deduce de `tipo`. Agrupar por severidad
 * mezclaría un quiebre de stock con una factura vencida, y son dos personas
 * distintas las que actúan sobre cada uno.
 */
export type Familia = "pedidos" | "almacen" | "dinero" | "documentos";

/**
 * En el orden en que se pintan. «Pedidos y ventas» (161) va primero: es lo
 * que se queda atrás en el día a día, y lo que se abre por la mañana.
 */
export const FAMILIAS: readonly Familia[] = ["pedidos", "almacen", "dinero", "documentos"];

export const ETIQUETA_FAMILIA: Record<Familia, string> = {
  pedidos: "Pedidos y ventas",
  almacen: "Almacén",
  dinero: "Dinero",
  documentos: "Documentos",
};

/** Una fila de `alertas`. */
export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  severidad: Severidad;
  titulo: string;
  mensaje: string;
  entidad_tipo: string | null;
  entidad_id: string | null;
  entidad_nombre: string | null;
  valor: number | null;
  /** Ruta interna a la pantalla donde se arregla. Puede faltar. */
  accion_url: string | null;
  leida: boolean;
  archivada: boolean;
  /** Marca de envío por el worker. Null = todavía no salió. */
  notificado_en: string | null;
  generada_en: string;
}

/** Cuántas hay de cada cosa, para las tarjetas de arriba. */
export interface ResumenBandeja {
  total: number;
  sinLeer: number;
  criticas: number;
  porSeveridad: Record<Severidad, number>;
  /** La más reciente que haya, leída o no. */
  ultima: string | null;
}

/** Qué se está mirando. Viaja en los search params, así que todo es texto. */
export interface FiltrosBandeja {
  q?: string;
  severidad?: string;
  tipo?: string;
  familia?: string;
  /** `archivadas` para ver el histórico; por defecto, la bandeja viva. */
  ver?: string;
}
