"use client";
/*
 * "use client" OBLIGATORIO: TanStack Table mantiene el modelo de filas y el
 * estado de selección, y esta tabla escribe en la URL con `useRouter`.
 *
 * =========================================================================
 * DataTable del ERP Rodatech
 * =========================================================================
 * No es una tabla genérica. Está construida contra tres hechos del proyecto:
 *
 *  1. El catálogo tiene 2.000+ SKU y crece → paginación KEYSET. Los datos
 *     llegan ya paginados desde un Server Component; aquí solo se pintan.
 *  2. Filtro, orden y página viven en la URL → el estado es compartible, el
 *     botón "atrás" funciona y el servidor puede cachear por search params.
 *  3. Willy factura y aprueba seleccionando varias filas → selección múltiple
 *     con barra de acciones en lote.
 *
 * Lo que esta tabla NO hace, a propósito:
 *  · No ordena ni filtra en cliente (`manual*: true`). Ordenar 50 filas en el
 *    navegador cuando hay 2.000 en la base miente sobre el resultado.
 *  · No calcula "página 7 de 40": con keyset no existe ese número.
 */
import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "../lib/utils";
import { SkeletonTabla } from "../primitivas/skeleton";
import { EstadoError } from "../dominio/estado-error";
import { EstadoVacio } from "../dominio/estado-vacio";
import { BarraLote } from "./barra-lote";
import type { EstadoTabla } from "./tipos";
import { usarParamsTabla } from "./usar-params-tabla";

export interface DataTableProps<TDato> {
  /** Definiciones de columna. Usa las fábricas de `columnas.tsx`. */
  columnas: ColumnDef<TDato>[];
  /** Filas de la página actual, ya consultadas en el servidor. */
  datos: TDato[];
  /** Clave estable de cada fila. Es lo que se devuelve en las acciones en lote. */
  obtenerId: (fila: TDato) => string;
  /** Nombre accesible de la tabla. Obligatorio: `<table>` sin nombre no se navega. */
  etiqueta: string;

  /** `id de columna → campo de ordenación del servidor`. Ver `mapaOrden()`. */
  ordenPorColumna?: Record<string, string>;

  estado?: EstadoTabla;
  mensajeError?: string;
  /** Se muestra cuando `datos` está vacío y el estado es `listo`. */
  vacio?: { titulo: string; descripcion?: string; accion?: React.ReactNode; icono?: React.ReactNode };

  seleccionable?: boolean;
  /** Barra que aparece al seleccionar. Recibe los ids y las filas marcadas. */
  accionesLote?: (contexto: { ids: string[]; filas: TDato[]; limpiar: () => void }) => React.ReactNode;

  /** Clic en la fila (abrir el detalle). No se dispara sobre checkbox ni acciones. */
  onFilaClick?: (fila: TDato) => void;
  /** Marca visualmente la fila abierta o resaltada. */
  esFilaDestacada?: (fila: TDato) => boolean;

  /** Filtros y búsqueda: se renderizan encima de la tabla. */
  barraHerramientas?: React.ReactNode;
  /** Normalmente `<PaginacionKeyset …/>`. */
  paginacion?: React.ReactNode;

  densidad?: "compacta" | "normal";
  /** Alto máximo del cuerpo, p. ej. `"calc(100dvh - 20rem)"`. Sin esto crece. */
  altoMaximo?: string;
  filasEsqueleto?: number;
  className?: string;
}

export function DataTable<TDato>({
  columnas,
  datos,
  obtenerId,
  etiqueta,
  ordenPorColumna,
  estado = "listo",
  mensajeError,
  vacio,
  seleccionable = false,
  accionesLote,
  onFilaClick,
  esFilaDestacada,
  barraHerramientas,
  paginacion,
  densidad = "normal",
  altoMaximo,
  filasEsqueleto = 8,
  className,
}: DataTableProps<TDato>) {
  const { orden, alternarOrden, pendiente } = usarParamsTabla();
  const [seleccion, setSeleccion] = React.useState<RowSelectionState>({});

  // La selección es de la PÁGINA ACTUAL. Al cambiar de página o de filtro se
  // limpia: guardar ids de filas que ya no están cargadas haría que "facturar
  // los seleccionados" actuara sobre documentos que el operador no ve.
  const firmaPagina = React.useMemo(() => datos.map(obtenerId).join("|"), [datos, obtenerId]);
  React.useEffect(() => {
    setSeleccion({});
  }, [firmaPagina]);

  // Estado de orden traducido desde la URL al vocabulario de TanStack.
  const sorting = React.useMemo<SortingState>(() => {
    if (!orden || !ordenPorColumna) return [];
    const idColumna = Object.keys(ordenPorColumna).find((id) => ordenPorColumna[id] === orden.campo);
    return idColumna ? [{ id: idColumna, desc: orden.descendente }] : [];
  }, [orden, ordenPorColumna]);

  const tabla = useReactTable({
    data: datos,
    columns: columnas,
    getRowId: (fila) => obtenerId(fila),
    getCoreRowModel: getCoreRowModel(),
    // Todo lo pesado lo hace Postgres. Ver la cabecera del archivo.
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: seleccionable,
    state: { rowSelection: seleccion, sorting },
    onRowSelectionChange: setSeleccion,
  });

  const filasMarcadas = tabla.getSelectedRowModel().rows;
  const idsMarcados = filasMarcadas.map((f) => f.id);
  const limpiarSeleccion = React.useCallback(() => setSeleccion({}), []);

  const cargando = estado === "cargando";
  const hayError = estado === "error";
  const vacia = !cargando && !hayError && datos.length === 0;

  const paddingCelda = densidad === "compacta" ? "px-2.5 py-1.5" : "px-3 py-2.5";

  /* ------------------------------------------------------------ Estados --- */

  if (hayError) {
    return (
      <div className={cn("card elev-1 overflow-hidden", className)}>
        {barraHerramientas}
        <EstadoError descripcion={mensajeError} />
      </div>
    );
  }

  // Primera carga sin datos: esqueleto completo, no una tabla vacía que luego
  // salta de alto.
  if (cargando && datos.length === 0) {
    return (
      <div className={cn(className)}>
        {barraHerramientas}
        <SkeletonTabla filas={filasEsqueleto} columnas={Math.max(columnas.length, 3)} />
      </div>
    );
  }

  /* -------------------------------------------------------------- Tabla --- */

  return (
    <div className={cn("card elev-1 flex min-w-0 flex-col overflow-hidden", className)}>
      {barraHerramientas}

      {vacia ? (
        <EstadoVacio
          titulo={vacio?.titulo ?? "Sin resultados"}
          descripcion={vacio?.descripcion ?? "Prueba a quitar algún filtro o a cambiar el término de búsqueda."}
          icono={vacio?.icono}
          accion={vacio?.accion}
        />
      ) : (
        <>
          {/*
            El contenedor —y solo él— hace scroll horizontal. La página nunca
            se mueve de lado por muchas columnas que tenga el listado.
          */}
          <div
            className="scroll-x relative min-w-0 overflow-y-auto"
            style={altoMaximo ? { maxHeight: altoMaximo } : undefined}
          >
            <table
              aria-label={etiqueta}
              aria-busy={cargando || pendiente || undefined}
              className={cn(
                "w-full border-collapse text-sm",
                // Mientras se recarga, la tabla se atenúa y deja de aceptar
                // clics: evita que se apruebe una fila que ya cambió.
                (cargando || pendiente) && "pointer-events-none opacity-60 transition-opacity",
              )}
            >
              <colgroup>
                {tabla.getVisibleLeafColumns().map((col) => (
                  <col key={col.id} style={col.columnDef.meta?.ancho ? { width: col.columnDef.meta.ancho } : undefined} />
                ))}
              </colgroup>

              <thead>
                {tabla.getHeaderGroups().map((grupo) => (
                  <tr key={grupo.id}>
                    {grupo.headers.map((header) => {
                      const meta = header.column.columnDef.meta;
                      const campoOrden = ordenPorColumna?.[header.column.id];
                      const ordenable = header.column.getCanSort() && Boolean(campoOrden);
                      const esteOrden = sorting[0]?.id === header.column.id ? sorting[0] : undefined;
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={
                            !ordenable ? undefined : !esteOrden ? "none" : esteOrden.desc ? "descending" : "ascending"
                          }
                          className={cn(
                            "sticky top-0 z-10 border-b bg-surface-2 text-[11px] font-semibold uppercase",
                            "tracking-wide text-subtle whitespace-nowrap",
                            paddingCelda,
                            meta?.alineacion === "derecha" && "text-right",
                            meta?.alineacion === "centro" && "text-center",
                            (!meta?.alineacion || meta.alineacion === "izquierda") && "text-left",
                            meta?.fija && "left-0 z-20",
                            meta?.sinImprimir && "no-print",
                          )}
                        >
                          {header.isPlaceholder ? null : ordenable ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (campoOrden) alternarOrden(campoOrden);
                              }}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-fg",
                                meta?.alineacion === "derecha" && "flex-row-reverse",
                              )}
                              aria-label={`Ordenar por ${meta?.etiqueta ?? header.column.id}`}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {!esteOrden ? (
                                <ChevronsUpDown className="size-3 opacity-40" aria-hidden="true" />
                              ) : esteOrden.desc ? (
                                <ArrowDown className="size-3 text-brand-600" aria-hidden="true" />
                              ) : (
                                <ArrowUp className="size-3 text-brand-600" aria-hidden="true" />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>

              <tbody>
                {tabla.getRowModel().rows.map((row) => {
                  const destacada = esFilaDestacada?.(row.original) ?? false;
                  const clicable = Boolean(onFilaClick);
                  return (
                    <tr
                      key={row.id}
                      data-estado={row.getIsSelected() ? "seleccionada" : undefined}
                      aria-selected={seleccionable ? row.getIsSelected() : undefined}
                      // Fila clicable accesible: se puede tabular y activar con
                      // Enter, no solo con el ratón.
                      tabIndex={clicable ? 0 : undefined}
                      role={clicable ? "button" : undefined}
                      onClick={clicable ? () => onFilaClick?.(row.original) : undefined}
                      onKeyDown={
                        clicable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onFilaClick?.(row.original);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        // `bg-surface` explícito para que las celdas fijas
                        // (`bg-inherit`) tengan de dónde heredar y no dejen
                        // ver las filas pasando por debajo al hacer scroll.
                        "border-b border-[var(--border-soft)] bg-surface transition-colors last:border-0",
                        "hover:bg-surface-2",
                        clicable && "cursor-pointer",
                        row.getIsSelected() && "bg-brand-50 hover:bg-brand-50 dark:bg-brand-950",
                        destacada && "bg-accent-50 dark:bg-accent-900/20",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta;
                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              "align-middle",
                              paddingCelda,
                              meta?.alineacion === "derecha" && "tabular text-right",
                              meta?.alineacion === "centro" && "text-center",
                              meta?.fija && "sticky left-0 z-[1] bg-inherit",
                              meta?.sinImprimir && "no-print",
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {seleccionable && accionesLote && (
            <BarraLote cantidad={idsMarcados.length} onLimpiar={limpiarSeleccion}>
              {accionesLote({
                ids: idsMarcados,
                filas: filasMarcadas.map((f) => f.original),
                limpiar: limpiarSeleccion,
              })}
            </BarraLote>
          )}

          {paginacion}
        </>
      )}
    </div>
  );
}
