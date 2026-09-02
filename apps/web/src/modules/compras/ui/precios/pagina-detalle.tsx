import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, formatearFecha } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { rondaDetalle } from "../../api/comparador";
import { Comparativa } from "./comparativa";

/** La misma lista que `permisos_rol` tiene para `compras`. */
const ROLES = ["gerencia", "admin", "compras"];

/**
 * Una consulta de precios: la rejilla.
 *
 * Todo lo que decide algo pasa en el cliente —se escribe un precio y el
 * ganador cambia delante— así que aquí solo se carga la ronda entera. Es una
 * sola pantalla y no un asistente por pasos a propósito: las respuestas no
 * llegan en orden, llegan cuando cada uno contesta.
 */
export default async function PaginaComparativa({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes ver las consultas de precios"
        descripcion="Tu rol no tiene permiso para las compras. Habla con Gerencia si crees que debería."
      />
    );
  }

  const { id } = await params;
  const r = await rondaDetalle(id);

  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudo abrir la consulta"
        descripcion="Puede que se haya borrado, o que la consulta no llegara a completarse."
        detalle={r.error}
      />
    );
  }

  const ronda = r.datos;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
            <Link href="/compras/precios" className="underline-offset-2 hover:underline">
              Precios de proveedores
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
            {ronda.numero}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {formatearFecha(ronda.fecha)}
            {ronda.nota ? ` · ${ronda.nota}` : ""}
          </p>
        </div>
      </div>

      <Comparativa ronda={ronda} />
    </div>
  );
}
