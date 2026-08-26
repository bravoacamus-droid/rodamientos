import Link from "next/link";
import { Badge, EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";

import { listarComprobantes } from "../api/consultas";
import {
  ETIQUETA_SUNAT,
  ETIQUETA_TIPO,
  TONO_SUNAT,
  type FiltrosComprobantes,
} from "../dominio/tipos";

/**
 * Listado de comprobantes.
 *
 * Dos estados por fila y no uno, porque son dos cosas distintas que se
 * confunden a diario: el estado COMERCIAL (si está cobrado) y el estado ante
 * SUNAT (si está aceptado). Una factura puede estar pagada y rechazada a la
 * vez, y esa combinación es justo la que hay que ver.
 *
 * En móvil no es tabla: nueve columnas en un teléfono no se leen ni con scroll.
 */
export async function TablaComprobantes({
  filtros,
}: {
  filtros: FiltrosComprobantes;
}) {
  const resultado = await listarComprobantes(filtros);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar los comprobantes"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(
      filtros.q || filtros.cliente || filtros.tipo || filtros.estado ||
      filtros.sunat || filtros.desde || filtros.hasta,
    );
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún comprobante coincide" : "Todavía no se ha facturado"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por el número del documento."
            : "Los comprobantes nacen de una cotización aprobada. Aprueba una y factúrala desde aquí."
        }
      />
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* ------------------------------------------------ Escritorio */}
      <div className="scroll-x hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Documento</th>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Cotización</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
              <th className="px-4 py-2.5 font-medium">SUNAT</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c, i) => {
              const vencida =
                c.saldo > 0 &&
                c.fecha_vencimiento !== null &&
                c.fecha_vencimiento < hoy &&
                c.estado !== "anulado";

              return (
                <tr
                  key={c.id}
                  // Entrada escalonada. El retraso se corta a la sexta fila: más
                  // allá el usuario ya está leyendo y una fila que aparece tarde
                  // distrae en vez de guiar.
                  className={`anim-entrada border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                    c.estado === "anulado" ? "opacity-60" : ""
                  }`}
                  style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/facturacion/${c.id}`}
                      className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                    >
                      {c.numero}
                    </Link>
                    <span className="block text-xs text-[var(--fg-subtle)]">
                      {ETIQUETA_TIPO[c.tipo]}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-4 py-2.5 tabular">
                    {c.fecha_emision}
                    {c.fecha_vencimiento ? (
                      <span
                        className={`block text-xs ${
                          vencida ? "font-medium text-[var(--danger)]" : "text-[var(--fg-subtle)]"
                        }`}
                      >
                        vence {c.fecha_vencimiento}
                      </span>
                    ) : null}
                  </td>

                  <td className="max-w-xs px-4 py-2.5">
                    <span className="block truncate">{c.cliente ?? "—"}</span>
                    <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                      {c.cliente_documento ?? ""}
                    </span>
                  </td>

                  <td className="hidden px-4 py-2.5 font-mono text-xs text-[var(--fg-muted)] lg:table-cell">
                    {c.cotizacion_numero ?? "—"}
                  </td>

                  <td className="px-4 py-2.5 text-right">
                    <Moneda valor={c.total} tamano="sm" />
                  </td>

                  <td className="px-4 py-2.5 text-right">
                    {c.saldo <= 0 ? (
                      <span className="text-xs font-medium text-[var(--ok)]">Cobrado</span>
                    ) : (
                      <span className={vencida ? "text-[var(--danger)]" : ""}>
                        <Moneda valor={c.saldo} tamano="sm" />
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-2.5">
                    <Badge tone={TONO_SUNAT[c.estado_sunat]} size="xs">
                      {ETIQUETA_SUNAT[c.estado_sunat]}
                    </Badge>
                    {c.estado === "anulado" ? (
                      <span className="ml-1.5 rounded-sm bg-[var(--danger-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--danger)]">
                        Anulado
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------- Móvil */}
      <ul className="flex flex-col divide-y divide-[var(--border-soft)] md:hidden">
        {filas.map((c, i) => (
          <li
            key={c.id}
            className={`anim-entrada px-3 py-3 ${c.estado === "anulado" ? "opacity-60" : ""}`}
            style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <Link
                href={`/facturacion/${c.id}`}
                className="font-mono text-sm font-semibold text-brand-600"
              >
                {c.numero}
              </Link>
              <span className="tabular text-xs text-[var(--fg-muted)]">
                {c.fecha_emision}
              </span>
            </div>

            <p className="mt-0.5 line-clamp-1 text-sm">{c.cliente ?? "—"}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Badge tone={TONO_SUNAT[c.estado_sunat]} size="xs">
                {ETIQUETA_SUNAT[c.estado_sunat]}
              </Badge>
              <Moneda valor={c.total} tamano="sm" />
              {c.saldo > 0 ? (
                <span className="text-[var(--fg-muted)]">
                  debe {c.saldo.toFixed(2)}
                </span>
              ) : (
                <span className="font-medium text-[var(--ok)]">Cobrado</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="px-3 py-3 sm:px-4">
        <PaginacionKeyset
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={null}
        />
      </div>
    </>
  );
}
