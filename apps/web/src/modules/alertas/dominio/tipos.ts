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

/** Los once valores que admite la restricción `alerta_tipo_ok`. */
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
  | "margen_bajo";

/**
 * Los siete tipos que `generar_alertas()` produce hoy.
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
};

export const ETIQUETA_SEVERIDAD: Record<Severidad, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  info: "Informativa",
};

/**
 * Las tres familias en las que se agrupa la bandeja.
 *
 * No es una columna de la tabla: se deduce de `tipo`. Agrupar por severidad
 * mezclaría un quiebre de stock con una factura vencida, y son dos personas
 * distintas las que actúan sobre cada uno.
 */
export type Familia = "almacen" | "dinero" | "documentos";

export const ETIQUETA_FAMILIA: Record<Familia, string> = {
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
