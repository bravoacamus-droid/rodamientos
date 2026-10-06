/**
 * Módulo del tablero: superficie pública.
 *
 * Ver apps/web/src/modules/README.md.
 */

export { default as PaginaTablero } from "./ui/pagina";

// El tablero ejecutivo (06/10): las pestañas y las tres vistas por módulo.
export { PestanasTablero } from "./ui/ejecutivo/pestanas";
export { default as PaginaClientesEjecutiva } from "./ui/ejecutivo/clientes";
export { default as PaginaCotizacionesEjecutiva } from "./ui/ejecutivo/cotizaciones";
export { default as PaginaFacturacionEjecutiva } from "./ui/ejecutivo/facturacion";

export type { AlertaResumen, Cartera, KpisPeriodo, PuntoSerie } from "./api/consultas";
