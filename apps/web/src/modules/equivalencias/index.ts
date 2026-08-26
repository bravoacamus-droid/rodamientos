/**
 * Módulo de equivalencias: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaEquivalencias } from "./ui/pagina";

// El cross-reference lo va a querer también la ficha de producto, que hoy
// enseña solo los de la misma medida.
export {
  agruparPorOrigen,
  contarPorOrigen,
  mismoPar,
  parCanonico,
  resumenSustituto,
  tonoOrigen,
} from "./dominio/equivalencia";

export {
  AYUDA_CLASE,
  CLASES,
  ETIQUETA_CLASE,
  ETIQUETA_ORIGEN,
  EXPLICACION_ORIGEN,
  type ClaseEquivalencia,
  type EquivalenciaDeclarada,
  type OrigenSustituto,
  type ProductoBase,
  type Sustituto,
} from "./dominio/tipos";
