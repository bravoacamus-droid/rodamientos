"use client";

/*
 * Cliente: escribe los filtros en la URL conforme se usan.
 *
 * La lectura sigue pasando en el servidor. La URL es el estado, igual que en
 * productos y en cotizaciones: así un filtro se puede mandar por enlace y
 * sobrevive a recargar la página.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { campoBase } from "@rodatech/ui";

/**
 * La barra de filtros de los kits.
 *
 * Luis, 17/09: *«en el panel principal no veo ni filtro»*.
 *
 * Son tres y ni uno más: buscar por código o descripción, y dos estados que de
 * verdad cambian una decisión —cuáles se pueden armar hoy y cuáles no—. Un
 * desplegable de marca o de familia no pinta nada aquí: todos los kits están
 * en la misma familia por construcción.
 */
export function FiltrosKits({
  q,
  estado,
  archivados,
}: {
  q?: string;
  estado?: string;
  archivados: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciar] = React.useTransition();

  // Los parámetros vigentes en una ref y no en la clausura: es la corrección
  // que ya se hizo en el filtro de productos, porque un temporizador en vuelo
  // llevaba la copia vieja y borraba el filtro recién elegido.
  const vigentes = React.useRef(params);
  vigentes.current = params;

  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      // Al cambiar el criterio, seguir en la página 3 del resultado anterior
      // no significa nada.
      siguientes.delete("p");

      const query = siguientes.toString();
      iniciar(() => router.replace(query ? `${ruta}?${query}` : ruta));
    },
    [router, ruta],
  );

  const [texto, setTexto] = React.useState(q ?? "");

  // Se escribe en la URL con retardo: una navegación por tecla haría parpadear
  // la tabla entera mientras se teclea un código.
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((q ?? "") !== texto) aplicar("q", texto.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [texto, q, aplicar]);

  const hayFiltro = Boolean(q || estado || archivados);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por código o descripción…"
          aria-label="Buscar kits"
          className={`${campoBase} h-control-md pl-9 pr-3 text-sm`}
        />
      </div>

      {/*
        Los dos estados, como botones y no como desplegable.

        Son dos opciones: un desplegable obligaría a abrirlo para saber cuáles
        hay. Y se ven cuál está activo sin leer.
      */}
      <div className="flex gap-1">
        <BotonEstado activo={!estado} onClick={() => aplicar("estado", "")}>
          Todos
        </BotonEstado>
        <BotonEstado
          activo={estado === "armables"}
          onClick={() => aplicar("estado", "armables")}
        >
          Se pueden armar
        </BotonEstado>
        <BotonEstado
          activo={estado === "faltos"}
          onClick={() => aplicar("estado", "faltos")}
        >
          Falta material
        </BotonEstado>
      </div>

      <label className="flex min-h-control-md cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-[var(--surface-2)]">
        <input
          type="checkbox"
          checked={archivados}
          onChange={(e) => aplicar("archivados", e.target.checked ? "1" : "")}
          className="size-4 accent-brand-600"
        />
        Incluir los de baja
      </label>

      {hayFiltro ? (
        <button
          type="button"
          onClick={() => {
            setTexto("");
            iniciar(() => router.replace(ruta));
          }}
          className="inline-flex min-h-control-md items-center gap-1 rounded-md px-2 text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
        >
          <X className="size-4" />
          Limpiar
        </button>
      ) : null}
    </div>
  );
}

function BotonEstado({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`min-h-control-md whitespace-nowrap rounded-md border px-3 text-sm transition-colors ${
        activo
          ? "border-brand-600 bg-brand-600 font-medium text-white"
          : "border-[var(--border)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {children}
    </button>
  );
}
