import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { emisorParaImprimir } from "@/lib/emisor";

import { detalleComprobante } from "../api/consultas";
import { DocumentoComprobante } from "./documento";

/**
 * La hoja imprimible de un comprobante.
 *
 * Es una pantalla aparte y no un modo de la ficha, por lo mismo que en
 * cotizaciones: la ficha tiene estado, acciones y avisos de SUNAT, y esto es
 * un documento. Separarlas hace que lo que se imprime sea exactamente lo que
 * se ve, sin depender de acordarse de poner `no-print` en cada botón nuevo.
 */
export default async function PaginaImprimirComprobante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  const { id } = await params;
  const [resultado, emisor] = await Promise.all([
    detalleComprobante(id),
    emisorParaImprimir(),
  ]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el comprobante"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const c = resultado.datos;

  return (
    <div className="flex flex-col gap-3">
      {/* Lo único que no es el documento, y por eso lleva `no-print`. */}
      <div className="flex items-center justify-between gap-3 no-print">
        <Link
          href={`/facturacion/${c.id}`}
          className="text-sm text-[var(--fg-muted)] underline-offset-2 hover:underline"
        >
          ← Volver al comprobante
        </Link>
        {c.estado === "anulado" ? (
          <span className="text-sm font-medium text-[var(--danger)]">
            Este comprobante está ANULADO. No debería imprimirse para entregar.
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-md bg-white elev-2 print:rounded-none print:shadow-none">
        <DocumentoComprobante c={c} emisor={emisor} />
      </div>
    </div>
  );
}
