import { CONFIGURACION, NAVEGACION, TABLERO, type GrupoNav, type ItemNav } from "@/lib/navegacion";
import { IconoNav } from "@/componentes/iconos-nav";

/**
 * La cabecera de marca de un módulo (30/10).
 *
 * Luis, 30/10: *«en cada módulo quisiera ver jerarquías, brandeado
 * profesional, lo más importante de cada módulo o sección»*.
 *
 * Lo más importante de cada módulo YA estaba: el título, la acción principal
 * y la fila de cifras (`FilaIndicadores`, desde el 07/10). Lo que faltaba era
 * jerarquía: eran tres bloques blancos iguales al resto de la pantalla. Este
 * panel los reúne sobre el azul de la marca, por encima de los filtros y la
 * tabla, que son lo de trabajo.
 *
 * NO cambia lo que la página pone dentro: lo envuelve. `panel-modulo`
 * redefine los tokens de color en su interior (ver tokens.css), así que el
 * título, los botones y las tarjetas de cifras de cada pantalla se vuelven
 * vidrio sobre azul sin tocar una línea suya.
 *
 * El área y el icono salen del menú (`lib/navegacion.ts`) a partir de la
 * ruta: un módulo nuevo que se cuelgue del menú nace con su cabecera bien.
 */

type Area = "ventas" | "compras" | "catalogo" | "almacen" | "gestion";

/** El tono del panel según el grupo del menú. */
const AREA_DEL_GRUPO: Record<string, Area> = {
  Ventas: "ventas",
  Compras: "compras",
  Catálogo: "catalogo",
  Almacén: "almacen",
  Reportes: "gestion",
  Gestión: "gestion",
  Configuración: "gestion",
};

/** El grupo y el ítem del menú que corresponden a una ruta. */
function buscarEnMenu(ruta: string): { grupo?: GrupoNav; item?: ItemNav } {
  if (ruta === TABLERO.ruta) return { item: TABLERO };
  for (const grupo of [...NAVEGACION, CONFIGURACION]) {
    const item = grupo.items.find((i) => i.ruta === ruta);
    if (item) return { grupo, item };
  }
  return {};
}

export function PanelModulo({
  ruta,
  children,
}: {
  /** La ruta del módulo tal como está en el menú, p. ej. «/cotizaciones». */
  ruta: string;
  children: React.ReactNode;
}) {
  const { grupo, item } = buscarEnMenu(ruta);
  const area = (grupo && AREA_DEL_GRUPO[grupo.titulo]) ?? "ventas";

  return (
    <section data-area={area} className="panel-modulo flex flex-col gap-4 p-4 sm:p-6">
      {grupo && item ? (
        // De qué parte del negocio es esta pantalla. El icono del módulo, en
        // grande y en dorado, es el mismo que el del menú: se reconoce igual.
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/12 text-accent-300 ring-1 ring-inset ring-white/20">
            <IconoNav nombre={item.icono} className="size-6" />
          </span>
          <span className="rounded-full bg-white/12 px-3 py-1 text-sm font-semibold uppercase tracking-wider text-white/90 ring-1 ring-inset ring-white/15">
            {grupo.titulo}
          </span>
        </div>
      ) : null}
      {children}
      <span className="filo-marca pointer-events-none absolute inset-x-0 bottom-0 h-1" aria-hidden="true" />
    </section>
  );
}
