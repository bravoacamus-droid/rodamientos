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

// El rango de fechas y su barra. La usa también el tablero, que pidió el mismo
// filtro (Willy 26/08, 2:00). El componente es de cliente y todo lo demás de
// aquí es puro: NADA de `api/` sale por este archivo, porque es `server-only`
// y colarlo aquí rompería a cualquiera que importe la barra desde el navegador.
export { FiltroRango } from "./ui/filtro-rango";
export {
  ETIQUETA_ATAJO,
  ETIQUETA_GRANO,
  GRANOS,
  describirRango,
  diasDelRango,
  etiquetaPeriodo,
  granoSugerido,
  inicioDeSemana,
  leerRango,
  periodoAnterior,
  rangoDeAtajo,
  sumarDias,
  sumarMeses,
  type Atajo,
  type Grano,
  type Rango,
} from "./dominio/rango";

export type {
  ClienteFrecuente,
  Embudo,
  FamiliaValorizada,
  FiltrosReportes,
  MesVentas,
  ProductoConCliente,
  ProductoVendido,
  PuntoCompras,
  PuntoVentas,
  ResumenReportes,
  TramoCartera,
} from "./dominio/tipos";
