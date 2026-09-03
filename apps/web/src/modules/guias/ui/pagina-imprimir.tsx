import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { emisorParaImprimir } from "@/lib/emisor";

import { detalleGuia } from "../api/consultas";
import { DocumentoGuia } from "./documento";

/**
 * La hoja imprimible de una guía de remisión.
 *
 * De los cuatro documentos es el que más se imprime: viaja con la mercadería.
 * Hasta el 03/09 el botón «Imprimir» llevaba a una ruta que no existía.
 */
export default async function PaginaImprimirGuia({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  const { id } = await params;
  const [resultado, emisor] = await Promise.all([detalleGuia(id), emisorParaImprimir()]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la guía"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const g = resultado.datos;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 no-print">
        <Link
          href={`/guias/${g.id}`}
          className="text-sm text-[var(--fg-muted)] underline-offset-2 hover:underline"
        >
          ← Volver a la guía
        </Link>
        {/* Un borrador impreso no vale: la mercadería no ha salido y el
            número todavía se puede mover. Se dice aquí y no se bloquea,
            porque revisar el papel antes de emitir es lo que Willy pidió. */}
        {g.estado === "borrador" ? (
          <span className="text-sm font-medium text-[var(--warn)]">
            Es un borrador. Emítela antes de que salga con la mercadería.
          </span>
        ) : null}
        {g.estado === "anulada" ? (
          <span className="text-sm font-medium text-[var(--danger)]">
            Esta guía está ANULADA.
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-md bg-white elev-2 print:rounded-none print:shadow-none">
        <DocumentoGuia g={g} emisor={emisor} />
      </div>
    </div>
  );
}
