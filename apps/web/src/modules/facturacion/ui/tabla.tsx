import Link from "next/link";
import {
  Badge,
  EstadoBadge,
  EstadoError,
  EstadoVacio,
  Moneda,
  PaginacionKeyset,
} from "@rodatech/ui";

import { listarComprobantes } from "../api/consultas";
import {
  ETIQUETA_SUNAT,
  ETIQUETA_TIPO,
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
              <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
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
                    {/*
                      El tipo, al lado del número y no debajo en gris.

                      Es lo primero que hay que saber de una fila —una nota de
                      crédito no se lee como una factura— y en 12 px grises se
                      perdía. Como en el prototipo de Luis (10/09).
                    */}
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/facturacion/${c.id}`}
                        className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                      >
                        {c.numero}
                      </Link>
                      <Badge tone={c.tipo === "nota_credito" ? "warning" : "info"} size="xs">
                        {ETIQUETA_TIPO[c.tipo]}
                      </Badge>
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
                    {/*
                      El mismo badge que guías y compras.

                      La etiqueta la sigue poniendo el módulo: el catálogo dice
                      «Enviado» y aquí se llama igual, pero `pendiente` es «En
                      cola» y eso solo lo sabe facturación.
                    */}
                    <EstadoBadge
                      estado={c.estado_sunat}
                      etiqueta={ETIQUETA_SUNAT[c.estado_sunat]}
                      size="xs"
                    />
                    {c.estado === "anulado" ? (
                      <span className="ml-1.5 rounded-sm bg-[var(--danger-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--danger)]">
                        Anulado
                      </span>
                    ) : null}
                  </td>

                  {/*
                    Ver e Imprimir por fila, igual que en guías.

                    Rejilla de dos columnas fijas: con anchos libres, «Ver»
                    quedaría en una equis distinta en cada fila.
                  */}
                  <td className="px-4 py-2.5">
                    <div className="ml-auto grid w-[210px] grid-cols-[84px_1fr] gap-1.5">
                      <Link
                        href={`/facturacion/${c.id}`}
                        className={`${SECUNDARIO} w-full justify-center`}
                      >
                        <IconoVer />
                        Ver
                      </Link>
                      <Link
                        href={`/facturacion/${c.id}/imprimir?auto=1`}
                        className={`${SECUNDARIO} w-full justify-center [&>svg]:text-brand-600`}
                      >
                        <IconoImprimir />
                        Imprimir
                      </Link>
                    </div>
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
              <EstadoBadge
                estado={c.estado_sunat}
                etiqueta={ETIQUETA_SUNAT[c.estado_sunat]}
                size="xs"
              />
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
          porPagina={filtros.limite}
        />
      </div>
    </>
  );
}

/*
  Los botones de la columna de acciones.

  El ancho lo pone la rejilla de la celda y no el texto: es lo que mantiene la
  columna a plomo entre filas. Mismo patrón que en cotizaciones y guías.
*/
const SECUNDARIO =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

function IconoVer() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoImprimir() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="7" rx="1" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}
