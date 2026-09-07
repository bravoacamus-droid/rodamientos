import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { transportePropioActivo } from "@/modules/transporte";

import { detalleGuia } from "../api/consultas";
import { EditorGuia } from "./editor-guia";

/** La misma lista que `permisos_rol` tiene para `guias_remision`. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"];

/**
 * Corregir un borrador de guía.
 *
 * Willy, 40:43: *«tengo que poner aquí un botón también de editar la guía,
 * para que pueda actualizar los datos… la fecha, que puede ser hoy o mañana»*.
 *
 * Solo borradores. Una guía emitida ya movió stock y puede estar en manos del
 * cliente con un sello encima: eso no se corrige, se anula. Se comprueba aquí,
 * lo repite la Server Action, y lo repite el `update` filtrando por estado —
 * porque entre que se abre esta pantalla y se pulsa Guardar pueden pasar
 * minutos, y otro puede haberla emitido.
 */
export default async function PaginaEditarGuia({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil, propio] = await Promise.all([
    detalleGuia(id),
    perfilActual(),
    transportePropioActivo(),
  ]);

  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes corregir guías"
        descripcion="Tu rol no tiene permiso para despachar mercadería. Habla con Gerencia si crees que debería."
      />
    );
  }

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

  // Emitida o anulada: se vuelve a la ficha en vez de enseñar un formulario
  // que no va a guardar. Un formulario que rebota al final es peor que no
  // dejar entrar.
  if (g.estado !== "borrador") redirect(`/guias/${g.id}`);

  return (
    <EditorGuia
      guia={g}
      vehiculos={propio.ok ? propio.datos.vehiculos : []}
      conductores={propio.ok ? propio.datos.conductores : []}
    />
  );
}
