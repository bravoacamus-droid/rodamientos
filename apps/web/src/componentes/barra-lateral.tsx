"use client";

// Cliente por tres razones: marcar el enlace activo con usePathname(), plegar
// los grupos, y recordar cómo quedaron entre sesiones.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  cn,
  Sheet,
  SheetBody,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@rodatech/ui";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "@/componentes/logo";
import { IconoNav } from "@/componentes/iconos-nav";
import {
  COOKIE_MENU_ESTRECHO,
  TABLERO,
  rutaActiva,
  type GrupoNav,
  type ItemNav,
} from "@/lib/navegacion";
import type { PendientesDelMenu } from "@/lib/pendientes-del-menu";

/**
 * Navegación de módulos.
 *
 * ---------------------------------------------------------------------------
 * De dónde sale esta forma
 * ---------------------------------------------------------------------------
 * Del rediseño que hizo Luis el 08/09: *«así lo quiero, más dinámico… más
 * visible, más bonito al cliente, entendible qué hace cada cosa»*. Y después:
 * *«no olvidar los iconos de cada uno, así el tipo de letra»*.
 *
 * Una corrección suya que conviene no repetir: en un primer intento se
 * **cerraron** los grupos para que el menú cupiera sin desplazarse. Era el
 * problema equivocado. Él quiere verlo todo —con su icono, su espacio y su
 * tamaño— y desplazarse si hace falta. Un menú que cabe pero no se entiende no
 * ha ganado nada.
 *
 * ---------------------------------------------------------------------------
 * Las medidas salen de su prototipo, no de mi gusto
 * ---------------------------------------------------------------------------
 * Se midieron en la pantalla que mandó: **14 px, peso 600 en los grupos, filas
 * de 48 px**. La tipografía es Manrope, y se cambió en toda la aplicación
 * (`layout.tsx`): tiene la altura de x más alta que Inter, así que al mismo
 * tamaño se lee más grande — con Willy eso no es estética.
 *
 * ---------------------------------------------------------------------------
 * Lo demás
 * ---------------------------------------------------------------------------
 *  · **Todo abierto de entrada.** Se puede plegar y lo plegado se recuerda,
 *    pero nadie tiene que descubrir nada para ver sus módulos.
 *
 *  · **Icono también en el título del grupo.** Un encabezado en versalitas
 *    grises se lee como una etiqueta de sistema; con icono se reconoce igual
 *    que sus ítems.
 *
 *  · **Tablero arriba y Configuración anclada abajo**, los dos fuera de los
 *    grupos: uno es la portada, y el otro se toca el día de la puesta en
 *    marcha y casi nunca más — pero cuando se necesita, no se busca.
 *
 * El mismo listado se pinta en la columna fija y en el cajón de móvil desde
 * una sola función: duplicarlo garantizaba que un día se agregara un módulo en
 * uno y no en el otro.
 */

/*
  Se guardan los PLEGADOS.

  Por defecto está todo abierto, así que lo que hay que recordar es la
  excepción. Guardar los abiertos obligaría a que el usuario «descubriera» el
  menú antes de verlo entero.
*/
const CLAVE = "rodatech.nav.plegados";


/** Grupos plegados, leídos del navegador. Nunca revienta si el valor está roto. */
function leerPlegados(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    const lista: unknown = crudo ? JSON.parse(crudo) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function usePlegados() {
  // Arranca vacío —o sea, todo abierto— y se rellena al montar: en el servidor
  // no hay `localStorage`, y leerlo en el primer render rompería la
  // hidratación.
  const [plegados, setPlegados] = React.useState<Set<string>>(new Set());

  React.useEffect(() => setPlegados(leerPlegados()), []);

  const alternar = React.useCallback((titulo: string) => {
    setPlegados((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(titulo)) siguiente.delete(titulo);
      else siguiente.add(titulo);
      try {
        window.localStorage.setItem(CLAVE, JSON.stringify([...siguiente]));
      } catch {
        // Modo privado o almacenamiento lleno: se pliega igual, solo que no se
        // recuerda. No es motivo para romper el menú.
      }
      return siguiente;
    });
  }, []);

  return { plegados, alternar };
}

// Un solo ítem encendido, el más específico. La regla vive en
// `lib/navegacion.ts` y está probada allí.
const activoEn = (ruta: string, item: string) => rutaActiva(ruta) === item;

/** Cuántas cosas esperan en esta ruta. Solo dos la tienen. */
const esperaEn = (item: ItemNav, pendientes?: PendientesDelMenu) =>
  pendientes?.[item.ruta as keyof PendientesDelMenu] ?? 0;

/**
 * Un enlace del menú.
 *
 * `dentroDeGrupo` distingue los que cuelgan de un grupo de los sueltos
 * —Tablero y Configuración—, que se alinean con los títulos y van en el mismo
 * peso que ellos.
 */
function Enlace({
  item,
  activo,
  espera,
  dentroDeGrupo = true,
  onNavegar,
  estrecho = false,
}: {
  item: ItemNav;
  activo: boolean;
  espera: number;
  dentroDeGrupo?: boolean;
  onNavegar?: () => void;
  /** Solo el icono; el nombre sale al pasar por encima. */
  estrecho?: boolean;
}) {
  const enlace = (
    <Link
      href={item.ruta}
      aria-current={activo ? "page" : undefined}
      onClick={onNavegar}
      className={cn(
        // 48 px, la altura de su prototipo. Se mantiene en escritorio: aquí no
        // se gana nada apretando las filas, y en móvil es además la medida
        // mínima para acertar con el dedo.
        "relative flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
        estrecho && "justify-center px-0",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        activo
          ? "bg-brand-600 font-semibold text-white"
          : dentroDeGrupo
            ? "text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            : "font-semibold text-[var(--fg)] hover:bg-[var(--surface-2)]",
      )}
    >
      <IconoNav
        nombre={item.icono}
        // Recogido, el icono es lo único que hay: más grande, que se distinga.
        className={cn(estrecho ? "size-[22px]" : "size-[18px]", "shrink-0", activo ? "" : "text-brand-600/75")}
      />
      {/* Estrecho, el nombre sigue ahí para el lector de pantalla. */}
      <span className={estrecho ? "sr-only" : "truncate"}>{item.etiqueta}</span>

      {/*
        Cuántas esperan. Solo si hay: un «0» ocupa el mismo sitio que un número
        y no dice nada, y la gracia de la pastilla es que solo la lleve lo que
        reclama algo.
      */}
      {espera > 0 ? (
        <span
          className={cn(
            // `text-sm` como el resto de pastillas (24/09): este número dice
            // cuántas cosas esperan, y es de lo primero que se mira al entrar.
            "ml-auto min-w-6 shrink-0 rounded-full px-2 py-0.5 text-center text-sm font-bold tabular",
            // Estrecho, la pastilla se monta en la esquina del icono: lo que
            // espera tiene que seguir viéndose con el menú recogido.
            estrecho && "absolute -top-0.5 right-0.5 ml-0 min-w-5 px-1.5 py-0",
            activo ? "bg-white/25 text-white" : "bg-[var(--warn-bg)] text-[var(--warn)]",
          )}
          aria-label={`${espera} esperando`}
        >
          {espera > 99 ? "99+" : espera}
        </span>
      ) : null}
    </Link>
  );

  if (!estrecho) return enlace;
  // El nombre, a 14 px y no a los 12 del tooltip de serie: es la única
  // forma de saber qué es cada icono con el menú recogido.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{enlace}</TooltipTrigger>
      <TooltipContent side="right" className="px-3 py-1.5 text-sm">
        {item.etiqueta}
        {espera > 0 ? ` · ${espera} esperando` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function Grupos({
  grupos,
  ruta,
  plegados,
  alternar,
  pendientes,
  onNavegar,
  estrecho = false,
}: {
  grupos: GrupoNav[];
  ruta: string;
  plegados: Set<string>;
  alternar: (titulo: string) => void;
  pendientes?: PendientesDelMenu;
  onNavegar?: () => void;
  estrecho?: boolean;
}) {
  /*
    Estrecho no hay títulos que plegar: los iconos de cada grupo van seguidos,
    separados por una raya. Un grupo plegado escondería iconos que no se
    pueden desplegar sin ensanchar el menú.
  */
  if (estrecho) {
    return (
      <>
        {grupos.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-0.5">
            <div className="mx-2 my-1.5 h-px bg-[var(--border-soft)]" aria-hidden />
            {grupo.items.map((item) => (
              <Enlace
                key={item.ruta}
                item={item}
                activo={activoEn(ruta, item.ruta)}
                espera={esperaEn(item, pendientes)}
                onNavegar={onNavegar}
                estrecho
              />
            ))}
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {grupos.map((grupo) => {
        // El grupo que contiene la ruta activa se abre aunque esté plegado:
        // esconder el enlace marcado desorienta más de lo que ahorra.
        const contieneActivo = grupo.items.some((i) => activoEn(ruta, i.ruta));
        const abierto = contieneActivo || !plegados.has(grupo.titulo);

        return (
          <div key={grupo.titulo} className="flex flex-col">
            <button
              type="button"
              onClick={() => alternar(grupo.titulo)}
              aria-expanded={abierto}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              <IconoNav
                nombre={grupo.icono}
                className="size-[18px] shrink-0 text-brand-600"
              />
              <span className="truncate">{grupo.titulo}</span>
              <svg
                viewBox="0 0 24 24"
                className={cn(
                  "ml-auto size-4 shrink-0 text-[var(--fg-subtle)] transition-transform",
                  abierto ? "-rotate-90" : "rotate-90",
                )}
                aria-hidden="true"
              >
                <path
                  d="M9 5l7 7-7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {abierto ? (
              /* La guía vertical ata los ítems a su grupo. Con los cinco
                 abiertos y sin ella, veintidós enlaces seguidos se leen como
                 una lista plana y el agrupamiento deja de significar nada. */
              <div className="ml-6 flex flex-col gap-0.5 border-l border-[var(--border-soft)] pb-2 pl-2">
                {grupo.items.map((item) => (
                  <Enlace
                    key={item.ruta}
                    item={item}
                    activo={activoEn(ruta, item.ruta)}
                    espera={esperaEn(item, pendientes)}
                    onNavegar={onNavegar}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/**
 * La cabecera: qué empresa y quién está dentro.
 *
 * Luis la puso en su rediseño, y tiene sentido más allá de lo estético: el día
 * que haya un entorno de pruebas al lado del de verdad, el nombre de arriba es
 * lo que evita emitir una factura en el sitio equivocado.
 */
function Cabecera({
  empresa,
  usuario,
  onNavegar,
  estrecho = false,
}: {
  empresa: string;
  usuario: string;
  onNavegar?: () => void;
  estrecho?: boolean;
}) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavegar}
      className={cn(
        "flex shrink-0 items-center gap-3 border-b border-[var(--border)] py-4 transition-colors hover:bg-[var(--surface-2)]",
        estrecho ? "justify-center px-2" : "px-4",
      )}
    >
      <Logo className={cn("w-auto shrink-0", estrecho ? "h-7" : "h-9")} />
      <span className={estrecho ? "sr-only" : "min-w-0"}>
        <span className="block truncate text-sm font-bold leading-tight">
          {empresa}
        </span>
        <span className="block truncate text-sm text-[var(--fg-muted)]">
          {usuario}
        </span>
      </span>
    </Link>
  );
}

/** El cuerpo del menú, igual en la columna fija y en el cajón de móvil. */
function Cuerpo({
  grupos,
  ruta,
  plegados,
  alternar,
  pendientes,
  onNavegar,
  estrecho = false,
}: {
  grupos: GrupoNav[];
  ruta: string;
  plegados: Set<string>;
  alternar: (titulo: string) => void;
  pendientes?: PendientesDelMenu;
  onNavegar?: () => void;
  estrecho?: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden py-3",
          estrecho ? "px-2" : "px-3",
        )}
      >
        <Enlace
          item={TABLERO}
          activo={activoEn(ruta, TABLERO.ruta)}
          espera={0}
          dentroDeGrupo={false}
          onNavegar={onNavegar}
          estrecho={estrecho}
        />

        {estrecho ? null : <div className="my-1 h-px bg-[var(--border-soft)]" />}

        <Grupos
          grupos={grupos}
          ruta={ruta}
          plegados={plegados}
          alternar={alternar}
          pendientes={pendientes}
          onNavegar={onNavegar}
          estrecho={estrecho}
        />
      </div>


    </>
  );
}

/**
 * Columna fija. Desde `md` hacia arriba.
 *
 * Se puede RECOGER a solo iconos. Luis, 02/10, con la tabla del análisis de
 * importación —dieciocho columnas— delante: *«un icono así para ocultar el
 * sidebar […] así tenemos más espacio […] solo aparecían los iconos […] bonito
 * con animación»*. Son 176 px más para la pantalla.
 *
 * El botón dice lo que hace con palabras —«Ocultar menú»— y no es solo un
 * icono: CLAUDE.md §1, *«un botón tiene que parecer un botón»*. Recogido, cada
 * icono dice su nombre al pasar por encima, a 14 px.
 */
export function BarraLateral({
  grupos,
  empresa,
  usuario,
  pendientes,
  estrechoInicial = false,
}: {
  grupos: GrupoNav[];
  empresa: string;
  usuario: string;
  pendientes?: PendientesDelMenu;
  /** Cómo lo dejó la última vez, leído de la cookie en el servidor. */
  estrechoInicial?: boolean;
}) {
  const ruta = usePathname();
  const { plegados, alternar } = usePlegados();
  const [estrecho, setEstrecho] = React.useState(estrechoInicial);

  const alternarAncho = () => {
    const siguiente = !estrecho;
    setEstrecho(siguiente);
    // Un año. Sin `secure` a propósito: en local se sirve por http.
    document.cookie = `${COOKIE_MENU_ESTRECHO}=${siguiente ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  const Icono = estrecho ? PanelLeftOpen : PanelLeftClose;
  const boton = (
    <button
      type="button"
      onClick={alternarAncho}
      aria-expanded={!estrecho}
      aria-label={estrecho ? "Mostrar el menú completo" : "Ocultar menú"}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        estrecho ? "justify-center px-0" : "px-3",
      )}
    >
      <Icono className="size-5 shrink-0 text-brand-600" aria-hidden />
      {estrecho ? null : <span className="truncate">Ocultar menú</span>}
    </button>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <nav
        aria-label="Módulos"
        className={cn(
          "hidden h-dvh shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] md:sticky md:top-0 md:flex print:!hidden",
          // La animación: solo el ancho. El contenido cambia de forma al
          // instante y la columna lo acompaña en 200 ms.
          "transition-[width] duration-200 ease-out motion-reduce:transition-none",
          estrecho ? "w-20" : "w-64",
        )}
      >
        <Cabecera empresa={empresa} usuario={usuario} estrecho={estrecho} />
        <Cuerpo
          grupos={grupos}
          ruta={ruta}
          plegados={plegados}
          alternar={alternar}
          pendientes={pendientes}
          estrecho={estrecho}
        />
        <div className={cn("shrink-0 border-t border-[var(--border)] py-3", estrecho ? "px-2" : "px-3")}>
          {estrecho ? (
            <Tooltip>
              <TooltipTrigger asChild>{boton}</TooltipTrigger>
              <TooltipContent side="right" className="px-3 py-1.5 text-sm">
                Mostrar el menú completo
              </TooltipContent>
            </Tooltip>
          ) : (
            boton
          )}
        </div>
      </nav>
    </TooltipProvider>
  );
}

/** Cajón de móvil. Se cierra solo al navegar. */
export function MenuMovil({
  grupos,
  empresa,
  usuario,
  pendientes,
}: {
  grupos: GrupoNav[];
  empresa: string;
  usuario: string;
  pendientes?: PendientesDelMenu;
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = React.useState(false);
  const { plegados, alternar } = usePlegados();
  const cerrar = () => setAbierto(false);

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger
        className="-ml-1 flex size-10 items-center justify-center rounded-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] md:hidden"
        aria-label="Abrir menú de módulos"
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </SheetTrigger>

      <SheetContent lado="izquierda" className="flex w-72 max-w-[85vw] flex-col p-0">
        <SheetTitle className="sr-only">Módulos</SheetTitle>
        <Cabecera empresa={empresa} usuario={usuario} onNavegar={cerrar} />
        <SheetBody className="flex min-h-0 flex-1 flex-col p-0">
          <Cuerpo
            grupos={grupos}
            ruta={ruta}
            plegados={plegados}
            alternar={alternar}
            pendientes={pendientes}
            onNavegar={cerrar}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
