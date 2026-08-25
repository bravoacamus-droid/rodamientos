/**
 * Módulo de informes: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaReportes } from "./ui/pagina";

// Los cálculos de periodo son puros y los va a necesitar cualquier pantalla
// que pinte una serie mensual — el tablero, sin ir más lejos.
export {
  COLOR_AGING,
  ETIQUETA_AGING,
  ORDEN_AGING,
  etiquetaAging,
  etiquetaMes,
  finDeMes,
  inicioDeMes,
  mesesAtras,
  ordenarAging,
  rellenarMeses,
  variacionPct,
} from "./dominio/periodo";

export type {
  Embudo,
  FamiliaValorizada,
  FiltrosReportes,
  MesVentas,
  ProductoVendido,
  ResumenReportes,
  TramoCartera,
} from "./dominio/tipos";
