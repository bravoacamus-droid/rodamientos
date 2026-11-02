import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";

import { emisorParaImprimir } from "@/lib/emisor";
import { misPermisos } from "@/lib/permisos";
import { Volver } from "@/componentes/volver";

import { detalleCompra } from "../api/consultas";
import { FormularioEditarOrden } from "./formulario-editar-orden";

/** Editar la orden de compra (180), mientras nadie la ha usado. */
export default async function PaginaEditarOrden({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [resultado, permisos, emisor] = await Promise.all([detalleCompra(id), misPermisos(), emisorParaImprimir()]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la orden"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();
  const c = resultado.datos;

  // Lo mismo que comprueba `actualizar_orden_compra`: si ya no se puede
  // editar, a la ficha, que dice por qué.
  const editable =
    permisos.tiene("compras", "editar") &&
    c.estado === "registrada" &&
    !c.documento_proveedor &&
    c.recepciones.length === 0;
  if (!editable) redirect(`/compras/${c.id}`);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Volver href={`/compras/${c.id}`}>Volver a la orden</Volver>
        <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
          Editar orden <span className="font-mono">{c.numero}</span>
        </h1>
        <p className="mt-0.5 text-base text-[var(--fg-muted)]">{c.proveedor ?? "—"}</p>
      </header>
      <FormularioEditarOrden c={c} direccionEmpresa={emisor.direccion ?? null} />
    </div>
  );
}
