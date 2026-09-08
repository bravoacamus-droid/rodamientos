"use client";

/**
 * La caja de buscar.
 *
 * ---------------------------------------------------------------------------
 * Otra vez lo mismo: la pieza estaba, el camino no
 * ---------------------------------------------------------------------------
 * `listarCotizaciones` acepta `q`, `desde` y `hasta` desde el primer día, y la
 * página los leía de la URL. Lo que no había era **dónde escribirlos**: para
 * buscar una cotización había que teclear `?q=` en la barra del navegador.
 *
 * Es el séptimo caso del patrón que documenta CLAUDE.md, y el más caro de los
 * siete: con 97 clientes y las cotizaciones creciendo, encontrar «la de ACEROS
 * CHILCA» era bajar por la lista con la rueda del ratón.
 *
 * La URL sigue siendo el estado —se comparte por enlace y sobrevive a una
 * recarga—; esto solo la escribe.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Lo que se tarda en escribir el resto de la palabra.
 *
 * Sin espera, «CHILCA» son seis consultas y cinco listas que parpadean. Con
 * más de medio segundo se siente roto. 300 ms es el mismo valor que usa la
 * barra de compras, y las dos pantallas tienen que sentirse igual.
 */
const ESPERA_MS = 300;

export function BuscadorCotizaciones() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  const [texto, setTexto] = React.useState(params.get("q") ?? "");

  /*
    Los parámetros vigentes se leen de una ref, no de la clausura.

    Es la trampa que ya mordió en la barra de compras: un temporizador que
    salió con la copia vieja de la URL se dispara medio segundo después y
    borra el filtro de estado que se acaba de pulsar. La ref siempre tiene lo
    último.
  */
  const vigentes = React.useRef(params);
  vigentes.current = params;

  const aplicar = React.useCallback(
    (valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set("q", valor);
      else siguientes.delete("q");
      // Seguir en la página 3 del resultado anterior no significa nada cuando
      // el criterio acaba de cambiar.
      siguientes.delete("cursor");

      const query = siguientes.toString();
      router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false });
    },
    [ruta, router],
  );

  React.useEffect(() => {
    // Nada que hacer si el cuadro ya dice lo que dice la URL: pasa al volver
    // atrás con el navegador, y sin esto se reescribiría la URL en bucle.
    if (texto === (vigentes.current.get("q") ?? "")) return;
    const t = setTimeout(() => aplicar(texto.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto, aplicar]);

  return (
    <div className="relative flex-1 sm:max-w-sm">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-[var(--fg-subtle)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        // `search` y no `text`: en el móvil el teclado trae la lupa en vez del
        // intro, y el navegador pinta la equis para vaciarlo de un toque.
        placeholder="Buscar por número, cliente u orden de compra"
        aria-label="Buscar cotizaciones"
        className="h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-sm placeholder:text-[var(--fg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      />
    </div>
  );
}
