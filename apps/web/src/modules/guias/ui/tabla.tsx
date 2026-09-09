import Link from "next/link";
import { Badge, EstadoError, EstadoVacio, PaginacionKeyset } from "@rodatech/ui";

import { listarGuias } from "../api/consultas";
import { ETIQUETA_ESTADO, TONO_ESTADO, type FiltrosGuias } from "../dominio/tipos";

/**
 * Listado de guías.
 *
 * El peso va en su propia columna, no escondido en la ficha: es el dato que
 * Willy llamó «lo más importante» (02:46), porque es lo que el transportista
 * necesita antes de cargar.
 */
export async function TablaGuias({ filtros }: { filtros: FiltrosGuias }) {
  const resultado = await listarGuias(filtros);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las guías"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(
      filtros.q || filtros.cliente || filtros.estado || filtros.desde || filtros.hasta,
    );
    return (
      <EstadoVacio
        titulo={filtrando ? "Ninguna guía coincide" : "Todavía no hay guías"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por número, dirección o placa."
            : "La guía acompaña la mercadería cuando sale del almacén, y es lo que descarga el stock. Se prepara desde una cotización aprobada."
        }
      />
    );
  }

  return (
    <>
      {/* ------------------------------------------------ Escritorio */}
      <div className="scroll-x hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Número</th>
              <th className="px-4 py-2.5 font-medium">Traslado</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Entrega</th>
              <th className="px-4 py-2.5 text-right font-medium">Bultos</th>
              <th className="px-4 py-2.5 text-right font-medium">Peso</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((g, i) => (
              <tr
                key={g.id}
                className={`anim-entrada border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                  g.estado === "anulada" ? "opacity-60" : ""
                }`}
                style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/guias/${g.id}`}
                    className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                  >
                    {g.numero}
                  </Link>
                  {g.cotizacion_numero ? (
                    <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                      {g.cotizacion_numero}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular">
                  {g.fecha_traslado}
                  <span className="block text-xs text-[var(--fg-subtle)]">
                    {g.motivo ?? "—"}
                  </span>
                </td>
                {/* El RUC bajo el nombre: dos clientes se llaman casi igual, y
                    en una guía equivocarse de destinatario es un viaje
                    perdido. */}
                <td className="max-w-xs px-4 py-2.5">
                  <span className="block truncate font-medium">{g.cliente ?? "—"}</span>
                  {g.cliente_documento ? (
                    <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                      {g.cliente_documento}
                    </span>
                  ) : null}
                </td>
                <td className="hidden max-w-xs px-4 py-2.5 text-sm text-[var(--fg-muted)] lg:table-cell">
                  <span className="block truncate">{g.direccion_llegada ?? "—"}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular">{g.numero_bultos}</td>
                <td className="px-4 py-2.5 text-right tabular">
                  {g.peso_bruto_kg.toFixed(3)}
                  <span className="ml-1 text-xs text-[var(--fg-subtle)]">kg</span>
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={TONO_ESTADO[g.estado]} size="xs">
                    {ETIQUETA_ESTADO[g.estado]}
                  </Badge>
                </td>

                {/*
                  Ver e Imprimir por fila.

                  Rejilla de dos columnas fijas: si cada botón midiera lo que
                  mide su texto, «Ver» quedaría en una equis distinta en cada
                  fila. Es el mismo arreglo que en cotizaciones.

                  Imprimir sale de la lista y va directo a la hoja con la
                  ventana abierta (`auto=1`): el almacén saca la guía y la mete
                  en la caja sin entrar a la ficha.
                */}
                <td className="px-4 py-2.5">
                  <div className="ml-auto grid w-[210px] grid-cols-[84px_1fr] gap-1.5">
                    <Link href={`/guias/${g.id}`} className={`${SECUNDARIO} w-full justify-center`}>
                      <IconoVer />
                      Ver
                    </Link>
                    <Link
                      href={`/guias/${g.id}/imprimir?auto=1`}
                      className={`${SECUNDARIO} w-full justify-center`}
                    >
                      <IconoImprimir />
                      Imprimir
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------- Móvil */}
      <ul className="flex flex-col divide-y divide-[var(--border-soft)] md:hidden">
        {filas.map((g, i) => (
          <li
            key={g.id}
            className={`anim-entrada px-3 py-3 ${g.estado === "anulada" ? "opacity-60" : ""}`}
            style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <Link
                href={`/guias/${g.id}`}
                className="font-mono text-sm font-semibold text-brand-600"
              >
                {g.numero}
              </Link>
              <span className="tabular text-xs text-[var(--fg-muted)]">
                {g.fecha_traslado}
              </span>
            </div>

            <p className="mt-0.5 line-clamp-1 text-sm">{g.cliente ?? "—"}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Badge tone={TONO_ESTADO[g.estado]} size="xs">
                {ETIQUETA_ESTADO[g.estado]}
              </Badge>
              <span className="tabular text-[var(--fg-muted)]">
                {g.peso_bruto_kg.toFixed(3)} kg · {g.numero_bultos}{" "}
                {g.numero_bultos === 1 ? "bulto" : "bultos"}
              </span>
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

/*
  Los botones de la columna de acciones.

  Ancho de rejilla fijo en la celda y `w-full` aquí: si cada botón midiera lo
  que mide su texto, «Ver» quedaría en una equis distinta en cada fila y la
  columna saldría en escalera. Es el mismo arreglo que en cotizaciones.
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
