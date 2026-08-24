/**
 * Contrato del módulo de clientes.
 *
 * Este archivo es la frontera entre la capa de datos y la de interfaz: lo
 * escribe una sola mano y las dos capas se construyen contra él. Nadie lo
 * cambia sin decirlo.
 *
 * El vocabulario es el del cliente y el del esquema (`clientes`), no una
 * traducción intermedia.
 */

export type CondicionPago = "contado" | "credito";
export type TipoDocumento = "RUC" | "DNI" | "CE" | "PAS" | "SIN_DOC";

/** Una fila del listado. Solo lo que se pinta en la tabla. */
export interface ClienteLista {
  id: string;
  codigo: string;
  tipo_documento: TipoDocumento;
  numero_documento: string | null;
  razon_social: string;
  nombre_comercial: string | null;
  contacto: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  condicion_pago: CondicionPago;
  dias_credito: number;
  linea_credito: number;
  bloqueado: boolean;
  activo: boolean;
}

/** La ficha completa. Los 32 campos del maestro. */
export interface ClienteDetalle extends ClienteLista {
  direccion: string | null;
  ubigeo_codigo: string | null;
  /** «Lima · Lima · San Isidro», ya resuelto por la consulta. */
  ubigeo_nombre: string | null;
  referencia_direccion: string | null;
  sector: string | null;
  cargo_contacto: string | null;
  dias_gracia: number;
  motivo_bloqueo: string | null;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  notas: string | null;
  creado_en: string;
}

export interface FiltrosClientes {
  q?: string;
  condicion?: CondicionPago;
  /** "1" incluye los bloqueados; por defecto se ocultan. */
  bloqueados?: boolean;
  /** "1" incluye los desactivados. */
  inactivos?: boolean;
  cursor?: string;
}

/**
 * Lo que se manda al guardar.
 *
 * Alta rápida: `tipo_documento`, `numero_documento` y `razon_social` son lo
 * único obligatorio. Willy fue textual sobre esto — *"hay muchos clientes
 * técnicos que a las justas me dan correo"*—, así que el resto vive detrás de
 * «más datos» y puede quedar vacío.
 */
export interface ClienteEditable {
  id?: string;
  tipo_documento: TipoDocumento;
  numero_documento: string | null;
  razon_social: string;
  nombre_comercial: string | null;
  direccion: string | null;
  ubigeo_codigo: string | null;
  referencia_direccion: string | null;
  sector: string | null;
  contacto: string | null;
  cargo_contacto: string | null;
  email: string | null;
  telefono: string | null;
  whatsapp: string | null;
  condicion_pago: CondicionPago;
  linea_credito: number;
  dias_credito: number;
  dias_gracia: number;
  vendedor_id: string | null;
  notas: string | null;
}

/** Resultado de cualquier consulta que puede fallar sin tumbar la página. */
export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/** Resultado de guardar. `campo` permite señalar el input culpable. */
export type ResultadoCliente =
  | { ok: true; id: string; codigo: string; razonSocial: string }
  | { ok: false; error: string; campo?: keyof ClienteEditable };

/** Lo que devuelve la consulta a SUNAT/RENIEC, ya normalizado. */
export interface DatosDocumento {
  razon_social: string;
  nombre_comercial: string | null;
  direccion: string | null;
  ubigeo_codigo: string | null;
  /** Estado del contribuyente: ACTIVO, BAJA DE OFICIO… Solo informativo. */
  estado: string | null;
  /** HABIDO / NO HABIDO. Importa: a un NO HABIDO no se le factura tranquilo. */
  condicion: string | null;
}

export type ResultadoDocumento =
  | { ok: true; datos: DatosDocumento; consumioCuota: boolean }
  | { ok: false; error: string; agotada?: boolean };

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

export const ETIQUETA_CONDICION: Record<CondicionPago, string> = {
  contado: "Al contado",
  credito: "A crédito",
};

export const ETIQUETA_DOCUMENTO: Record<TipoDocumento, string> = {
  RUC: "RUC",
  DNI: "DNI",
  CE: "Carné de extranjería",
  PAS: "Pasaporte",
  SIN_DOC: "Sin documento",
};

/** Cuántos dígitos tiene cada documento. `null` = longitud libre. */
export const LARGO_DOCUMENTO: Record<TipoDocumento, number | null> = {
  RUC: 11,
  DNI: 8,
  CE: null,
  PAS: null,
  SIN_DOC: null,
};
