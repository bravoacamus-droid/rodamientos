import { Volver } from "@/componentes/volver";
import { redirect } from "next/navigation";
import { EstadoError, formatearFecha } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { referenciasDeRonda, rondaDetalle } from "../../api/comparador";
import { proveedoresParaPedir } from "@/modules/proveedores";

import { hojaDeConsulta, productosRecientes } from "../../api/hoja-precios";
import { HojaPrecios } from "../hoja-precios/hoja";
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

  /*
    Abierta: la hoja (07/10), donde se sigue apuntando y se decide. Cerrada:
    la comparativa de siempre, que enseña las compras que salieron y deja
    ajustar el precio de venta. Luis: *«tiene que ser sencillo»* — mientras
    se pregunta, una sola pantalla.
  */
  if (ronda.estado === "abierta") {
    const [cargada, proveedores, recientes] = await Promise.all([
      hojaDeConsulta(ronda.id),
      proveedoresParaPedir(ronda.items.map((i) => i.producto_id)),
      productosRecientes(6),
    ]);
    if (!cargada.ok) {
      return <EstadoError titulo="No se pudo abrir la hoja" detalle={cargada.error} />;
    }
    return (
      <div className="flex flex-col gap-5">
        <div>
          <Volver href="/compras/precios">Volver a pedir precios</Volver>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{ronda.numero}</h1>
          <p className="text-base text-[var(--fg-muted)]">
            {formatearFecha(ronda.fecha)} · apunta lo que te diga cada uno; cuando lo decidas, «Pasar a compras».
          </p>
        </div>
        <HojaPrecios
          inicial={cargada.datos.hoja}
          recientes={recientes}
          sugeridos={(proveedores.ok ? proveedores.datos : [])
            .filter((p) => p.coincidencias > 0)
            .map((p) => ({ proveedorId: p.id, nombre: p.razon_social, coincidencias: p.coincidencias }))}
        />
      </div>
    );
  }

  // Contra qué se compara cada precio. Va aquí y no dentro de la rejilla
  // porque hace tres consultas y la rejilla es un componente de cliente: si
  // falla, la pantalla sigue sirviendo —se apunta igual, sin referencia— así
  // que un error aquí no puede tumbar la ronda entera.
  const ref = await referenciasDeRonda(
    ronda.items.map((i) => i.producto_id),
    ronda.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* El «Volver» de las demás fichas. Era un enlace gris en
              mayúsculas encima del número, que no parece un botón
              (revisión por módulos del 02/10). */}
          <Volver href="/compras/precios">Volver a pedir precios</Volver>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {ronda.numero}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {formatearFecha(ronda.fecha)}
            {ronda.nota ? ` · ${ronda.nota}` : ""}
          </p>
        </div>
      </div>

      <Comparativa ronda={ronda} referencias={ref.ok ? ref.datos : {}} />
    </div>
  );
}
