"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así un filtro se puede
// compartir por enlace y sobrevive a recargar la página.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ETIQUETA_CONDICION } from "../dominio/tipos";

/**
 * Barra de filtros de la cartera.
 *
 * No recibe catálogos: los únicos filtros son el texto, la condición de pago y
 * dos interruptores de visibilidad. Todo sale del contrato, así que la barra no
 * depende de ninguna consulta y puede pintarse antes que la tabla.
 */
export function FiltrosClientesBarra() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciarTransicion] = React.useTransition();

  // Los parámetros vigentes se leen de una ref y no de la clausura.
  //
  // Si `aplicar` capturara `params`, se recrearía con cada cambio y un
  // temporizador de la búsqueda que ya estuviera en vuelo llevaría la copia
  // VIEJA: al dispararse reconstruiría la URL sin el filtro recién elegido y lo
  // borraría solo. Con la ref, `aplicar` es estable y siempre parte del estado
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

  const condicion = params.get("condicion") ?? "";
  const bloqueados = params.get("bloqueados") === "1";
  const inactivos = params.get("inactivos") === "1";
  const hayFiltros =
    Boolean(params.get("q")) || Boolean(condicion) || bloqueados || inactivos;

  // 44 px de alto en móvil, la altura de control del ERP a partir de `md`. Un
  // desplegable de 38 px se falla con el pulgar.
  const claseControl =
    "h-11 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:flex-none md:h-control-md";

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6"
      data-pendiente={pendiente ? "" : undefined}
    >
      <BuscadorConRetardo valorEnUrl={params.get("q") ?? ""} aplicar={aplicar} />

      <label className="sr-only" htmlFor="f-condicion">
        Condición de pago
      </label>
      <select
        id="f-condicion"
        className={claseControl}
        // Controlado por la URL, no `defaultValue`: al volver atrás en el
        // navegador o al limpiar los filtros, el desplegable tiene que
        // reflejar lo que de verdad está aplicado.
        value={condicion}
        onChange={(e) => aplicar("condicion", e.target.value)}
      >
        <option value="">Contado y crédito</option>
        <option value="contado">{ETIQUETA_CONDICION.contado}</option>
        <option value="credito">{ETIQUETA_CONDICION.credito}</option>
      </select>

      {hayFiltros ? (
        <button
          type="button"
          onClick={() => iniciarTransicion(() => router.replace(ruta, { scroll: false }))}
          className="h-11 rounded-md px-2 text-sm text-[var(--fg-muted)] underline hover:text-[var(--fg)] md:h-control-md"
        >
          Limpiar
        </button>
      ) : null}

      {/* Los dos interruptores se agrupan y bajan a su propia línea en móvil:
          en 360 px no caben junto a la búsqueda sin que algo se corte. */}
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 sm:ml-auto sm:w-auto">
        <Interruptor
          etiqueta="Ver bloqueados"
          activo={bloqueados}
          onCambio={(v) => aplicar("bloqueados", v ? "1" : "")}
        />
        <Interruptor
          etiqueta="Ver desactivados"
          activo={inactivos}
          onCambio={(v) => aplicar("inactivos", v ? "1" : "")}
        />
      </div>
    </div>
  );
}

/** Casilla con área táctil de 44 px: el `<label>` entero es el objetivo. */
function Interruptor({
  etiqueta,
  activo,
  onCambio,
}: {
  etiqueta: string;
  activo: boolean;
  onCambio: (valor: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--fg-muted)] md:min-h-0">
      <input
        type="checkbox"
        checked={activo}
        onChange={(e) => onCambio(e.target.checked)}
        className="size-4 accent-[var(--ring)]"
      />
      {etiqueta}
    </label>
  );
}

/**
 * Caja de búsqueda con retardo.
 *
 * Sin él, cada tecla dispararía una consulta contra la cartera entera.
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
        Buscar cliente
      </label>
      <input
        id="f-buscar"
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="RUC, razón social, nombre comercial o contacto…"
        className="h-11 w-full min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-w-64 md:h-control-md"
      />
    </>
  );
}
