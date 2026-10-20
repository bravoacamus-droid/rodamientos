/**
 * Lo de los permisos que sirve igual en el servidor y en el navegador (143).
 * Los nombres de módulo son las claves de la tabla `modulos`.
 */
export type Modulo =
  | "cotizaciones"
  | "guias"
  | "facturacion"
  | "cobranzas"
  | "clientes"
  | "productos"
  | "equivalencias"
  | "almacen"
  | "transporte"
  | "compras"
  | "proveedores"
  | "reportes"
  | "informe"
  | "configuracion"
  | "bitacora";

export type Accion = "ver" | "crear" | "editar" | "eliminar";

export const ACCIONES: readonly Accion[] = ["ver", "crear", "editar", "eliminar"];

export const ETIQUETA_ACCION: Record<Accion, string> = {
  ver: "Ver",
  crear: "Crear",
  editar: "Editar",
  eliminar: "Eliminar",
};

/** Cómo se nombra cada módulo dentro de una frase: «no puede crear en …». */
const NOMBRE_MODULO: Record<Modulo, string> = {
  cotizaciones: "Cotizaciones y pedidos",
  guias: "Guías de remisión",
  facturacion: "Facturación",
  cobranzas: "Cobranzas",
  clientes: "Clientes",
  productos: "Productos",
  equivalencias: "Equivalencias",
  almacen: "Almacén",
  transporte: "Transporte",
  compras: "Compras",
  proveedores: "Proveedores",
  reportes: "Reportes",
  informe: "Informe general",
  configuracion: "Datos de la empresa",
  bitacora: "Qué ha pasado",
};

const VERBO: Record<Accion, string> = {
  ver: "ver",
  crear: "crear",
  editar: "cambiar",
  eliminar: "eliminar ni anular",
};

/**
 * La frase que se le enseña a quien no puede. Dice qué no puede y a quién
 * pedírselo: «no autorizado» no le sirve a nadie.
 */
export function avisoSinPermiso(modulo: Modulo, accion: Accion, nombreRol?: string | null): string {
  const quien = nombreRol ? `Tu rol (${nombreRol})` : "Tu rol";
  return `${quien} no puede ${VERBO[accion]} en «${NOMBRE_MODULO[modulo]}». Si lo necesitas, pídeselo a Gerencia: se cambia en Configuración › Roles y permisos.`;
}

/** `tiene` para un componente de cliente, a partir de `MisPermisos.lista`. */
export function tieneEn(lista: readonly string[], modulo: Modulo, accion: Accion): boolean {
  return lista.includes(`${modulo}:${accion}`);
}
