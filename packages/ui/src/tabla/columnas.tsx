"use client";
/*
 * "use client": las definiciones de columna llevan funciones `cell` que la
 * DataTable (cliente) ejecuta, y la columna de selección renderiza Checkbox.
 *
 * Fábricas de columnas. Existen para que ningún módulo tenga que acordarse de
 * poner `tabular` y `text-right` a mano en cada importe: una columna numérica
 * mal alineada en un listado de 50 facturas se lee mal, y eso son errores de
 * cobranza.
 */
import * as React from "react";
import type { ColumnDef, Row } from "@tanstack/react-table";

// Trae la ampliación de `ColumnMeta` (alineacion, ancho, fija…). Sin este
// import el objeto `meta` de más abajo no estaría tipado.
import "./tipos";

import { formatearFecha, formatearMoneda, formatearNumero, type CodigoMoneda } from "../lib/formato";
import { cn } from "../lib/utils";
import { Checkbox } from "../primitivas/checkbox";

/** Columna de selección múltiple. Va siempre primera y no se ordena. */
export function columnaSeleccion<TDato>(): ColumnDef<TDato> {
  return {
    id: "seleccion",
    enableSorting: false,
    enableHiding: false,
    meta: { ancho: "2.5rem", alineacion: "centro", etiqueta: "Selección", sinImprimir: true },
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
        aria-label="Seleccionar todas las filas de esta página"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(v) => row.toggleSelected(v === true)}
        aria-label="Seleccionar fila"
        // El clic en el checkbox no debe disparar el onFilaClick de la fila.
        onClick={(e) => e.stopPropagation()}
      />
    ),
  };
}

interface BaseColumna<TDato> {
  id: string;
  cabecera: string;
  /** Clave de ordenación del lado del servidor. Si falta, la columna no se ordena. */
  campoOrden?: string;
  ancho?: string;
  fija?: boolean;
  valor: (fila: TDato) => unknown;
}

/** Columna de texto. Trunca con `title` para poder leer el valor completo. */
export function columnaTexto<TDato>(
  opciones: BaseColumna<TDato> & {
    /** Segunda línea en gris (marca bajo la descripción, RUC bajo el cliente). */
    detalle?: (fila: TDato) => string | null | undefined;
    mono?: boolean;
  },
): ColumnDef<TDato> {
  const { id, cabecera, campoOrden, ancho, fija, valor, detalle, mono } = opciones;
  return {
    id,
    accessorFn: valor,
    enableSorting: Boolean(campoOrden),
    meta: { etiqueta: cabecera, alineacion: "izquierda", ancho, fija },
    header: cabecera,
    cell: ({ row }) => {
      const texto = String(valor(row.original) ?? "");
      const sub = detalle?.(row.original);
      return (
        <div className="min-w-0">
          <span className={cn("block truncate text-fg", mono && "font-mono text-xs")} title={texto}>
            {texto || "—"}
          </span>
          {sub && (
            <span className="block truncate text-xs text-subtle" title={sub}>
              {sub}
            </span>
          )}
        </div>
      );
    },
  };
}

/** Columna numérica: derecha + tabular-nums. Cantidades, pesos, stock. */
export function columnaNumero<TDato>(
  opciones: BaseColumna<TDato> & {
    decimales?: number;
    sufijo?: string;
    /** Pinta en rojo/ámbar según el valor (stock bajo mínimo, por ejemplo). */
    tono?: (fila: TDato) => "normal" | "alerta" | "critico";
  },
): ColumnDef<TDato> {
  const { id, cabecera, ancho, fija, valor, decimales = 0, sufijo, tono } = opciones;
  return {
    id,
    accessorFn: valor,
    enableSorting: Boolean(opciones.campoOrden),
    meta: { etiqueta: cabecera, alineacion: "derecha", ancho: ancho ?? "6rem", fija },
    header: cabecera,
    cell: ({ row }) => {
      const n = Number(valor(row.original) ?? 0);
      const t = tono?.(row.original) ?? "normal";
      return (
        <span
          className={cn(
            "tabular",
            t === "critico" && "font-semibold text-danger",
            t === "alerta" && "font-medium text-warn",
          )}
        >
          {formatearNumero(n, decimales)}
          {sufijo ? <span className="ml-0.5 text-xs text-subtle">{sufijo}</span> : null}
        </span>
      );
    },
  };
}

/** Columna de importe. Siempre 2 decimales, siempre a la derecha. */
export function columnaMoneda<TDato>(
  opciones: BaseColumna<TDato> & {
    moneda?: CodigoMoneda;
    /** Oculta el símbolo: útil cuando toda la tabla es de una sola moneda. */
    sinSimbolo?: boolean;
    /** Resalta el importe (total del documento). */
    fuerte?: boolean;
  },
): ColumnDef<TDato> {
  const { id, cabecera, ancho, fija, valor, moneda = "USD", sinSimbolo, fuerte } = opciones;
  return {
    id,
    accessorFn: valor,
    enableSorting: Boolean(opciones.campoOrden),
    meta: { etiqueta: cabecera, alineacion: "derecha", ancho: ancho ?? "7.5rem", fija },
    header: cabecera,
    cell: ({ row }) => {
      const n = Number(valor(row.original) ?? 0);
      return (
        <span className={cn("tabular", fuerte ? "font-semibold text-fg" : "text-fg", n < 0 && "text-danger")}>
          {formatearMoneda(n, moneda, sinSimbolo ? { sinSimbolo: true } : undefined)}
        </span>
      );
    },
  };
}

export function columnaFecha<TDato>(
  opciones: BaseColumna<TDato> & { conHora?: boolean },
): ColumnDef<TDato> {
  const { id, cabecera, ancho, fija, valor } = opciones;
  return {
    id,
    accessorFn: valor,
    enableSorting: Boolean(opciones.campoOrden),
    meta: { etiqueta: cabecera, alineacion: "izquierda", ancho: ancho ?? "6.5rem", fija },
    header: cabecera,
    cell: ({ row }) => {
      const v = valor(row.original);
      const texto = typeof v === "string" || v instanceof Date ? formatearFecha(v) : "—";
      return <span className="tabular text-fg">{texto}</span>;
    },
  };
}

/** Columna de acciones (menú "⋯"). Fija a la derecha y fuera de la impresión. */
export function columnaAcciones<TDato>(
  render: (fila: Row<TDato>) => React.ReactNode,
  ancho = "3rem",
): ColumnDef<TDato> {
  return {
    id: "acciones",
    enableSorting: false,
    enableHiding: false,
    meta: { ancho, alineacion: "derecha", etiqueta: "Acciones", sinImprimir: true },
    header: () => <span className="sr-only">Acciones</span>,
    cell: ({ row }) => (
      // El menú no debe abrir el detalle de la fila al pulsarlo.
      <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
        {render(row)}
      </div>
    ),
  };
}

/**
 * Mapa `id de columna → campo de ordenación del servidor`.
 *
 * Se pasa a `DataTable` en la prop `ordenPorColumna`. Existe porque el id de
 * la columna es cosa de la interfaz (`cliente`) y el campo por el que ordena
 * Postgres es cosa de la consulta (`clientes.razon_social`): mezclarlos
 * acopla la tabla al esquema.
 */
export function mapaOrden(columnas: readonly { id: string; campoOrden?: string }[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const c of columnas) if (c.campoOrden) mapa[c.id] = c.campoOrden;
  return mapa;
}
