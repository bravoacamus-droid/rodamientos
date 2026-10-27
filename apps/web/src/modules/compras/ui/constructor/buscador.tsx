"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button, campoBase, cn } from "@rodatech/ui";
import { Plus, Search } from "lucide-react";

import { AltaProducto } from "@/modules/cotizaciones/ui/constructor/alta-producto";

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
  recientes = [],
  etiqueta = "Productos de la compra",
}: {
  onElegir: (p: ProductoComprable) => void;
  /**
   * El título visible encima de la caja. `null` donde la pantalla ya pone el
   * suyo justo encima (la hoja de precios y el análisis de importación): dos
   * títulos seguidos para la misma caja se leen como dos cosas distintas.
   */
  etiqueta?: string | null;
  /** Último costo pagado a ESTE proveedor, por producto. */
  ultimosCostos: Record<string, { costo: number; numero: string; fecha: string }>;
  /**
   * Lo que se enseña al tocar la caja sin haber escrito nada (07/10). Luis:
   * *«cuando doy clic en el input de añadir producto, que me aparezcan los
   * cinco, seis últimos productos comprados»*.
   */
  recientes?: ProductoComprable[];
}) {
  const [termino, setTermino] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const id = useId();
  /*
    Crear el producto sin salir de la compra (14/10). Lo que se compra es justo
    lo que todavía no está en el catálogo —el repuesto nuevo, la marca que no se
    trabajaba—, y hasta hoy aquí solo salía «Sin resultados». Es el mismo
    diálogo de la cotización (Willy, 16/09: *«digito un código que no está
    creado y no me sale la opción para crearlo»*).
  */
  const [creando, setCreando] = useState<string | null>(null);

  // La espera al teclear y el DESCARTE DE RESPUESTAS TARDÍAS viven en el hook.
  // Sin lo segundo, la respuesta de «620» puede llegar después que la de
  // «6205» y pintar productos que no son los que dice la caja. Ver
  // `lib/busqueda.ts`.
  const { resultados: crudos, error, buscando, limpiar } = useBusqueda({
    termino,
    buscar: buscarParaComprar,
  });
  // Sin nada escrito, los recientes; escribiendo, lo que encuentre.
  const sinTexto = termino.trim().length < 2;
  const resultados = sinTexto ? recientes : (crudos ?? []);

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

  return (
    <div ref={contenedor} className="relative">
      {/* Etiqueta y lupa, como «Proveedor» encima (auditoría 27/10): es el
          campo principal de la pantalla y era una caja sin título, explicada
          solo por un párrafo gris debajo. Sin `flex` en la caja: la lista
          desplegable es `absolute` y en un flex se pintaría encima de la
          etiqueta. */}
      <label
        htmlFor={id}
        className={etiqueta === null ? "sr-only" : "mb-1 block text-sm font-medium"}
      >
        {etiqueta ?? "Buscar producto"}
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
          onClick={() => resultados.length > 0 && setAbierto(true)}
          onKeyDown={teclas}
          placeholder="Buscar por código, marca o descripción…"
          autoComplete="off"
          className={cn(campoBase, "h-control-md pl-9 pr-24 text-sm")}
        />
        {buscando ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--fg-muted)]">
            buscando…
          </span>
        ) : null}
      </div>

      {abierto && (resultados.length > 0 || (!sinTexto && (error || crudos?.length === 0))) ? (
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
              {sinTexto
                ? "Los últimos que compraste o preguntaste · o escribe para buscar"
                : `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"} · ↑↓ para moverte, Enter para agregar`}
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
                className={`flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 border-b sm:flex-nowrap border-[var(--border-soft)] px-3 py-2 text-left transition-colors last:border-0 ${
                  i === resaltado
                    ? "bg-brand-50 dark:bg-brand-950"
                    : "hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="shrink-0 font-mono text-sm font-semibold sm:w-40">
                  {p.codigo}
                </span>
                <span className="w-14 shrink-0 text-sm text-[var(--fg-muted)]">
                  {p.marca}
                </span>
                {/* A 390 la descripción baja a su propia línea: con los anchos
                    fijos se quedaba en 0 px (auditoría 14/10). */}
                <span className="order-last min-w-0 basis-full truncate text-sm sm:order-none sm:flex-1 sm:basis-auto">
                  {p.descripcion}
                </span>

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

                <span className="ml-auto shrink-0 text-right text-sm sm:ml-0 sm:w-28">
                  {ultimo ? (
                    <>
                      <span className="tabular block font-medium">
                        ${ultimo.costo.toFixed(4)}
                      </span>
                      <span className="block text-sm text-[var(--fg-subtle)]">
                        {ultimo.numero}
                      </span>
                    </>
                  ) : (
                    /* Mismo respaldo que la línea que se va a crear: sin
                       kardex, lo que dice la ficha. Enseñar 0.00 aquí y luego
                       rellenar 2.50 abajo sería peor que no enseñar nada. */
                    <span className="tabular text-[var(--fg-muted)]">
                      ${(p.costo_promedio || p.ultimo_costo || 0).toFixed(2)}
                    </span>
                  )}
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
            // Nace sin stock ni costo: el costo lo pone esta misma compra.
            elegir({
              id: p.id,
              codigo: p.codigo,
              descripcion: p.descripcion,
              marca: p.marca,
              unidad: p.unidad,
              stock: 0,
              costo_promedio: 0,
              ultimo_costo: 0,
              codigo_fabricante: null,
              estado_stock: "sin_stock",
            });
          }}
        />
      ) : null}
    </div>
  );
}
