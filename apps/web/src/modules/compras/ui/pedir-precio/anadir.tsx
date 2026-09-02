"use client";

// Cliente: mantiene lo tecleado y la petición en vuelo.

import * as React from "react";
import { Input } from "@rodatech/ui";
import { Plus, Search } from "lucide-react";

import { useBusqueda } from "@/lib/usar-busqueda";
import { buscarProveedores } from "@/modules/proveedores/acciones/buscar";
import type { ProveedorParaPedir } from "@/modules/proveedores/dominio/pedir";

/**
 * Añadir a la lista un proveedor al que todavía no se le ha comprado nada.
 *
 * Sin esto la pantalla no arranca. La lista de arriba sale de
 * `proveedor_productos`, que se llena SOLA con cada compra (046) — así que el
 * primer día, con 97 proveedores cargados y cero compras hechas, no propone a
 * nadie y no hay forma de preguntarle a nadie.
 *
 * Es el problema del arranque en frío, y la salida es dejar buscar en el
 * maestro entero. Además hace falta siempre: el proveedor nuevo, el que
 * alguien recomendó, el que trae una marca que nunca se compró.
 *
 * Va contra `buscar_proveedores` (033), el mismo buscador del constructor de
 * compras: busca por RUC, por razón social y **por marca**, que es la mitad de
 * las veces que se abre esto —«¿quién me trae SKF?»—.
 */
export function AnadirProveedor({
  yaEstan,
  onAnadir,
}: {
  /** Los que ya salen arriba, para no ofrecerlos otra vez. */
  yaEstan: ReadonlySet<string>;
  onAnadir: (p: ProveedorParaPedir) => void;
}) {
  const [termino, setTermino] = React.useState("");
  const { resultados, buscando, error, limpiar } = useBusqueda({
    termino,
    buscar: buscarProveedores,
  });

  const visibles = (resultados ?? []).filter((p) => !yaEstan.has(p.id));

  return (
    <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
      <label htmlFor="anadir-proveedor" className="text-xs font-medium">
        Preguntarle a alguien más
      </label>
      <div className="relative mt-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
          aria-hidden="true"
        />
        <Input
          id="anadir-proveedor"
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          placeholder="Razón social, RUC o marca que trae…"
          className="pl-8"
          autoComplete="off"
        />
      </div>

      {error ? (
        <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>
      ) : null}

      {termino.trim().length >= 2 && !buscando && visibles.length === 0 && !error ? (
        <p className="mt-2 text-xs text-[var(--fg-subtle)]">
          Nadie con eso. Se busca por razón social, RUC o marca.
        </p>
      ) : null}

      {visibles.length > 0 ? (
        <ul className="mt-2 flex flex-col divide-y divide-[var(--border-soft)] rounded-md border border-[var(--border)]">
          {visibles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onAnadir({
                    id: p.id,
                    razon_social: p.razon_social,
                    telefono: p.telefono,
                    whatsapp: p.whatsapp,
                    email: p.email,
                    // Cero de verdad: no consta que venda nada de esta lista.
                    // Decirlo evita que se lea como una recomendación.
                    coincidencias: 0,
                    ultimoCostoUsd: null,
                  });
                  setTermino("");
                  limpiar();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <Plus className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{p.razon_social}</span>
                <span className="shrink-0 text-xs text-[var(--fg-subtle)]">
                  {p.marcas.length > 0 ? p.marcas.slice(0, 2).join(", ") : p.numero_documento ?? ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
