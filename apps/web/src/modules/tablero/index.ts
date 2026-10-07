/**
 * Módulo del tablero: superficie pública.
 *
 * Ver apps/web/src/modules/README.md.
 */

export { default as PaginaTablero } from "./ui/pagina";

// Los tres reportes (06/10), cada uno en su pantalla bajo /reportes desde el 07/10.
export { default as PaginaClientesEjecutiva } from "./ui/ejecutivo/clientes";
export { default as PaginaCotizacionesEjecutiva } from "./ui/ejecutivo/cotizaciones";
export { default as PaginaFacturacionEjecutiva } from "./ui/ejecutivo/facturacion";

export type { AlertaResumen, Cartera, KpisPeriodo, PuntoSerie } from "./api/consultas";
