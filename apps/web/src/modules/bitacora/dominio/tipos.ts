/**
 * La bitácora: quién cambió qué y cuándo.
 *
 * La escriben disparadores en la base (migración 051), no la aplicación. Aquí
 * solo vive cómo se lee: qué nombre le damos a cada tabla y a cada acción, que
 * es lo que separa una lista utilizable de un volcado de nombres técnicos.
 */

export interface Movimiento {
  id: number;
  usuario_nombre: string;
  usuario_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  descripcion: string | null;
  creado_en: string;
}

/**
 * Las tablas que se vigilan, con el nombre que usa quien trabaja aquí.
 *
 * La lista es la misma de la 051 y ese es el punto: lo que no está vigilado no
 * aparece, y lo que aparece tiene nombre en castellano. `permisos_rol` no le
 * dice nada a nadie; «permisos» sí.
 */
export const ETIQUETA_ENTIDAD: Record<string, string> = {
  comprobantes: "Facturas y boletas",
  cotizaciones: "Cotizaciones",
  compras: "Compras",
  recepciones: "Recepciones",
  ajustes_inventario: "Ajustes de inventario",
  permisos_rol: "Permisos",
  perfiles: "Usuarios",
  clientes: "Clientes",
  productos: "Productos",
};

/** En el orden en que se ofrecen para filtrar. */
export const ENTIDADES = Object.keys(ETIQUETA_ENTIDAD);

export const ETIQUETA_ACCION: Record<string, string> = {
  creado: "Creado",
  cambiado: "Cambiado",
  borrado: "Borrado",
};

/**
 * El color de cada acción.
 *
 * Borrar es lo único que no tiene deshacer, así que es lo único en rojo. Si
 * todo llevara color, el rojo dejaría de significar nada.
 */
export const TONO_ACCION: Record<string, "neutral" | "info" | "danger"> = {
  creado: "info",
  cambiado: "neutral",
  borrado: "danger",
};

/** A dónde lleva una fila, cuando el documento se puede abrir. */
export function enlaceDe(entidad: string, id: string | null): string | null {
  if (!id) return null;
  switch (entidad) {
    case "comprobantes":
      return `/facturacion/${id}`;
    case "cotizaciones":
      return `/cotizaciones/${id}`;
    case "compras":
      return `/compras/${id}`;
    case "recepciones":
      return `/recepciones/${id}`;
    case "clientes":
      return `/clientes/${id}`;
    case "productos":
      return `/productos/${id}`;
    // `permisos_rol`, `perfiles` y `ajustes_inventario` no tienen ficha propia
    // a la que llevar. Un enlace roto es peor que ninguno.
    default:
      return null;
  }
}

export interface FiltrosBitacora {
  entidad?: string;
  usuario?: string;
  desde?: string;
  hasta?: string;
  /** Cursor keyset: el `id` de la última fila de la página anterior. */
  cursor?: string;
}

/**
 * Los campos vigilados, con el nombre que usa quien trabaja aquí.
 *
 * La descripción la arma la base con el nombre de la columna —`linea_credito:
 * 0.00 → 5000.00`— porque un disparador no tiene por qué saber de castellano.
 * Traducirlo es cosa de la pantalla, y es la diferencia entre una bitácora que
 * lee un programador y una que lee Willy.
 */
export const ETIQUETA_CAMPO: Record<string, string> = {
  estado: "Estado",
  estado_sunat: "Estado en SUNAT",
  motivo_anulacion: "Motivo de anulación",
  total: "Total",
  moneda: "Moneda",
  tipo_cambio: "Tipo de cambio",
  anulada: "Anulada",
  escribir: "Puede escribir",
  rol: "Rol",
  activo: "Activo",
  linea_credito: "Línea de crédito",
  dias_credito: "Días de crédito",
  bloqueado: "Bloqueado",
  precio_venta: "Precio de venta",
  precio_minimo: "Precio mínimo",
  archivado: "Archivado",
};

/**
 * La descripción, con los nombres de campo en castellano.
 *
 * Se traduce solo lo que va antes de los dos puntos, y solo si se conoce: un
 * campo nuevo que alguien vigile mañana saldrá con su nombre técnico, que es
 * feo pero cierto. Inventarle una traducción sería peor.
 */
export function describir(descripcion: string | null): string {
  if (!descripcion) return "—";
  return descripcion
    .split(" · ")
    .map((trozo) => {
      const corte = trozo.indexOf(":");
      if (corte === -1) return trozo;
      const campo = trozo.slice(0, corte);
      const etiqueta = ETIQUETA_CAMPO[campo];
      return etiqueta ? `${etiqueta}${trozo.slice(corte)}` : trozo;
    })
    .join(" · ");
}
