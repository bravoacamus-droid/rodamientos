"use client";

// Cliente porque escucha los clics y la ruta: es lo único que sabe que se
// pulsó un enlace antes de que el servidor conteste.

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Raya de progreso arriba del todo al cambiar de pantalla.
 *
 * El `loading.tsx` de cada ruta tarda un instante en llegar —en desarrollo,
 * lo que tarda en compilarse la ruta la primera vez—, y en ese instante el
 * clic no tenía respuesta (30/10). La raya sale en el mismo milisegundo del
 * clic y dice «ya voy». Se va sola al cambiar la ruta, o a los 12 s si la
 * navegación se cayó, para no quedarse pegada.
 *
 * Solo se enciende si cambia la RUTA: pasar de página en una tabla
 * (`?pagina=2`) ya tiene su propio aviso dentro de la tabla.
 */
export function BarraNavegacion() {
  const ruta = usePathname();
  const [activa, setActiva] = React.useState(false);

  // Llegó la pantalla nueva: fuera la raya.
  React.useEffect(() => setActiva(false), [ruta]);

  React.useEffect(() => {
    if (!activa) return;
    const tope = window.setTimeout(() => setActiva(false), 12000);
    return () => window.clearTimeout(tope);
  }, [activa]);

  React.useEffect(() => {
    const alClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = (e.target as Element | null)?.closest?.("a[href]");
      if (!(enlace instanceof HTMLAnchorElement)) return;
      if (enlace.target && enlace.target !== "_self") return;
      if (enlace.hasAttribute("download")) return;
      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname) return;
      setActiva(true);
    };
    document.addEventListener("click", alClic, true);
    return () => document.removeEventListener("click", alClic, true);
  }, []);

  if (!activa) return null;
  return (
    <div
      role="progressbar"
      aria-label="Cargando la pantalla"
      className="filo-marca anim-barra-navegacion pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] print:hidden"
    />
  );
}
