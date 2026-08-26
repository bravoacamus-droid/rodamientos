/**
 * Módulo de trazabilidad por ítem: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaTrazabilidad } from "./ui/pagina";

export {
  agruparPorDia,
  contarPorLado,
  dispersionCotizada,
  margenDeReferencia,
  ordenarEventos,
  porCliente,
  porProveedor,
  tonoEvento,
} from "./dominio/linea-tiempo";

export {
  AYUDA_EVENTO,
  ETIQUETA_EVENTO,
  type Evento,
  type EventoTrazabilidad,
  type Lado,
  type Referencia,
  type ResumenTrazabilidad,
} from "./dominio/tipos";
