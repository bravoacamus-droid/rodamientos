"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Badge, Input } from "@rodatech/ui";

import {
  buscarParaCotizar,
  type ProductoBusqueda,
} from "../../acciones/buscar";

/**
 * Caja única de búsqueda: un término contra código, código de fabricante y
 * descripción a la vez.
 *
 * La demo hacía `.or(sku.ilike, codigo_fabricante.ilike, descripcion.ilike)`
 * y el índice trigram estaba sobre otra columna, así que era un seq scan. Aquí
 * va un solo RPC contra `busqueda`, que sí está indexada.
 */

const ESPERA_MS = 250;

export function BuscadorLineas({
  onElegir,
}: {
  onElegir: (p: ProductoBusqueda) => void;
}) {
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState<ProductoBusqueda[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const [buscando, iniciar] = useTransition();
  const contenedor = useRef<HTMLDivElement>(null);

  // Se espera a que deje de teclear: sin esto, "6205-2RS1/C3" son doce
  // consultas y once se descartan.
  useEffect(() => {
    const q = termino.trim();
    if (q.length < 2) {
      setResultados([]);
      setError(null);
      return;
    }
    const t = setTimeout(() => {
      iniciar(async () => {
        const r = await buscarParaCotizar(q);
        if (r.ok) {
          setResultados(r.datos);
          setError(r.datos.length === 0 ? "Sin resultados." : null);
          setResaltado(0);
          setAbierto(true);
        } else {
          setResultados([]);
          setError(r.error);
        }
      });
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [termino]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const elegir = (p: ProductoBusqueda) => {
    onElegir(p);
    // Se limpia para poder encadenar: cotizar es agregar muchos seguidos.
    setTermino("");
    setResultados([]);
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
        placeholder="Buscar por código, código de fabricante o descripción…"
        aria-label="Buscar producto"
        autoComplete="off"
      />

      {buscando ? (
        <span className="absolute right-3 top-2.5 text-xs text-[var(--fg-muted)]">
          buscando…
        </span>
      ) : null}

      {abierto && (resultados.length > 0 || error) ? (
        <div className="absolute z-30 mt-1.5 max-h-80 w-full overflow-y-auto overscroll-contain rounded-md border border-[var(--border-strong)] bg-[var(--surface)] elev-3">
          {error && resultados.length === 0 ? (
            <p className="p-3 text-sm text-[var(--fg-muted)]">{error}</p>
          ) : null}

          {resultados.length > 0 ? (
            <p className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
              {resultados.length} {resultados.length === 1 ? "resultado" : "resultados"} · ↑↓ para moverte, Enter para agregar
            </p>
          ) : null}

          {resultados.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => elegir(p)}
              onMouseEnter={() => setResaltado(i)}
              // 48 px de alto y el resaltado ocupando la fila entera. Antes
              // era una línea delgada donde había que acertar con el ratón:
              // fallar el clic parecía que la búsqueda no funcionaba.
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
              <Badge
                tone={
                  p.estado_stock === "sin_stock"
                    ? "danger"
                    : p.estado_stock === "bajo"
                      ? "warning"
                      : "success"
                }
                size="xs"
              >
                {p.stock ?? 0}
              </Badge>
              <span className="w-20 shrink-0 text-right tabular text-sm">
                ${p.precio_venta.toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
