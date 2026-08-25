"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así un kardex filtrado se
// puede mandar por enlace y sobrevive a recargar la página.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, SelectNativo } from "@rodatech/ui";

import { ETIQUETA_MOVIMIENTO } from "../dominio/tipos";

/** De dónde puede venir un movimiento. Espeja `referencia_tipo` del kardex. */
const ORIGENES = [
  { valor: "recepcion", etiqueta: "Recepción" },
  { valor: "comprobante", etiqueta: "Comprobante" },
  { valor: "guia", etiqueta: "Guía" },
  { valor: "ajuste", etiqueta: "Ajuste" },
  { valor: "compra", etiqueta: "Compra" },
  { valor: "importacion", etiqueta: "Carga inicial" },
] as const;

export function FiltrosKardexBarra({
  productoActivo,
}: {
  /** Código del producto al que está filtrado, si lo está. */
  productoActivo: string | null;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciarTransicion] = React.useTransition();

  const vigentes = React.useRef(params);
  vigentes.current = params;

  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      // Al cambiar el criterio, seguir en la página 3 del resultado anterior
      // no significa nada.
      siguientes.delete("cursor");

      const query = siguientes.toString();
      iniciarTransicion(() =>
        router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false }),
      );
    },
    [ruta, router],
  );

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
      {/* El filtro por producto no es un desplegable: con 2.000+ SKU no cabe.
          Se llega a él desde el catálogo o pinchando un código en la tabla, y
          aquí solo se enseña cuál está puesto y cómo quitarlo. */}
      {productoActivo ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--fg-muted)]">Producto</span>
          <button
            type="button"
            onClick={() => aplicar("producto", "")}
            className="inline-flex h-control-md items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--surface-2)]"
          >
            <span className="font-mono">{productoActivo}</span>
            <span aria-hidden="true">×</span>
            <span className="sr-only">Quitar el filtro de producto</span>
          </button>
        </div>
      ) : null}

      <label className="flex min-w-40 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Movimiento</span>
        <SelectNativo
          value={params.get("tipo") ?? ""}
          onChange={(e) => aplicar("tipo", e.target.value)}
        >
          <option value="">Todos</option>
          {Object.entries(ETIQUETA_MOVIMIENTO).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </SelectNativo>
      </label>

      <label className="flex min-w-40 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Origen</span>
        <SelectNativo
          value={params.get("referencia") ?? ""}
          onChange={(e) => aplicar("referencia", e.target.value)}
        >
          <option value="">Todos</option>
          {ORIGENES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </SelectNativo>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Desde</span>
        <Input
          type="date"
          value={params.get("desde") ?? ""}
          onChange={(e) => aplicar("desde", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Hasta</span>
        <Input
          type="date"
          value={params.get("hasta") ?? ""}
          onChange={(e) => aplicar("hasta", e.target.value)}
        />
      </label>
    </div>
  );
}
