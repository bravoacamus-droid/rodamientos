"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { Input, SelectNativo } from "@rodatech/ui";

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

  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      // Con otro criterio, la página en la que se estaba deja de valer.
      siguientes.delete("cursor");
      siguientes.delete("dir");
      const query = siguientes.toString();
      vigentes.current = siguientes;
      iniciar(() => router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false }));
    },
    [ruta, router, vigentes],
  );

  const [texto, setTexto] = React.useState(params.get("q") ?? "");
  React.useEffect(() => {
    if (texto === (vigentes.current.get("q") ?? "")) return;
    const t = setTimeout(() => aplicar("q", texto.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto, aplicar, vigentes]);

  return { valor: (clave: string) => params.get(clave) ?? "", aplicar, texto, setTexto };
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
