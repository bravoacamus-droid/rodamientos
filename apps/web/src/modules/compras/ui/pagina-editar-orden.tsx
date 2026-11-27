import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";

import { emisorParaImprimir } from "@/lib/emisor";
import { misPermisos } from "@/lib/permisos";
import { CabeceraFicha } from "./ficha";

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
      {/* La misma cabecera que la ficha de la orden (27/11): se ve que se
          está DENTRO de esa orden, y no en una pantalla aparte. */}
      <CabeceraFicha
        ruta="/compras"
        volver={{ href: `/compras/${c.id}`, texto: "Volver a la orden" }}
        tipo="Editar orden de compra"
        numero={c.numero}
        quien={{ rotulo: "Proveedor", nombre: c.proveedor ?? "—" }}
      />
      <FormularioEditarOrden c={c} direccionEmpresa={emisor.direccion ?? null} />
    </div>
  );
}
