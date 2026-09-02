import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, EstadoVacio, formatearFecha } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";
import { MessageCircleQuestion } from "lucide-react";

import { rondas } from "../../api/comparador";

/** La misma lista que `permisos_rol` tiene para `compras`. */
const ROLES = ["gerencia", "admin", "compras"];

/**
 * Las consultas de precios.
 *
 * Es el paso 5 del plan de compras: el comparador. Willy pregunta por WhatsApp
 * y le contestan por WhatsApp; esto no manda nada — es la hoja donde apunta lo
 * que le dijeron, ve quién gana cada producto y convierte eso en compras.
 *
 * La lista existe por una razón concreta: **una ronda dura días**. Se pregunta
 * el lunes, uno contesta el lunes, otro el miércoles y el tercero no contesta.
 * Sin un sitio donde vuelvan a aparecer, lo apuntado el lunes se pierde.
 */
export default async function PaginaPrecios() {
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

  const r = await rondas();
  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudieron leer las consultas"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }

  const filas = r.datos;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Precios de proveedores</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Lo que preguntaste, lo que te contestaron y quién sale mejor.
          </p>
        </div>
        <Link
          href="/compras/por-comprar"
          className="inline-flex h-9 items-center rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          Pedir precios de lo que falta
        </Link>
      </div>

      {filas.length === 0 ? (
        <EstadoVacio
          icono={<MessageCircleQuestion className="size-8" />}
          titulo="Todavía no has pedido ningún precio"
          descripcion="Desde «Por comprar» eliges los productos, se genera el mensaje de WhatsApp para cada proveedor y aquí vas apuntando lo que te contesten."
          accion={
            <Link
              href="/compras/por-comprar"
              className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Ir a «Por comprar»
            </Link>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Consulta</th>
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Para</th>
                  <th className="px-4 py-2.5 text-right font-medium">Productos</th>
                  <th className="px-4 py-2.5 text-right font-medium">Contestaron</th>
                  <th className="px-4 py-2.5 font-medium">En qué quedó</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/compras/precios/${f.id}`}
                        className="font-medium tabular-nums underline-offset-2 hover:underline"
                      >
                        {f.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--fg-muted)]">
                      {formatearFecha(f.fecha)}
                    </td>
                    <td className="max-w-[22rem] truncate px-4 py-2.5 text-[var(--fg-muted)]">
                      {f.nota ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{f.productos}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {/* Los dos números juntos, porque el que importa es la
                          resta: «2 de 4» dice que faltan dos por perseguir. */}
                      <span className={f.contestaron === 0 ? "text-[var(--fg-subtle)]" : ""}>
                        {f.contestaron} de {f.preguntados}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Desenlace
                        estado={f.estado}
                        compras={f.compras}
                        contestaron={f.contestaron}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * En qué acabó la ronda.
 *
 * No es el estado a secas: «abierta» no le dice nada a nadie. Lo que hace
 * falta saber al mirar la lista es si hay algo que perseguir hoy.
 */
function Desenlace({
  estado,
  compras,
  contestaron,
}: {
  estado: "abierta" | "cerrada" | "anulada";
  compras: number;
  contestaron: number;
}) {
  if (estado === "anulada") {
    return <span className="text-[var(--fg-subtle)]">Anulada</span>;
  }
  if (compras > 0) {
    return (
      <span className="text-[var(--ok)]">
        {compras === 1 ? "1 compra" : `${compras} compras`}
      </span>
    );
  }
  if (estado === "cerrada") {
    return <span className="text-[var(--fg-subtle)]">Cerrada sin comprar</span>;
  }
  if (contestaron === 0) {
    return <span className="text-[var(--warn)]">Nadie ha contestado</span>;
  }
  return <span>Falta decidir</span>;
}
