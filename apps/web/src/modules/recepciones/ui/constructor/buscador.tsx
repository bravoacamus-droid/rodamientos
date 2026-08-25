"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Badge, Input } from "@rodatech/ui";

import {
  buscarParaRecibir,
  type ProductoRecepcionable,
} from "../../acciones/buscar";

/**
 * Caja de búsqueda del registro de recepción.
 *
 * Misma mecánica que la del constructor de cotizaciones —un solo RPC contra la
 * columna `busqueda`, que sí está indexada— con dos diferencias:
 *
 *  · Enseña el STOCK ACTUAL y el COSTO PROMEDIO, no el precio de venta. Al
 *    recibir, lo que se está comparando es contra la factura del proveedor.
 *  · No esconde lo que está sin stock: es justo lo que se viene a reponer.
 */

const ESPERA_MS = 250;

export function BuscadorRecepcion({
  onElegir,
  yaEnDocumento,
}: {
  onElegir: (p: ProductoRecepcionable) => void;
  yaEnDocumento: readonly string[];
}) {
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState<ProductoRecepcionable[]>([]);
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
        const r = await buscarParaRecibir(q);
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

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const elegir = (p: ProductoRecepcionable) => {
    onElegir(p);
    // Se limpia para poder encadenar: descargar un pedido es agregar muchos
    // seguidos, sin soltar el teclado.
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

  const dentro = new Set(yaEnDocumento);

  return (
    <div ref={contenedor} className="relative">
      <Input
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        onKeyDown={teclas}
        placeholder="Buscar por código, marca, código de fabricante o descripción…"
        aria-label="Buscar producto para recibir"
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
            <p className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-[0.7rem] text-[var(--fg-muted)]">
              {resultados.length} {resultados.length === 1 ? "resultado" : "resultados"} · ↑↓ para moverte, Enter para agregar
            </p>
          ) : null}

          {resultados.map((p, i) => {
            const repetido = dentro.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => elegir(p)}
                onMouseEnter={() => setResaltado(i)}
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

                {/* Elegirlo otra vez SUMA a la línea que ya está, no duplica.
                    Se avisa para que nadie crea que el clic no hizo nada. */}
                {repetido ? (
                  <Badge tone="neutral" size="xs">
                    ya está · suma
                  </Badge>
                ) : null}

                <span className="w-20 shrink-0 text-right text-xs text-[var(--fg-muted)]">
                  stock {p.stock ?? 0}
                </span>
                <span className="w-20 shrink-0 text-right tabular text-sm">
                  ${(p.costo_promedio ?? 0).toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
