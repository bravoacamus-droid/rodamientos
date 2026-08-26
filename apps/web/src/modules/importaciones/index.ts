/**
 * Módulo de importaciones: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaImportaciones } from "./ui/pagina";

// Las reglas son puras y las va a querer cualquier pantalla que hable de
// costo puesto en almacén — la de compras, sin ir más lejos.
export {
  costoEnAlmacen,
  diasDeAtraso,
  diasParaLlegar,
  estadoTransito,
  incidenciaGastos,
  ordenarImportaciones,
  resumir,
  sumarGastos,
  tonoTransito,
} from "./dominio/transito";

export {
  CONCEPTOS_HABITUALES,
  ETIQUETA_TRANSITO,
  type EstadoTransito,
  type FiltrosImportaciones,
  type GastoImportacion,
  type Importacion,
  type ResumenImportaciones,
} from "./dominio/tipos";
