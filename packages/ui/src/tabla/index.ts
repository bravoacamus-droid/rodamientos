/**
 * `@rodatech/ui/tabla`
 *
 * Subpath propio porque la tabla arrastra TanStack Table (~40 KB) y no todas
 * las pantallas la necesitan: una ficha de cotización o el panel de
 * configuración no deberían pagar ese peso solo por importar un Button.
 */

export { BarraLote } from "./barra-lote";
export { BarraHerramientas, BotonLimpiarFiltros, BuscadorTabla, FiltroSelect } from "./barra-herramientas";
export {
  columnaAcciones,
  columnaFecha,
  columnaMoneda,
  columnaNumero,
  columnaSeleccion,
  columnaTexto,
  mapaOrden,
} from "./columnas";
export { DataTable, type DataTableProps } from "./data-table";
export {
  escribirOrden,
  leerOrden,
  PARAMS,
  type Direccion,
  type EstadoTabla,
  type OrdenTabla,
  type PaginaKeyset,
} from "./tipos";
export { useParamsTabla, type ParamsTabla } from "./use-params-tabla";

/** Re-export de lo que hace falta para tipar columnas sin depender de TanStack. */
export type { ColumnDef, Row, Table as TablaTanStack } from "@tanstack/react-table";

/** La paginación vive en `dominio/` porque también se usa fuera de la tabla. */
export { PaginacionKeyset, type PaginacionKeysetProps } from "../dominio/paginacion-keyset";
