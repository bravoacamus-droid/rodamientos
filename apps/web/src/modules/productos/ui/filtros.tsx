"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así un filtro se puede
// compartir por enlace y sobrevive a recargar la página.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Opcion } from "../dominio/tipos";

export function FiltrosProductosBarra({
  marcas,
  familias,
  subfamilias,
}: {
  marcas: Opcion[];
  familias: Opcion[];
  subfamilias: Opcion[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciarTransicion] = React.useTransition();

  // Los parámetros vigentes se leen de una ref y no de la clausura.
  //
  // Antes `aplicar` capturaba `params` y se recreaba con cada cambio, así que
  // un temporizador de la búsqueda que ya estaba en vuelo llevaba la copia
  // VIEJA: al dispararse reconstruía la URL sin el filtro recién elegido y lo
  // borraba solo. Con la ref, `aplicar` es estable y siempre parte del estado
  // actual, dispare cuando dispare.
  const vigentes = React.useRef(params);
  vigentes.current = params;

  /** Aplica un cambio de filtro. Siempre borra el cursor: al cambiar el
   *  criterio, seguir en la página 3 del resultado anterior no significa nada. */
  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      siguientes.delete("cursor");

      const query = siguientes.toString();
      const destino = query ? `${ruta}?${query}` : ruta;
      // Sin esto, cada render programaba una navegación al mismo sitio.
      if (destino === `${ruta}${params.toString() ? `?${params}` : ""}`) return;

      iniciarTransicion(() => {
        router.replace(destino, { scroll: false });
      });
    },
    [params, ruta, router],
  );

  const marca = params.get("marca") ?? "";
  const familia = params.get("familia") ?? "";
  const subfamilia = params.get("subfamilia") ?? "";
  const archivados = params.get("archivados") === "1";
  const hayFiltros =
    Boolean(params.get("q")) || Boolean(marca) || Boolean(familia) || Boolean(subfamilia) || archivados;

  // Al elegir una familia, la subfamilia se limita a las suyas. Sin esto se
  // podían combinar dos niveles incompatibles y la tabla salía vacía sin que
  // se entendiera por qué.
  const subfamiliasVisibles = React.useMemo(
    () =>
      familia
        ? subfamilias.filter((s) => s.familia_id === familia)
        : subfamilias,
    [familia, subfamilias],
  );

  const claseSelect =
    "h-9 min-w-0 flex-1 rounded-sm border sm:flex-none border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6"
      data-pendiente={pendiente ? "" : undefined}
    >
      <BuscadorConRetardo valorEnUrl={params.get("q") ?? ""} aplicar={aplicar} />

      <label className="sr-only" htmlFor="f-marca">
        Marca
      </label>
      <select
        id="f-marca"
        className={claseSelect}
        // Controlado por la URL, no `defaultValue`: al volver atrás en el
        // navegador o al limpiar los filtros, el desplegable tiene que
        // reflejar lo que de verdad está aplicado.
        value={marca}
        onChange={(e) => aplicar("marca", e.target.value)}
      >
        <option value="">Todas las marcas</option>
        {marcas.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombre}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="f-familia">
        Familia
      </label>
      <select
        id="f-familia"
        className={claseSelect}
        value={familia}
        onChange={(e) => {
          // Cambiar de familia invalida la subfamilia elegida.
          const siguientes = new URLSearchParams(vigentes.current.toString());
          if (e.target.value) siguientes.set("familia", e.target.value);
          else siguientes.delete("familia");
          siguientes.delete("subfamilia");
          siguientes.delete("cursor");
          const query = siguientes.toString();
          iniciarTransicion(() => {
            router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false });
          });
        }}
      >
        <option value="">Todas las familias</option>
        {familias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="f-subfamilia">
        Subfamilia
      </label>
      <select
        id="f-subfamilia"
        className={claseSelect}
        value={subfamilia}
        onChange={(e) => aplicar("subfamilia", e.target.value)}
      >
        <option value="">Todas las subfamilias</option>
        {subfamiliasVisibles.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nombre}
          </option>
        ))}
      </select>

      {hayFiltros ? (
        <button
          type="button"
          onClick={() => iniciarTransicion(() => router.replace(ruta, { scroll: false }))}
          className="h-9 rounded-sm px-2 text-sm text-[var(--fg-muted)] underline hover:text-[var(--fg)]"
        >
          Limpiar
        </button>
      ) : null}

      <label className="ml-auto flex items-center gap-2 text-sm text-[var(--fg-muted)]">
        <input
          type="checkbox"
          checked={archivados}
          onChange={(e) => aplicar("archivados", e.target.checked ? "1" : "")}
          className="size-4 accent-[var(--ring)]"
        />
        Incluir archivados
      </label>
    </div>
  );
}

/**
 * Caja de búsqueda con retardo.
 *
 * Sin él, cada tecla dispararía una consulta contra un catálogo de 2.000+ SKU.
 *
 * Recibe `aplicar` directamente en vez de un `onBuscar` en línea: una función
 * nueva en cada render hacía que el efecto se reprogramara siempre y escribiera
 * la URL sin que nadie hubiera tecleado nada.
 */
function BuscadorConRetardo({
  valorEnUrl,
  aplicar,
}: {
  valorEnUrl: string;
  aplicar: (clave: string, valor: string) => void;
}) {
  const [texto, setTexto] = React.useState(valorEnUrl);

  // Si la URL cambia por fuera —atrás del navegador, botón de limpiar— la caja
  // tiene que seguirla.
  React.useEffect(() => {
    setTexto(valorEnUrl);
  }, [valorEnUrl]);

  React.useEffect(() => {
    const limpio = texto.trim();
    // Solo se navega si de verdad cambió respecto a lo que ya está aplicado.
    if (limpio === valorEnUrl) return;
    const id = setTimeout(() => aplicar("q", limpio), 300);
    return () => clearTimeout(id);
  }, [texto, valorEnUrl, aplicar]);

  return (
    <>
      <label className="sr-only" htmlFor="f-buscar">
        Buscar producto
      </label>
      <input
        id="f-buscar"
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Código, código de fabricante o descripción…"
        className="h-9 w-full min-w-0 flex-1 rounded-sm border sm:min-w-64 border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      />
    </>
  );
}
