/**
 * Componentes de dominio del ERP.
 *
 * Aquí SÍ va el español: `Moneda`, `EstadoBadge`, `BuscadorProductos` son
 * conceptos del negocio de Rodatech, no primitivas de interfaz. Si un
 * componente de esta carpeta se pudiera reutilizar tal cual en otro producto,
 * probablemente esté en la carpeta equivocada.
 */

export { BotonReintentar } from "./boton-reintentar";
export { CifraAnimada } from "./cifra-animada";
export { BuscadorProductos, type BuscadorProductosProps, type ProductoBuscado } from "./buscador-productos";
export { EstadoBadge, etiquetaEstado, type EstadoBadgeProps, type EstadoDocumento } from "./estado-badge";
export { EstadoError } from "./estado-error";
export { EstadoVacio } from "./estado-vacio";
export { KpiCard, type KpiCardProps } from "./kpi-card";
export { Moneda, type MonedaProps } from "./moneda";
export { PaginacionKeyset, type PaginacionKeysetProps } from "./paginacion-keyset";
/* El tamaño de página se lee en el SERVIDOR —de la URL— y se pinta en el
   cliente, así que sale por el índice principal y no solo por `/tabla`, que
   arrastra TanStack. */
export { TAMANOS_PAGINA, TAMANO_POR_DEFECTO, leerTamano } from "../tabla/tipos";
