"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Campo, campoBase } from "@rodatech/ui";

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
  /** El campo convertido en «dar de alta una nueva» (17/09). */
  const [modoCrear, setModoCrear] = React.useState(false);
  const [nombreNuevo, setNombreNuevo] = React.useState("");
  const contenedor = React.useRef<HTMLDivElement>(null);
  const campo = React.useRef<HTMLInputElement>(null);
  /** Si el desplegable se abrió por la ✕, y no por pulsar el campo. */
  const alCambiar = React.useRef(false);

  const elegida = opciones.find((o) => o.id === valor) ?? null;

  /*
    Al pulsar la ✕, el foco tiene que ir a la caja de búsqueda.

    La ✕ y la caja no son el mismo elemento: mientras hay algo elegido se
    enseña el nombre con su ✕, y solo al soltarlo aparece el `<input>`. Recién
    montado no tiene el foco, así que quien pulsaba «cambiar» y se ponía a
    teclear no escribía en ninguna parte — el desplegable se abría con las 24
    marcas y el filtro vacío, como si el teclado no existiera.

    Va en un efecto y no en el propio `onClick` porque ahí el input todavía no
    está en el DOM: se crea en el render que dispara ese mismo clic.
  */
  React.useEffect(() => {
    if (!elegida && alCambiar.current) {
      alCambiar.current = false;
      campo.current?.focus();
    }
  }, [elegida]);

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

  async function crear(nombre = texto.trim()) {
    if (!onCrear || nombre.length < 2) return;
    setCreando(true);
    const nueva = await onCrear(nombre);
    setCreando(false);
    if (nueva) {
      onElegir(nueva);
      setTexto("");
      setAbierto(false);
      setModoCrear(false);
      setNombreNuevo("");
    }
  }

  /*
    El «+» de crear, en un modo propio del campo.

    Willy, 16/09 (1:23), preguntado dónde se crea una marca que no existe:
    *«aquí le voy a poner un botoncito al costado, un más, que le abre y como
    es un componente nada más va a poder crear la marca»*.

    Hasta ahora se podía crear, pero **solo si escribías** un nombre que no
    estaba: la opción aparecía al final del desplegable. Es exactamente lo que
    esta casa lleva treinta veces arreglando —la función existía y el camino
    no se veía—, y la regla de la primera página lo dice: un botón tiene que
    parecer un botón, y *«una persona que no sabe que tiene que darle click
    ahí»* no lo descubre tecleando.

    Se resuelve con un modo dentro del propio campo y NO con un diálogo: este
    selector ya vive dentro del diálogo de alta o de edición, y un diálogo
    encima de otro se lleva el foco y deja al de abajo sin saber si sigue
    abierto.
  */
  if (modoCrear && onCrear) {
    return (
      <Campo id={id} label={`${label} nueva`} requerido={requerido}>
        <div className="flex gap-2">
          <input
            id={id}
            autoFocus
            type="text"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => {
              // Enter crea; Escape se vuelve. Sin esto habría que ir al ratón
              // para algo que se hace tecleando.
              if (e.key === "Enter") {
                e.preventDefault();
                void crear(nombreNuevo.trim());
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setModoCrear(false);
                setNombreNuevo("");
              }
            }}
            placeholder={`Nombre de la ${label.toLowerCase()}`}
            className={`${campoBase} h-control-md min-w-0 flex-1 px-3 text-sm`}
          />
          <button
            type="button"
            onClick={() => void crear(nombreNuevo.trim())}
            disabled={creando || nombreNuevo.trim().length < 2}
            className="h-control-md shrink-0 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
          >
            {creando ? "Creando…" : "Crear"}
          </button>
          {/*
            Volver es una ✕ y no la palabra «Cancelar».

            Medido: con los dos botones de texto, la caja del nombre se quedaba
            en «Nombre de la marc…». Los tres caben en una columna de la
            rejilla solo si el de salir es un icono — y salir de aquí no tiene
            consecuencias, así que no necesita una palabra que lo piense.
          */}
          <button
            type="button"
            onClick={() => {
              setModoCrear(false);
              setNombreNuevo("");
            }}
            title="Volver sin crear"
            aria-label="Volver sin crear"
            className="grid h-control-md w-control-md shrink-0 place-items-center rounded-md border border-[var(--border)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          >
            <X className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </Campo>
    );
  }

  return (
    <Campo id={id} label={label} requerido={requerido} ayuda={ayuda}>
      {/*
        El campo y el «+», en una fila.

        El «+» va FUERA del campo y no dentro: dentro sería un icono más entre
        el texto y la ✕, y ya se vio lo que pasa con los iconos sueltos en esta
        casa. Fuera, con su borde y su `title`, se lee como lo que es.
      */}
      <div className="flex gap-2">
      <div ref={contenedor} className="relative min-w-0 flex-1">
        {/*
          Elegida, se enseña el nombre con una × para cambiarlo — no una caja
          de texto con el nombre dentro. Es el mismo trato que el filtro de
          clientes: lo que ya está decidido se lee, no se edita por accidente.
        */}
        {/*
          `campoBase` del sistema de diseño, no un borde copiado a mano.

          Medido con el diálogo abierto: esta caja daba **47 px** y el `Input`
          de al lado **40**. Siete píxeles de desnivel entre dos campos de la
          misma fila, con el radio y el foco pintados por otro sitio. Luis,
          16/09: *«que todo calce bien»*.

          Copiar `border`, `rounded-md` y `bg-surface` a mano es lo que produce
          eso: el día que el token cambia, los campos copiados se quedan atrás.
          Usando la misma constante que `Input`, calzan por construcción — y
          sale gratis el estado de foco y el de deshabilitado.
        */}
        {elegida ? (
          <div
            className={`${campoBase} flex h-control-md items-center gap-2 px-3 text-sm ${
              deshabilitado ? "opacity-60" : ""
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{elegida.nombre}</span>
            <button
              type="button"
              onClick={() => {
                alCambiar.current = true;
                onElegir(null);
                setTexto("");
                setAbierto(true);
              }}
              disabled={deshabilitado}
              aria-label={`Cambiar ${label.toLowerCase()}`}
              title={`Cambiar ${label.toLowerCase()}`}
              /*
                Un botón redondo de 28 px con su icono, no una «✕» de texto.

                Luis, 16/09: *«hay que poner buenos iconos, la ✕ y todo eso»*.
                Era el carácter tipográfico, que cambia de forma con la fuente,
                no se alinea con nada y ofrecía un blanco de unos diez píxeles
                — en una fila donde al lado hay campos que se teclean, fallar
                el clic significa borrar lo elegido sin querer o no borrarlo
                cuando se quiere.

                Y el fondo al pasar por encima existe por lo mismo: es lo que
                dice que eso se pulsa, sin necesidad de descubrirlo probando.
              */
              className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-40"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <input
            id={id}
            ref={campo}
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
            className={`${campoBase} h-control-md px-3 text-sm`}
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
                onClick={() => void crear()}
                disabled={creando}
                className="flex min-h-11 w-full items-center gap-1.5 border-t border-[var(--border-soft)] px-3 text-left text-sm font-medium text-brand-600 transition-colors hover:bg-[var(--surface-2)]"
              >
                <Plus className="size-4 shrink-0" aria-hidden="true" />
                {creando ? "Creando…" : `Crear «${texto.trim()}»`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/*
        El «+», siempre a la vista mientras se pueda crear.

        Se apaga con el campo —la sub-familia no se puede crear sin haber
        elegido antes la familia, porque su clave ajena es compuesta— y no se
        esconde: un botón que aparece y desaparece obliga a recordar cuándo
        sale, y eso es lo mismo que no tenerlo.
      */}
      {onCrear ? (
        <button
          type="button"
          onClick={() => {
            // Lo ya tecleado en la búsqueda se lleva al nombre: si alguien
            // escribió media marca y luego pulsa «+», no tiene que repetirla.
            setNombreNuevo(texto.trim());
            setModoCrear(true);
          }}
          disabled={deshabilitado}
          title={`Crear una ${label.toLowerCase()} nueva`}
          aria-label={`Crear una ${label.toLowerCase()} nueva`}
          className="grid h-control-md w-control-md shrink-0 place-items-center rounded-md border border-[var(--border)] text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-40"
        >
          <Plus className="size-[18px]" aria-hidden="true" />
        </button>
      ) : null}
      </div>
    </Campo>
  );
}
