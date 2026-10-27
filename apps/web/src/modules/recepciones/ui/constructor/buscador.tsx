"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button, campoBase, cn } from "@rodatech/ui";
import { Plus, Search } from "lucide-react";

import { AltaProducto } from "@/modules/cotizaciones/ui/constructor/alta-producto";

import { useBusqueda } from "@/lib/usar-busqueda";

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

export function BuscadorRecepcion({
  onElegir,
  yaEnDocumento,
}: {
  onElegir: (p: ProductoRecepcionable) => void;
  yaEnDocumento: readonly string[];
}) {
  const [termino, setTermino] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const id = useId();
  /*
    Dar de alta el producto sin salir de la recepción (auditoría 27/10), como
    ya hace la compra. Si llega mercadería que no está en el maestro, hasta hoy
    había que salir a /productos/nuevo y perder lo apuntado.
  */
  const [creando, setCreando] = useState<string | null>(null);

  // La espera al teclear y el DESCARTE DE RESPUESTAS TARDÍAS viven en el hook.
  // Sin lo segundo, la respuesta de «620» puede llegar después que la de
  // «6205» y pintar productos que no son los que dice la caja. Ver
  // `lib/busqueda.ts`.
  const { resultados: crudos, error, buscando, limpiar } = useBusqueda({
    termino,
    buscar: buscarParaRecibir,
  });
  const resultados = crudos ?? [];

  // Resultados nuevos: el resaltado vuelve arriba y se abre la lista.
  useEffect(() => {
    setResaltado(0);
    if (crudos !== null) setAbierto(true);
  }, [crudos]);


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
    limpiar();
    setAbierto(false);
  };

  const teclas = (e: React.KeyboardEvent) => {
    // Enter NUNCA llega al <form>: con la lista cerrada o todavía
    // «buscando…», un Enter aquí enviaba el formulario entero y GUARDABA.
    // Visto rellenando a 390 en la revisión por módulos del 02/10 (el mismo
    // fallo que guardó dos cotizaciones en ventas).
    if (e.key === "Enter") e.preventDefault();
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
      {/* Etiqueta y lupa, como en la compra (auditoría 27/10). Sin `flex` en
          la caja: la lista es `absolute` y en un flex taparía la etiqueta. */}
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        Productos que llegan
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
          aria-hidden="true"
        />
        <input
          id={id}
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          onFocus={() => resultados.length > 0 && setAbierto(true)}
          onKeyDown={teclas}
          // Se cortaba a 390 px (revisión por módulos del 02/10).
          placeholder="Buscar por código o descripción…"
          autoComplete="off"
          className={cn(campoBase, "h-control-md pl-9 pr-24 text-sm")}
        />
        {buscando ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--fg-muted)]">
            buscando…
          </span>
        ) : null}
      </div>

      {abierto && (resultados.length > 0 || error || crudos?.length === 0) ? (
        <div className="absolute z-30 mt-1.5 max-h-80 w-full overflow-y-auto overscroll-contain rounded-md border border-[var(--border-strong)] bg-[var(--surface)] elev-3">
          {resultados.length === 0 ? (
            <div className="flex flex-col items-start gap-2 p-3">
              <p className="text-sm text-[var(--fg-muted)]">
                {error ?? `Ningún producto coincide con «${termino.trim()}».`}
              </p>
              {error ? null : (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setCreando(termino.trim());
                    setAbierto(false);
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Crear el producto «{termino.trim()}»
                </Button>
              )}
            </div>
          ) : null}

          {resultados.length > 0 ? (
            <p className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--fg-muted)]">
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
                <span className="w-40 shrink-0 font-mono text-sm font-semibold">
                  {p.codigo}
                </span>
                <span className="w-14 shrink-0 text-sm text-[var(--fg-muted)]">
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

                <span className="w-20 shrink-0 text-right text-sm text-[var(--fg-muted)]">
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

      {creando !== null ? (
        <AltaProducto
          codigoInicial={creando}
          onCerrar={() => setCreando(null)}
          onCreado={(p) => {
            setCreando(null);
            // Nace sin stock y sin costo: el costo lo pone esta recepción, con
            // lo que diga la factura del proveedor.
            elegir({
              id: p.id,
              codigo: p.codigo,
              descripcion: p.descripcion,
              marca: p.marca,
              unidad: p.unidad,
              stock: 0,
              costo_promedio: undefined,
              codigo_fabricante: null,
              estado_stock: "sin_stock",
            });
          }}
        />
      ) : null}
    </div>
  );
}
