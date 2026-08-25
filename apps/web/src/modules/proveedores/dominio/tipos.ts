/**
 * Contrato del módulo de proveedores.
 *
 * Frontera entre la capa de datos y la de interfaz: lo escribe una sola mano y
 * las dos capas se construyen contra él.
 *
 * El vocabulario es el del esquema (`proveedores`), no una traducción
 * intermedia. La diferencia grande con `clientes` es que un proveedor **no
 * tiene condición de pago ni línea de crédito** —el crédito lo da él, no se lo
 * damos nosotros— y sí tiene dos cosas que un cliente no: **lead time** y
 * **qué marcas representa**.
 */

export type TipoCompra = "local" | "importacion";
export type TipoDocumento = "RUC" | "DNI" | "CE" | "PAS" | "SIN_DOC";

/** Una fila del listado. Solo lo que se pinta en la tabla. */
export interface ProveedorLista {
  id: string;
  codigo: string;
  tipo_documento: TipoDocumento;
  numero_documento: string | null;
  razon_social: string;
  tipo: TipoCompra;
  pais: string;
  contacto: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  dias_pago: number;
  lead_time_dias: number;
  activo: boolean;
  /** Las marcas que representa, ya resueltas por la consulta. */
  marcas: string[];
}

/** La ficha completa. */
export interface ProveedorDetalle extends ProveedorLista {
  direccion: string | null;
  ubigeo_codigo: string | null;
  /** «Lima · Lima · San Isidro», ya resuelto por la consulta. */
  ubigeo_nombre: string | null;
  notas: string | null;
  creado_en: string;
  /** Ids de las marcas, para precargar el formulario. */
  marca_ids: string[];
}

export interface FiltrosProveedores {
  q?: string;
  tipo?: TipoCompra;
  /** Filtra por una marca concreta: «¿quién me vende SKF?». */
  marca?: string;
  /** "1" incluye los desactivados. */
  inactivos?: boolean;
  cursor?: string;
}

/**
 * Lo que se manda al guardar.
 *
 * Alta rápida: documento y razón social es lo único obligatorio, igual que en
 * clientes y por la misma razón. Un proveedor nuevo aparece cuando llega su
 * mercadería, no cuando alguien se sienta a rellenar una ficha.
 */
export interface ProveedorEditable {
  id?: string;
  tipo_documento: TipoDocumento;
  numero_documento: string | null;
  razon_social: string;
  tipo: TipoCompra;
  pais: string;
  direccion: string | null;
  ubigeo_codigo: string | null;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  whatsapp: string | null;
  /** Días que da el proveedor para pagarle. 0 = al contado. */
  dias_pago: number;
  /** Cuánto tarda en entregar. Alimenta el punto de reposición. */
  lead_time_dias: number;
  notas: string | null;
  /** Marcas que representa. Se sincroniza con `proveedor_marcas`. */
  marca_ids: string[];
}

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/** Resultado de guardar. `campo` permite señalar el input culpable. */
export type ResultadoProveedor =
  | { ok: true; id: string; codigo: string; razonSocial: string }
  | { ok: false; error: string; campo?: keyof ProveedorEditable };

export const ETIQUETA_TIPO: Record<TipoCompra, string> = {
  local: "Local",
  importacion: "Importación",
};

export const ETIQUETA_DOCUMENTO: Record<TipoDocumento, string> = {
  RUC: "RUC",
  DNI: "DNI",
  CE: "Carné de extranjería",
  PAS: "Pasaporte",
  SIN_DOC: "Sin documento",
};

/**
 * Un proveedor de importación no tiene por qué tener RUC peruano.
 *
 * Es el caso de las compras por DHL (30:01): el vendedor de fuera se
 * identifica con lo que tenga, o con nada. Por eso `SIN_DOC` existe y por eso
 * `pais` es un campo y no una constante.
 */
export const PAIS_POR_DEFECTO = "Perú";
