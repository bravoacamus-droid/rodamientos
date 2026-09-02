/**
 * Módulo de bitácora: superficie pública.
 *
 * Quién cambió qué y cuándo. La escriben disparadores en la base (migración
 * 051); aquí solo se lee.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaBitacora } from "./ui/pagina";

// El historial de UN documento. Lo consume la ficha del comprobante: «¿quién
// anuló esta factura?» se contesta mejor ahí que en una lista con filtros.
export { historialDe } from "./api/consultas";

export {
  ETIQUETA_ACCION,
  ETIQUETA_ENTIDAD,
  TONO_ACCION,
  enlaceDe,
  type Movimiento,
} from "./dominio/tipos";
