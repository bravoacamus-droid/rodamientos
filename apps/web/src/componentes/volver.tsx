import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * «Volver a…», igual en todas las fichas.
 *
 * Revisión de diseño del 02/10: había CUATRO maneras de volver —un enlace gris
 * de 20 px de alto con la flecha «←» como texto, la misma partida en dos
 * líneas, un botón «Volver al listado» en recepciones y fichas sin ninguna—.
 * Para Willy, *«un botón tiene que parecer un botón»* (CLAUDE.md §1): este lo
 * parece, mide 40 px y la flecha es la de lucide, que no cambia con la fuente.
 */
export function Volver({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      // El azul suave de los botones secundarios (27/11): en gris, junto a
      // los «Editar» o «Imprimir» de la ficha, parecía apagado.
      className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-[var(--boton-fila-borde)] bg-[var(--boton-fila-bg)] px-3 text-sm font-semibold text-[var(--boton-fila-fg)] transition-colors hover:border-[var(--boton-fila-borde-hover)] hover:bg-[var(--boton-fila-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}
