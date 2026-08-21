/**
 * @rodatech/ui — design system del ERP Rodatech
 *
 * Punto de entrada público. Todo lo que la app consume sale de aquí, salvo:
 *   · `@rodatech/ui/tokens.css` — los tokens de marca (se importa una vez,
 *     desde el globals.css de la app).
 *   · `@rodatech/ui/tabla`      — DataTable y compañía, en su propio subpath
 *     para no cargar TanStack Table en pantallas que no llevan tabla.
 *
 * NOTA sobre la frontera cliente: este barrel mezcla Server y Client
 * Components a propósito. Cada archivo declara su propio `"use client"` (con
 * el motivo escrito en la cabecera), así que importar `Button` desde una
 * página de servidor NO arrastra Radix al bundle: solo lo hace importar
 * `Dialog`.
 */

/* --------------------------------------------------------------- Utilidad */
export { cn, debounce } from "./lib/utils";
export {
  formatearFecha,
  formatearFechaHora,
  formatearFechaLarga,
  formatearMoneda,
  formatearMonedaCorta,
  formatearNumero,
  formatearPorcentaje,
  iniciales,
  variacionPorcentual,
  type CodigoMoneda,
} from "./lib/formato";

/* ------------------------------------------------------------ Primitivas */
export * from "./primitivas";

/* --------------------------------------------------------------- Dominio */
export * from "./dominio";
