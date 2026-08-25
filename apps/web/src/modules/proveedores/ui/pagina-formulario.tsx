import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { detalleProveedor, marcasDisponibles } from "../api/consultas";
import { FormularioProveedor } from "./formulario";

const ROLES = ["gerencia", "admin", "compras"];

/**
 * Alta y edición de un proveedor.
 *
 * Una sola pantalla para los dos casos: la diferencia es si llega `id`. Tener
 * dos habría significado dos sitios donde arreglar el mismo campo.
 */
export default async function PaginaFormularioProveedor({
  params,
}: {
  /** Sin `params` en el alta; con `{ id }` en la edición. */
  params?: Promise<{ id: string }>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes mantener el maestro de proveedores"
        descripcion="Tu rol no tiene permiso para dar de alta ni editar proveedores. Habla con Gerencia si crees que debería."
      />
    );
  }

  const id = params ? (await params).id : null;

  const [detalle, marcas] = await Promise.all([
    id ? detalleProveedor(id) : Promise.resolve(null),
    marcasDisponibles(),
  ]);

  if (detalle && !detalle.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el proveedor"
        descripcion="La consulta no llegó a completarse."
        detalle={detalle.error}
      />
    );
  }
  if (detalle && detalle.ok && !detalle.datos) notFound();

  return (
    <FormularioProveedor
      inicial={detalle?.ok ? detalle.datos : null}
      // Que fallen las marcas no impide dar de alta: se guarda sin ellas y se
      // añaden después desde la edición.
      marcas={marcas.ok ? marcas.datos : []}
    />
  );
}
