"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Search, X } from "lucide-react";
import { Combobox, Input, SelectNativo, type OpcionCombobox } from "@rodatech/ui";

import { useParamsVigentes } from "@/lib/use-filtros-url";

const ESPERA_MS = 300;

/**
 * Lo que comparten las barras: escribir un filtro en la URL partiendo del
 * último pedido (07/10, la carrera de filtros) y la caja de buscar con su
 * espera de 300 ms. Estaba copiado en cada barra.
 */
export function useBarraFiltros() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciar] = React.useTransition();
  const vigentes = useParamsVigentes();

  // Varios a la vez: «Mostrar: todos» toca dos claves, y dos navegaciones
  // seguidas se pisarían.
  const aplicarVarios = React.useCallback(
    (cambios: Record<string, string>) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor) siguientes.set(clave, valor);
        else siguientes.delete(clave);
      }
      // Con otro criterio, la página en la que se estaba deja de valer.
      siguientes.delete("cursor");
      siguientes.delete("dir");
      const query = siguientes.toString();
      vigentes.current = siguientes;
      iniciar(() => router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false }));
    },
    [ruta, router, vigentes],
  );
  const aplicar = React.useCallback(
    (clave: string, valor: string) => aplicarVarios({ [clave]: valor }),
    [aplicarVarios],
  );

  const [texto, setTexto] = React.useState(params.get("q") ?? "");
  React.useEffect(() => {
    if (texto === (vigentes.current.get("q") ?? "")) return;
    const t = setTimeout(() => aplicar("q", texto.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto, aplicar, vigentes]);

  /** Quita todos los filtros y deja solo cuántas filas se ven. */
  const limpiar = React.useCallback(() => {
    const n = vigentes.current.get("n");
    const siguientes = new URLSearchParams(n ? { n } : {});
    vigentes.current = siguientes;
    setTexto("");
    iniciar(() => router.replace(n ? `${ruta}?n=${n}` : ruta, { scroll: false }));
  }, [ruta, router, vigentes]);

  return { valor: (clave: string) => params.get(clave) ?? "", aplicar, aplicarVarios, limpiar, texto, setTexto };
}

/**
 * Las piezas de una barra de filtros (12/10).
 *
 * Luis, mirando otro sistema: *«¿por qué los filtros con botones y no más
 * podemos por select, así desplegable? Porque se ve feo»*. En cotizaciones el
 * estado eran seis botones sueltos y el periodo cinco más, cada filtro con su
 * etiqueta encima: media pantalla antes del primer documento.
 *
 * Así que una fila: la caja de buscar y desplegables del mismo alto, cada uno
 * con su icono y diciendo dentro qué filtra («Estado: todos»). Sin
 * etiqueta encima — el icono y el texto ya lo dicen —, pero con `aria-label`.
 *
 * Un desplegable con algo elegido se pinta en azul: con cinco filtros en
 * fila, lo que importa es ver de un vistazo cuáles están puestos.
 */

export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
}

export function FiltroDesplegable({
  icono: Icono,
  etiqueta,
  todos,
  valor,
  opciones,
  onCambiar,
}: {
  icono: LucideIcon;
  /** Para el lector de pantalla: «Estado», «Serie»… */
  etiqueta: string;
  /** La primera opción, la de no filtrar: «Todos los estados». */
  todos: string;
  valor: string;
  opciones: readonly OpcionFiltro[];
  onCambiar: (valor: string) => void;
}) {
  const puesto = valor !== "";
  return (
    <div className="relative min-w-0 flex-[1_1_9.5rem]">
      <Icono
        className={`pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 ${puesto ? "text-brand-600" : "text-[var(--fg-subtle)]"}`}
        aria-hidden="true"
      />
      <SelectNativo
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        className={`w-full pl-9 ${puesto ? "border-brand-300 bg-brand-50 font-medium dark:bg-brand-950" : ""}`}
      >
        <option value="">{todos}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </SelectNativo>
    </div>
  );
}

/** La caja de buscar de la barra: la más ancha de la fila. */
export function CajaBuscar({
  valor,
  onCambiar,
  placeholder,
  etiqueta,
}: {
  valor: string;
  onCambiar: (v: string) => void;
  placeholder: string;
  etiqueta: string;
}) {
  return (
    <div className="relative min-w-0 flex-[2_1_14rem]">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta}
        autoComplete="off"
        className="w-full pl-9"
      />
    </div>
  );
}

/** La fila: se reparte el ancho y baja de línea sola en el teléfono. */
export function FilaFiltros({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/**
 * Un filtro con buscador dentro (proveedor, marca, usuario…): cuando la lista
 * es larga, un desplegable normal obliga a bajar por cien nombres.
 */
export function FiltroBuscable({
  id,
  etiqueta,
  todos,
  buscar,
  valor,
  opciones,
  onCambiar,
}: {
  id: string;
  etiqueta: string;
  todos: string;
  buscar: string;
  valor: string;
  opciones: readonly OpcionCombobox[];
  onCambiar: (valor: string) => void;
}) {
  return (
    <div className="min-w-0 flex-[1.5_1_12rem]">
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <Combobox
        id={id}
        opciones={opciones}
        valor={valor || null}
        onCambio={(v) => onCambiar(v ?? "")}
        placeholder={todos}
        placeholderBusqueda={buscar}
        className={
          valor
            ? "[&>button:first-of-type]:border-brand-300 [&>button:first-of-type]:bg-brand-50 [&>button:first-of-type]:font-medium"
            : undefined
        }
      />
    </div>
  );
}

/** «Limpiar», solo cuando hay algo que limpiar. */
export function LimpiarFiltros({ visible, onLimpiar }: { visible: boolean; onLimpiar: () => void }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onLimpiar}
      className="inline-flex h-control-md shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]"
    >
      <X className="size-4" aria-hidden="true" />
      Limpiar
    </button>
  );
}
