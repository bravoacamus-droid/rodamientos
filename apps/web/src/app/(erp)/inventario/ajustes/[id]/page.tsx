import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoError, formatearFecha, formatearFechaHora, formatearNumero } from "@rodatech/ui";

import { AvisoSinPermiso } from "@/componentes/sin-permiso";
import { Volver } from "@/componentes/volver";
import { PanelModulo } from "@/componentes/panel-modulo";
import { ArrowRight } from "lucide-react";
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
      {/* El patrón de ficha (27/11): número grande sobre el azul de la marca,
          el estado como pastilla y la cifra principal —lo que valió el
          ajuste— como héroe. */}
      <PanelModulo ruta="/inventario">
        <div className="flex min-w-0 flex-col gap-3">
          <Volver href="/inventario/kardex">Volver al kardex</Volver>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-base font-semibold text-[var(--fg-muted)]">Ajuste de inventario</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-mono text-3xl font-extrabold tracking-tight text-[var(--titulo)] [overflow-wrap:anywhere] sm:text-4xl">
                  {a.numero}
                </h1>
                {a.anulado ? (
                  <span className="rounded-full bg-[var(--danger-bg)] px-3 py-1 text-base font-bold text-[var(--danger)] ring-1 ring-inset ring-[var(--danger)]">
                    Anulado
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-base text-[var(--fg-muted)]">
                Del {formatearFecha(a.fecha)}
                {a.hecho_por ? `, hecho por ${a.hecho_por}` : ""} · se guardó el{" "}
                {formatearFechaHora(a.creado_en)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <span className="block text-sm font-semibold text-[var(--fg-muted)]">Valor del ajuste, al costo</span>
              <span
                className={`tabular text-3xl font-extrabold leading-tight ${
                  impacto < 0 ? "text-[var(--danger)]" : impacto > 0 ? "text-[var(--ok)]" : "text-[var(--titulo)]"
                }`}
              >
                {formatearNumero(impacto, 2)}
              </span>
            </div>
          </div>
          <span className="h-2 w-32 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
        </div>
      </PanelModulo>

      <dl className="card elev-1 grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-5">
        <Dato etiqueta="Tipo" valor={tipo} />
        <Dato etiqueta="Quién lo hizo" valor={a.hecho_por ?? "Sin persona (cargado por el sistema)"} />
        <Dato etiqueta="Motivo" valor={a.motivo ?? "Sin motivo escrito"} />
      </dl>

      <section className="card elev-1 @container">
        <h2 className="px-4 pt-4 text-xl font-bold">
          {a.lineas.length} {a.lineas.length === 1 ? "producto" : "productos"}
        </h2>

        {/* En el teléfono, una tarjeta por producto; la tabla pide más ancho. */}
        <ul className="flex flex-col gap-2.5 p-3 @3xl:hidden">
          {a.lineas.map((l) => (
            <li key={l.producto_id} className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-base">
              <span className="font-mono text-lg font-bold text-[var(--titulo)] [overflow-wrap:anywhere]">{l.codigo}</span>
              <p className="text-[var(--fg-muted)]">{l.descripcion}</p>
              <Link href={`/productos/${l.producto_id}`} className="boton-fila w-fit">
                Ver producto
                <ArrowRight aria-hidden="true" />
              </Link>
              <p className="tabular">
                Había {cantidad(l.cantidad_sistema)} · se contaron{" "}
                {cantidad(l.cantidad_fisica)} ·{" "}
                <Diferencia valor={l.diferencia} />
              </p>
            </li>
          ))}
        </ul>

        <div className="hidden scroll-x @3xl:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="cabecera-tabla">
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
                  <td className="px-4 py-2.5 text-right tabular">{cantidad(l.cantidad_sistema)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{cantidad(l.cantidad_fisica)}</td>
                  <td className="px-4 py-2.5 text-right tabular">
                    <Diferencia valor={l.diferencia} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{formatearNumero(l.costo_unitario, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t border-[var(--border-soft)] px-4 py-3 text-base">
          Valor del ajuste, al costo:{" "}
          <span className="font-bold tabular">{formatearNumero(impacto, 2)}</span>
        </p>
      </section>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="etiqueta-dato">{etiqueta}</dt>
      <dd className="mt-1 break-words text-base font-semibold">{valor}</dd>
    </div>
  );
}

/**
 * Una cantidad con los decimales que tenga: hay 30 productos en metros, y
 * 2,5 m redondeado a entero se leería «faltaron 3».
 */
function cantidad(v: number): string {
  return formatearNumero(v, Number.isInteger(v) ? 0 : 2);
}

/** «+3» en verde, «−2» en rojo: sobró o faltó. */
function Diferencia({ valor }: { valor: number }) {
  if (valor === 0) return <span>sin diferencia</span>;
  return (
    <span className={`font-semibold ${valor > 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
      {valor > 0 ? `sobraron ${cantidad(valor)}` : `faltaron ${cantidad(-valor)}`}
    </span>
  );
}
