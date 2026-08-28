"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Input } from "@rodatech/ui";

import { useBusqueda } from "@/lib/usar-busqueda";

import { buscarParaComprar, type ProductoComprable } from "../../acciones/buscar";

/**
 * Caja única de búsqueda: un término contra código, código de fabricante,
 * descripción y marca a la vez.
 *
 * Va contra `buscar_productos`, que desde la migración 014 también mira la
 * marca. NO se filtra por stock: lo que se compra es justo lo que falta.
 */

export function BuscadorCompra({
  onElegir,
  ultimosCostos,
}: {
  onElegir: (p: ProductoComprable) => void;
  /** Último costo pagado a ESTE proveedor, por producto. */
  ultimosCostos: Record<string, { costo: number; numero: string; fecha: string }>;
}) {
  const [termino, setTermino] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  // La espera al teclear y el DESCARTE DE RESPUESTAS TARDÍAS viven en el hook.
  // Sin lo segundo, la respuesta de «620» puede llegar después que la de
  // «6205» y pintar productos que no son los que dice la caja. Ver
  // `lib/busqueda.ts`.
  const { resultados: crudos, error, buscando, limpiar } = useBusqueda({
    termino,
    buscar: buscarParaComprar,
  });
  const resultados = crudos ?? [];

  // Resultados nuevos: el resaltado vuelve arriba y se abre la lista.
  useEffect(() => {
    setResaltado(0);
    if (crudos !== null) setAbierto(true);
  }, [crudos]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const elegir = (p: ProductoComprable) => {
    onElegir(p);
    // Se limpia para poder encadenar: una compra es agregar muchos seguidos.
    setTermino("");
    limpiar();
    setAbierto(false);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (!abierto || resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = resultados[resaltado];
      if (p) elegir(p);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  return (
    <div ref={contenedor} className="relative">
      <Input
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        onKeyDown={teclas}
        placeholder="Buscar por código, marca o descripción…"
        aria-label="Buscar producto para comprar"
        autoComplete="off"
      />

      {buscando ? (
        <span className="absolute right-3 top-2.5 text-xs text-[var(--fg-muted)]">
          buscando…
        </span>
      ) : null}

      {abierto && (resultados.length > 0 || error || crudos?.length === 0) ? (
        <div className="absolute z-30 mt-1.5 max-h-80 w-full overflow-y-auto overscroll-contain rounded-md border border-[var(--border-strong)] bg-[var(--surface)] elev-3">
          {resultados.length === 0 ? (
            <p className="p-3 text-sm text-[var(--fg-muted)]">
              {error ?? "Sin resultados."}
            </p>
          ) : null}

          {resultados.length > 0 ? (
            <p className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
              {resultados.length} {resultados.length === 1 ? "resultado" : "resultados"} · ↑↓ para moverte, Enter para agregar
            </p>
          ) : null}

          {resultados.map((p, i) => {
            const ultimo = ultimosCostos[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => elegir(p)}
                onMouseEnter={() => setResaltado(i)}
                // 48 px de alto y el resaltado ocupando la fila entera: fallar
                // el clic parece que la búsqueda no funciona.
                className={`flex min-h-12 w-full items-center gap-3 border-b border-[var(--border-soft)] px-3 py-2 text-left transition-colors last:border-0 ${
                  i === resaltado
                    ? "bg-brand-50 dark:bg-brand-950"
                    : "hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="w-40 shrink-0 font-mono text-[0.8rem] font-semibold">
                  {p.codigo}
                </span>
                <span className="w-14 shrink-0 text-xs text-[var(--fg-muted)]">
                  {p.marca}
                </span>
                <span className="flex-1 truncate text-sm">{p.descripcion}</span>

                {/* En una compra lo que importa no es cuánto hay, sino si
                    falta: el stock se enseña contra su mínimo. */}
                <Badge
                  tone={
                    (p.stock ?? 0) <= 0
                      ? "danger"
                      : p.estado_stock === "bajo"
                        ? "warning"
                        : "neutral"
                  }
                  size="xs"
                >
                  {p.stock ?? 0}
                </Badge>

                <span className="w-28 shrink-0 text-right text-xs">
                  {ultimo ? (
                    <>
                      <span className="tabular block font-medium">
                        ${ultimo.costo.toFixed(4)}
                      </span>
                      <span className="block text-xs text-[var(--fg-subtle)]">
                        {ultimo.numero}
                      </span>
                    </>
                  ) : (
                    <span className="tabular text-[var(--fg-muted)]">
                      ${(p.costo_promedio ?? 0).toFixed(2)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
