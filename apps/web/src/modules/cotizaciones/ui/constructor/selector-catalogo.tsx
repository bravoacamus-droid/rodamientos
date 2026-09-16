"use client";

import * as React from "react";
import { Campo } from "@rodatech/ui";

export interface OpcionCatalogo {
  id: string;
  nombre: string;
}

/**
 * Un selector de catálogo que se busca escribiendo y que deja crear lo que no
 * está.
 *
 * Luis, 16/09, viendo el alta rápida con tres `<select>` normales: *«ahí falta
 * agregar una nueva marca, con su búsqueda inteligente, más rápido de buscar;
 * todos los select, eso ya lo hemos visto… una nueva familia, de la cual de
 * esa familia se puede crear una sub-familia»*.
 *
 * Y las dos cosas son el mismo problema de siempre en este proyecto:
 *
 *   · **Buscar.** Un desplegable de 35 sub-familias se recorre con la rueda
 *     del ratón. El de clientes se arregló el 10/09 por esto mismo; un
 *     desplegable largo es una lista que hay que leer entera.
 *   · **Crear.** `crearMarca`, `crearFamilia` y `crearSubfamilia` existen
 *     desde la 033 con su RPC, su candado de rol y su normalización… y no
 *     había ni una pantalla que las llamara. La pieza puesta y la puerta sin
 *     abrir, otra vez.
 *
 * El filtrado es LOCAL y no una consulta: son 24 marcas, 9 familias y 35
 * sub-familias, ya cargadas. Pedirle al servidor que filtre 24 filas sería
 * añadir una espera donde no hace falta ninguna.
 */
export function SelectorCatalogo({
  id,
  label,
  requerido,
  ayuda,
  opciones,
  valor,
  onElegir,
  onCrear,
  deshabilitado,
  textoVacio,
  placeholder,
}: {
  id: string;
  label: string;
  requerido?: boolean;
  ayuda?: string;
  opciones: OpcionCatalogo[];
  /** El id elegido, o "" si no hay ninguno. */
  valor: string;
  onElegir: (opcion: OpcionCatalogo | null) => void;
  /**
   * Dar de alta lo que no está. Devuelve la opción creada, o null si falló
   * —el mensaje lo enseña quien la implementa, que es quien sabe por qué.
   */
  onCrear?: (nombre: string) => Promise<OpcionCatalogo | null>;
  deshabilitado?: boolean;
  /** Qué decir cuando está apagado. Por ejemplo: «Elige antes la familia». */
  textoVacio?: string;
  placeholder?: string;
}) {
  const [texto, setTexto] = React.useState("");
  const [abierto, setAbierto] = React.useState(false);
  const [creando, setCreando] = React.useState(false);
  const contenedor = React.useRef<HTMLDivElement>(null);

  const elegida = opciones.find((o) => o.id === valor) ?? null;

  // Se cierra al pulsar fuera. Sin esto, el desplegable se queda abierto
  // encima del campo siguiente y parece que la pantalla está trabada.
  React.useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const normal = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  const busca = normal(texto.trim());
  const filtradas = busca === "" ? opciones : opciones.filter((o) => normal(o.nombre).includes(busca));

  // Solo se ofrece crear si lo escrito no existe YA, comparando sin tildes ni
  // mayúsculas: dar de alta «Rodamiento» teniendo «RODAMIENTO» es duplicar el
  // catálogo sin que nadie lo note.
  const yaExiste = opciones.some((o) => normal(o.nombre) === busca);
  const puedeCrear = Boolean(onCrear) && busca.length >= 2 && !yaExiste;

  async function crear() {
    if (!onCrear) return;
    setCreando(true);
    const nueva = await onCrear(texto.trim());
    setCreando(false);
    if (nueva) {
      onElegir(nueva);
      setTexto("");
      setAbierto(false);
    }
  }

  return (
    <Campo id={id} label={label} requerido={requerido} ayuda={ayuda}>
      <div ref={contenedor} className="relative">
        {/*
          Elegida, se enseña el nombre con una × para cambiarlo — no una caja
          de texto con el nombre dentro. Es el mismo trato que el filtro de
          clientes: lo que ya está decidido se lee, no se edita por accidente.
        */}
        {elegida ? (
          <div className="flex min-h-11 w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm md:min-h-control-md">
            <span className="min-w-0 flex-1 truncate">{elegida.nombre}</span>
            <button
              type="button"
              onClick={() => {
                onElegir(null);
                setTexto("");
                setAbierto(true);
              }}
              disabled={deshabilitado}
              aria-label={`Cambiar ${label.toLowerCase()}`}
              className="shrink-0 rounded-sm px-1 text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
            >
              ✕
            </button>
          </div>
        ) : (
          <input
            id={id}
            type="text"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            disabled={deshabilitado}
            placeholder={
              deshabilitado ? (textoVacio ?? "") : (placeholder ?? "Escribe para buscar…")
            }
            autoComplete="off"
            className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-60 md:min-h-control-md"
          />
        )}

        {abierto && !elegida && !deshabilitado ? (
          <div className="absolute z-40 mt-1 max-h-60 w-full overflow-y-auto overscroll-contain rounded-md border border-[var(--border-strong)] bg-[var(--surface)] elev-3">
            {filtradas.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onElegir(o);
                  setTexto("");
                  setAbierto(false);
                }}
                className="flex min-h-11 w-full items-center px-3 text-left text-sm transition-colors hover:bg-[var(--surface-2)]"
              >
                {o.nombre}
              </button>
            ))}

            {filtradas.length === 0 && !puedeCrear ? (
              <p className="p-3 text-sm text-[var(--fg-muted)]">
                Nada coincide con «{texto.trim()}».
              </p>
            ) : null}

            {puedeCrear ? (
              <button
                type="button"
                onClick={crear}
                disabled={creando}
                className="flex min-h-11 w-full items-center gap-1.5 border-t border-[var(--border-soft)] px-3 text-left text-sm font-medium text-brand-600 transition-colors hover:bg-[var(--surface-2)]"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {creando ? "Creando…" : `Crear «${texto.trim()}»`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Campo>
  );
}
