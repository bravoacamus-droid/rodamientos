"use client";
/*
 * "use client" OBLIGATORIO: mantiene el término tecleado, la petición en vuelo
 * y el panel de resultados abierto.
 *
 * =========================================================================
 * BuscadorProductos — el control más usado del ERP
 * =========================================================================
 * Se usa en el constructor de cotizaciones, en la compra, en la recepción de
 * mercadería, en el movimiento de inventario y en la guía de remisión. Si
 * este componente es lento o miente, todo el sistema se siente lento.
 *
 * Decisiones que lo diferencian de un combobox normal:
 *
 *  · ASÍNCRONO CONTRA EL SERVIDOR. Con 2.000+ SKU no se precarga el catálogo
 *    en el navegador. `buscar` es una Server Action que ataca el RPC
 *    `buscar_productos` (índice trigram sobre la columna `busqueda`).
 *
 *  · `shouldFilter={false}` en cmdk. El servidor ya decidió qué es relevante;
 *    volver a filtrar en cliente descartaría un SKU encontrado por su código
 *    de fabricante, que es justo como busca Willy.
 *
 *  · RESPUESTAS TARDÍAS DESCARTADAS. Cada petición lleva número de orden y su
 *    AbortController: si la de "620" vuelve después que la de "6205", se
 *    ignora. Sin esto el operador ve resultados que no corresponden a lo que
 *    tiene escrito, y agrega la línea equivocada.
 *
 *  · MUESTRA EL STOCK EN LA LISTA, con color de estado. Preguntar "¿tengo?"
 *    antes de cotizar es el gesto que más se repite.
 *
 *  · `limpiarAlSeleccionar` (por defecto): al elegir un producto el campo se
 *    vacía y conserva el foco, para encadenar líneas sin tocar el ratón.
 *
 *  · NO permite crear productos sobre la marcha. Willy pidió explícitamente
 *    que el alta se haga desde el maestro (reunión 10:44). `onIrAlMaestro`
 *    solo ofrece el enlace cuando la búsqueda no encuentra nada.
 *
 * NOTA DE MONTAJE: el panel de resultados se posiciona en el flujo del
 * documento (`absolute`), NO en un portal. Es lo que permite que cmdk gobierne
 * el teclado mientras el foco sigue en el campo. A cambio, el contenedor que
 * lo envuelve no puede tener `overflow: hidden`; si la fila del constructor lo
 * necesita, usa `overflow-visible` en el ancestro inmediato.
 */
import * as React from "react";
import { AlertCircle, Loader2, PackageSearch, Plus, Search } from "lucide-react";

import { formatearMoneda, formatearNumero, type CodigoMoneda } from "../lib/formato";
import { cn } from "../lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../primitivas/command";

/** Forma mínima que debe devolver la consulta del catálogo. */
export interface ProductoBuscado {
  id: string;
  /** Código único, sin espacios (regla del maestro). */
  sku: string;
  descripcion: string;
  /** Marca en campo propio, nunca embebida en la descripción (corrección C2). */
  marca?: string | null;
  /** Abreviatura de la unidad: und, m, caja, kit. */
  unidad?: string | null;
  stock?: number | null;
  stockMinimo?: number | null;
  /** Precio referencial (promedio) del producto. */
  precio?: number | null;
  archivado?: boolean;
}

export interface BuscadorProductosProps {
  id: string;
  /**
   * Consulta al catálogo. Debe ser ESTABLE entre renders: una Server Action lo
   * es; una función anónima creada en el render NO — envuélvela en
   * `useCallback` o el buscador relanzará la consulta sin motivo.
   */
  buscar: (termino: string, senal: AbortSignal) => Promise<ProductoBuscado[]>;
  onSeleccionar: (producto: ProductoBuscado) => void;
  /** Productos ya añadidos al documento: se muestran atenuados y no se eligen. */
  excluirIds?: readonly string[];
  /** Mínimo de caracteres antes de consultar. 2 evita barrer el catálogo entero. */
  minimoCaracteres?: number;
  /** Milisegundos de espera tras dejar de teclear. */
  retardo?: number;
  placeholder?: string;
  moneda?: CodigoMoneda;
  autoFocus?: boolean;
  deshabilitado?: boolean;
  limpiarAlSeleccionar?: boolean;
  /** Enlace al maestro de productos cuando la búsqueda no encuentra nada. */
  onIrAlMaestro?: (termino: string) => void;
  className?: string;
}

export function BuscadorProductos({
  id,
  buscar,
  onSeleccionar,
  excluirIds,
  minimoCaracteres = 2,
  retardo = 250,
  placeholder = "Buscar por código, marca o descripción…",
  moneda = "USD",
  autoFocus,
  deshabilitado,
  limpiarAlSeleccionar = true,
  onIrAlMaestro,
  className,
}: BuscadorProductosProps) {
  const [termino, setTermino] = React.useState("");
  const [abierto, setAbierto] = React.useState(false);
  const [resultados, setResultados] = React.useState<ProductoBuscado[]>([]);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const numeroPeticion = React.useRef(0);
  const abortador = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const excluidos = React.useMemo(() => new Set(excluirIds ?? []), [excluirIds]);
  const consultable = termino.trim().length >= minimoCaracteres;

  React.useEffect(() => {
    const t = termino.trim();
    if (t.length < minimoCaracteres) {
      setResultados([]);
      setCargando(false);
      setError(null);
      return;
    }

    const propia = ++numeroPeticion.current;
    setCargando(true);
    setError(null);

    const temporizador = setTimeout(() => {
      abortador.current?.abort();
      const controlador = new AbortController();
      abortador.current = controlador;

      void buscar(t, controlador.signal)
        .then((lista) => {
          // Respuesta tardía de un término que ya no está escrito: se descarta.
          if (propia !== numeroPeticion.current) return;
          setResultados(lista);
          setCargando(false);
        })
        .catch((e: unknown) => {
          if (controlador.signal.aborted || propia !== numeroPeticion.current) return;
          setResultados([]);
          setError(e instanceof Error ? e.message : "No se pudo consultar el catálogo.");
          setCargando(false);
        });
    }, retardo);

    return () => clearTimeout(temporizador);
  }, [termino, minimoCaracteres, retardo, buscar]);

  // Al desmontar, corta lo que quede en vuelo.
  React.useEffect(() => () => abortador.current?.abort(), []);

  const elegir = (producto: ProductoBuscado) => {
    if (excluidos.has(producto.id)) return;
    onSeleccionar(producto);
    if (limpiarAlSeleccionar) {
      setTermino("");
      setResultados([]);
      setAbierto(false);
      // El foco se queda en el campo para encadenar la siguiente línea.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setAbierto(false);
    }
  };

  const mostrarPanel = abierto && consultable;

  return (
    <Command
      shouldFilter={false}
      loop
      label="Buscar productos en el catálogo"
      className={cn("relative overflow-visible bg-transparent", className)}
      // El panel se cierra cuando el foco sale del conjunto campo + lista.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setAbierto(false);
        }
      }}
    >
      <CommandInput
        ref={inputRef}
        id={id}
        value={termino}
        onValueChange={(v) => {
          setTermino(v);
          setAbierto(v.trim().length >= minimoCaracteres);
        }}
        onFocus={() => {
          if (consultable) setAbierto(true);
        }}
        placeholder={placeholder}
        disabled={deshabilitado}
        autoFocus={autoFocus}
        contenedorClassName={cn(
          "h-control-md rounded-md border bg-surface px-3",
          "focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-600/15",
          deshabilitado && "bg-surface-2 opacity-60",
        )}
        className="h-full text-sm"
        icono={<Search className="size-4 shrink-0 text-subtle" aria-hidden="true" />}
        sufijo={cargando ? <Loader2 className="size-4 shrink-0 animate-spin text-subtle" aria-hidden="true" /> : null}
      />

      {/* Estado para lectores de pantalla: cuántos resultados hay, sin robar foco. */}
      <span className="sr-only" role="status" aria-live="polite">
        {!consultable
          ? ""
          : cargando
            ? "Buscando en el catálogo"
            : error
              ? "Error al consultar el catálogo"
              : `${resultados.length} resultados`}
      </span>

      {mostrarPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 min-w-[22rem] overflow-hidden rounded-lg border bg-surface elev-3 anim-pop-in">
          <CommandList>
            {error ? (
              <div className="flex items-start gap-2 px-3 py-6 text-left">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                <div>
                  <p className="text-xs font-medium text-fg">No se pudo consultar el catálogo</p>
                  <p className="mt-0.5 text-xs text-muted">{error}</p>
                </div>
              </div>
            ) : cargando && resultados.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted">Buscando…</div>
            ) : resultados.length === 0 ? (
              <CommandEmpty>
                <PackageSearch className="mx-auto mb-2 size-5 text-subtle" aria-hidden="true" />
                <p className="text-xs font-medium text-fg">Ningún producto coincide con «{termino.trim()}»</p>
                <p className="mt-0.5 text-xs text-muted">
                  Revisa el código: el maestro no admite espacios en el SKU.
                </p>
                {onIrAlMaestro && (
                  <button
                    type="button"
                    onClick={() => onIrAlMaestro(termino.trim())}
                    className="mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-surface-2"
                  >
                    <Plus className="size-3" />
                    Darlo de alta en el maestro de productos
                  </button>
                )}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {resultados.map((p) => {
                  const yaEsta = excluidos.has(p.id);
                  const stock = p.stock ?? null;
                  const minimo = p.stockMinimo ?? 0;
                  const tonoStock =
                    stock === null
                      ? "text-subtle"
                      : stock <= 0
                        ? "text-danger"
                        : stock <= minimo
                          ? "text-warn"
                          : "text-ok";
                  return (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      disabled={yaEsta}
                      onSelect={() => elegir(p)}
                      className="items-start gap-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs font-medium text-fg">{p.sku}</span>
                          {p.marca && <span className="truncate text-xs text-muted">{p.marca}</span>}
                          {p.archivado && (
                            <span className="rounded-full bg-surface-2 px-1.5 text-xs text-subtle">archivado</span>
                          )}
                          {yaEsta && (
                            <span className="rounded-full bg-surface-2 px-1.5 text-xs text-subtle">
                              ya está en el documento
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted" title={p.descripcion}>
                          {p.descripcion}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        {p.precio !== null && p.precio !== undefined && (
                          <span className="tabular block text-xs font-medium text-fg">
                            {formatearMoneda(p.precio, moneda)}
                          </span>
                        )}
                        <span className={cn("tabular block text-xs", tonoStock)}>
                          {stock === null ? "sin dato" : `${formatearNumero(stock, 0)} ${p.unidad ?? "und"}`}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </div>
      )}
    </Command>
  );
}
