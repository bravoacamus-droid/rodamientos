import { Skeleton, SkeletonTabla, SkeletonTarjetas } from "@rodatech/ui";

/**
 * Lo que se ve mientras llega una pantalla.
 *
 * Sin esto, el clic en el menú no hacía nada visible hasta que el servidor
 * terminaba de consultar la base: la pantalla anterior se quedaba quieta y
 * parecía que el botón no había funcionado, así que se volvía a pulsar (30/10).
 *
 * Tienen la forma de lo que viene —título, botones, tabla— para que al llegar
 * los datos no salte nada de sitio. Las usan los `loading.tsx` de cada ruta;
 * el menú y la barra de arriba se quedan puestos, porque viven en el layout.
 */

/** Título de página con su subtítulo y los botones de la derecha. */
function CabeceraCargando({ botones = 2 }: { botones?: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-[70vw]" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: botones }, (_, i) => (
          <Skeleton key={i} className="h-control-md w-36 rounded-md" />
        ))}
      </div>
    </div>
  );
}

/**
 * Una lista: la cabecera de marca, la barra de búsqueda y filtros, y la tabla.
 *
 * La cabecera va ya en el azul de `PanelModulo`: si cargara en blanco, al
 * llegar la pantalla saltaría de color, que se lee como un parpadeo.
 */
export function CargandoLista() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Cargando">
      <section className="panel-modulo flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        {/* Sin las tarjetas de cifras: solo diez módulos las tienen, y en los
            demás el panel encogería al llegar la pantalla. */}
        <CabeceraCargando />
      </section>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-control-md w-full max-w-sm rounded-md" />
        <Skeleton className="h-control-md w-32 rounded-md" />
        <Skeleton className="h-control-md w-32 rounded-md" />
      </div>
      <SkeletonTabla filas={9} columnas={6} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/** La ficha de un documento: cabecera, datos en tarjetas y las líneas. */
export function CargandoFicha() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Cargando">
      <Skeleton className="h-4 w-28" />
      <CabeceraCargando botones={3} />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card elev-1 flex flex-col gap-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ))}
      </div>
      <SkeletonTabla filas={5} columnas={6} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/** El tablero: la franja de marca, las cifras y un gráfico. */
export function CargandoTablero() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Cargando">
      {/* La franja va con su color de verdad: es lo primero que se ve y así
          la pantalla ya «es» el tablero antes de que lleguen las cifras. */}
      <div className="fondo-marca overflow-hidden rounded-2xl px-5 py-6 sm:px-7">
        <span className="filo-marca absolute inset-x-0 bottom-0 h-1" aria-hidden="true" />
        <div className="h-8 w-40 rounded-md bg-white/20" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-white/15" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <SkeletonTarjetas cantidad={4} alto={120} />
      <Skeleton className="h-[22rem] w-full rounded-xl" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
