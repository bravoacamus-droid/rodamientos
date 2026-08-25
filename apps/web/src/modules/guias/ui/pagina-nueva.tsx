import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, EstadoVacio } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { cotizacionesDespachables, motivosTraslado } from "../api/consultas";
import { ConstructorGuia } from "./constructor";

/** La misma lista que `permisos_rol` tiene para `guias_remision`. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"];

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Pantalla de preparación de una guía.
 *
 * La fecha se calcula en el servidor con la zona de Lima: la fecha de traslado
 * va en un documento que puede parar un control de SUNAT en carretera, así que
 * no puede depender del reloj del equipo del almacén.
 */
export default async function PaginaNuevaGuia({ searchParams }: Props) {
  const sp = await searchParams;
  const crudo = Array.isArray(sp.cotizacion) ? sp.cotizacion[0] : sp.cotizacion;

  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes preparar guías"
        descripcion="Tu rol no tiene permiso para despachar mercadería. Habla con Gerencia si crees que debería."
      />
    );
  }

  const [cotizaciones, motivos] = await Promise.all([
    cotizacionesDespachables(),
    motivosTraslado(),
  ]);

  if (!cotizaciones.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las cotizaciones"
        descripcion="Sin ellas no hay de dónde despachar."
        detalle={cotizaciones.error}
      />
    );
  }

  if (cotizaciones.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay nada pendiente de despachar"
        descripcion="Una guía sale de una cotización aprobada con mercadería que todavía no ha salido del almacén."
        accion={
          <Link
            href="/cotizaciones"
            className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Ver cotizaciones
          </Link>
        }
      />
    );
  }

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  return (
    <ConstructorGuia
      cotizaciones={cotizaciones.datos}
      // Si el catálogo de motivos fallara, «Venta» es el 99 % de los casos y
      // permite seguir trabajando en vez de dejar la pantalla inservible.
      motivos={motivos.ok ? motivos.datos : [{ codigo: "01", descripcion: "Venta" }]}
      hoy={hoy}
      cotizacionInicial={crudo && crudo.length > 0 ? crudo : null}
    />
  );
}
