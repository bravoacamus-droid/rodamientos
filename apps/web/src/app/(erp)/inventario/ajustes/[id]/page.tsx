import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoError, formatearFecha, formatearFechaHora, formatearNumero } from "@rodatech/ui";

import { AvisoSinPermiso } from "@/componentes/sin-permiso";
import { Volver } from "@/componentes/volver";
import { sinPermiso } from "@/lib/permisos";
import { detalleAjuste } from "@/modules/inventario/api/ajuste";
import { TIPOS_AJUSTE } from "@/modules/inventario";

export const metadata: Metadata = { title: "Ajuste de inventario" };

/**
 * Ficha de un ajuste de inventario, de solo lectura (TR-12, 27/10).
 *
 * Fecha, quién, por qué y qué cambió en cada producto. No hay botón de
 * editar: el ajuste ya movió el kardex, y lo que se corrige se corrige con
 * otro ajuste, que deja su propio rastro.
 *
 * Distinta de `/inventario/ajuste` (singular), que es el formulario para hacer
 * uno nuevo: por eso el kardex no enlazaba los ajustes.
 */
export default async function PaginaFichaAjuste({ params }: { params: Promise<{ id: string }> }) {
  const prohibido = await sinPermiso("almacen", "ver");
  if (prohibido) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">No puedes ver este ajuste</h1>
        <AvisoSinPermiso mensaje={prohibido} />
      </div>
    );
  }

  const { id } = await params;
  const r = await detalleAjuste(id);
  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el ajuste"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }
  if (!r.datos) notFound();

  const a = r.datos;
  const tipo = TIPOS_AJUSTE.find((t) => t.valor === a.tipo)?.etiqueta ?? a.tipo;
  const impacto = a.lineas.reduce((s, l) => s + l.diferencia * l.costo_unitario, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Volver href="/inventario/kardex">Volver al kardex</Volver>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{a.numero}</h1>
          {a.anulado ? (
            <span className="rounded-sm bg-[var(--danger-bg)] px-2 py-0.5 text-sm font-medium text-[var(--danger)]">
              Anulado
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[var(--fg-muted)]">
          Ajuste de inventario del {formatearFecha(a.fecha)}
          {a.hecho_por ? `, hecho por ${a.hecho_por}` : ""} · se guardó el{" "}
          {formatearFechaHora(a.creado_en)}
        </p>
      </div>

      <section className="card grid gap-4 p-4 sm:grid-cols-3">
        <Dato etiqueta="Tipo" valor={tipo} />
        <Dato etiqueta="Quién lo hizo" valor={a.hecho_por ?? "Sin persona (cargado por el sistema)"} />
        <Dato etiqueta="Motivo" valor={a.motivo ?? "—"} />
      </section>

      <section className="card @container">
        <h2 className="px-4 pt-4 text-sm font-semibold">
          {a.lineas.length} {a.lineas.length === 1 ? "producto" : "productos"}
        </h2>

        {/* En el teléfono, una tarjeta por producto; la tabla pide más ancho. */}
        <ul className="flex flex-col gap-2.5 p-3 @3xl:hidden">
          {a.lineas.map((l) => (
            <li key={l.producto_id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
              <Link
                href={`/productos/${l.producto_id}`}
                className="font-mono font-medium text-brand-600 underline underline-offset-2"
              >
                {l.codigo}
              </Link>
              <p className="mt-0.5 text-[var(--fg-muted)]">{l.descripcion}</p>
              <p className="mt-1.5 tabular">
                Había {formatearNumero(l.cantidad_sistema, 0)} · se contaron{" "}
                {formatearNumero(l.cantidad_fisica, 0)} ·{" "}
                <Diferencia valor={l.diferencia} />
              </p>
            </li>
          ))}
        </ul>

        <div className="hidden scroll-x @3xl:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-4 py-2.5 text-right font-medium">Había</th>
                <th className="px-4 py-2.5 text-right font-medium">Se contaron</th>
                <th className="px-4 py-2.5 text-right font-medium">Diferencia</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo unitario</th>
              </tr>
            </thead>
            <tbody>
              {a.lineas.map((l) => (
                <tr key={l.producto_id} className="border-b border-[var(--border-soft)]">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/productos/${l.producto_id}`}
                      className="font-mono font-medium text-brand-600 underline underline-offset-2"
                    >
                      {l.codigo}
                    </Link>
                    <span className="ml-2 text-[var(--fg-muted)]">{l.descripcion}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{formatearNumero(l.cantidad_sistema, 0)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{formatearNumero(l.cantidad_fisica, 0)}</td>
                  <td className="px-4 py-2.5 text-right tabular">
                    <Diferencia valor={l.diferencia} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{formatearNumero(l.costo_unitario, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t border-[var(--border-soft)] px-4 py-3 text-sm">
          Valor del ajuste, al costo:{" "}
          <span className="font-semibold tabular">{formatearNumero(impacto, 2)}</span>
        </p>
      </section>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-sm uppercase tracking-wide text-[var(--fg-subtle)]">{etiqueta}</dt>
      <dd className="mt-1 text-sm font-medium">{valor}</dd>
    </div>
  );
}

/** «+3» en verde, «−2» en rojo: sobró o faltó. */
function Diferencia({ valor }: { valor: number }) {
  if (valor === 0) return <span>sin diferencia</span>;
  return (
    <span className={`font-semibold ${valor > 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
      {valor > 0 ? `sobraron ${formatearNumero(valor, 0)}` : `faltaron ${formatearNumero(-valor, 0)}`}
    </span>
  );
}
