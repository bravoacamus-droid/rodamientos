import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { transportePropioActivo } from "@/modules/transporte";

import { agenciasActivas, detalleGuia, lineasParaCorregir, motivosTraslado } from "../api/consultas";
import { estadoParaEditar } from "../dominio/constructor";
import { ConstructorGuia } from "./constructor";

/** La misma lista que `permisos_rol` tiene para `guias_remision`. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"];

/**
 * Editar un borrador de guía.
 *
 * Willy, 40:43: *«tengo que poner aquí un botón también de editar la guía,
 * para que pueda actualizar los datos… la fecha, que puede ser hoy o mañana»*.
 *
 * Desde el 14/10 es el MISMO formulario con el que se creó. Luis: *«en vez de
 * corregir, ¿no sería editar, y mandar el mismo formato como se creó la guía?
 * Más fácil»*. Había una pantalla aparte («Corregir») con otro orden y otros
 * nombres para los mismos datos; ahora se edita donde se preparó, con los
 * productos, las órdenes de compra y el transporte.
 *
 * Solo borradores. Una guía emitida ya movió stock y puede estar en manos del
 * cliente con un sello encima: eso no se edita, se anula. Se comprueba aquí,
 * lo repite la Server Action, y lo repite la base (`corregir_lineas_guia` y el
 * `update` filtrando por estado) — porque entre que se abre esta pantalla y se
 * pulsa Guardar pueden pasar minutos, y otro puede haberla emitido.
 */
export default async function PaginaEditarGuia({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil, propio, motivos, agencias] = await Promise.all([
    detalleGuia(id),
    perfilActual(),
    transportePropioActivo(),
    motivosTraslado(),
    agenciasActivas(),
  ]);

  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes editar guías"
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

  if (!g.cotizacion_id) {
    return (
      <EstadoError
        titulo="Esta guía no viene de una cotización"
        descripcion="Sus productos no se pueden editar desde aquí."
      />
    );
  }

  // Los productos con su tope: lo confirmado menos lo de las otras guías (115).
  const lineas = await lineasParaCorregir(g.id, g.cotizacion_id);
  if (!lineas.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar los productos de la guía"
        descripcion="La consulta no llegó a completarse."
        detalle={lineas.error}
      />
    );
  }

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

  return (
    <ConstructorGuia
      cotizaciones={[]}
      motivos={motivos.ok ? motivos.datos : [{ codigo: "01", descripcion: "Venta" }]}
      agencias={agencias.ok ? agencias.datos : []}
      vehiculos={propio.ok ? propio.datos.vehiculos : []}
      conductores={propio.ok ? propio.datos.conductores : []}
      hoy={hoy}
      edicion={{
        guiaId: g.id,
        numero: g.numero,
        cotizacion: { numero: g.cotizacion_numero ?? "—", cliente: g.cliente ?? "—" },
        estado: estadoParaEditar(g, lineas.datos),
      }}
    />
  );
}
