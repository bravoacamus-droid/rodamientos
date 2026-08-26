import Link from "next/link";
import { EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";

import { listarCotizaciones } from "../api/consultas";
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  RIEL_ESTADO,
  type CotizacionLista,
  type FiltrosCotizaciones,
} from "../dominio/tipos";

/**
 * Listado de cotizaciones.
 *
 * Dos decisiones de forma que vale la pena explicar:
 *
 * 1. **El riel de estado.** Tres píxeles de color a la izquierda de cada fila.
 *    En una lista larga el ojo encuentra las azules —las enviadas, las que
 *    esperan respuesta— sin leer una palabra. La pastilla de Estado sigue ahí
 *    para quien necesite el nombre exacto, pero deja de ser lo que hay que
 *    escanear.
 *
 * 2. **Todo número va en cifras tabulares y todo código en monoespaciada.** No
 *    es estética: es lo que hace que dos totales se comparen mirando la
 *    columna, y que `COT1-000009` y `COT1-000010` ocupen lo mismo. En un
 *    catálogo de rodamientos, donde el código ES el producto, alinear importa.
 *
 * En móvil no es una tabla. Ocho columnas en un teléfono no se leen ni con
 * scroll, así que por debajo de `md` cada cotización es una tarjeta con el
 * mismo riel en el borde.
 */
export async function TablaCotizaciones({
  filtros,
}: {
  filtros: FiltrosCotizaciones;
}) {
  const resultado = await listarCotizaciones(filtros);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las cotizaciones"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(filtros.q || filtros.estado || filtros.cliente);
    return (
      <EstadoVacio
        titulo={filtrando ? "Ninguna cotización coincide" : "Todavía no hay cotizaciones"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por número u orden de compra."
            : "Crea la primera y aquí verás su número, su margen y en qué estado quedó."
        }
        accion={
          filtrando ? undefined : (
            <Link
              href="/cotizaciones/nueva"
              className="rounded-sm bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Nueva cotización
            </Link>
          )
        }
      />
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const vencida = (c: CotizacionLista) =>
    c.estado === "enviada" && c.fecha_vencimiento < hoy;

  return (
    <>
      {/* --------------------------------------------------- Escritorio */}
      <div className="scroll-x hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="w-1 p-0">
                <span className="sr-only">Estado</span>
              </th>
              <th className="py-2.5 pl-3 pr-4 font-medium">Número</th>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">O/C</th>
              <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">
                Ítems
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Margen</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr
                key={c.id}
                className="group border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)]"
              >
                <td className="w-1 p-0">
                  <span
                    aria-hidden="true"
                    className={`block h-9 w-[3px] rounded-r-sm ${RIEL_ESTADO[c.estado]}`}
                  />
                </td>

                <td className="py-2.5 pl-3 pr-4">
                  <Link
                    href={`/cotizaciones/${c.id}`}
                    className="font-mono text-[0.8rem] font-semibold text-brand-700 group-hover:underline"
                  >
                    {c.numero}
                  </Link>
                </td>

                <td className="whitespace-nowrap px-4 py-2.5 tabular">
                  {fechaCorta(c.fecha)}
                  {vencida(c) ? (
                    <span className="ml-1.5 rounded-sm bg-[var(--warn-bg)] px-1 py-0.5 text-xs font-medium text-[var(--warn)]">
                      vencida
                    </span>
                  ) : null}
                </td>

                <td className="max-w-xs px-4 py-2.5">
                  <span className="block truncate">{c.cliente}</span>
                  {c.cliente_documento ? (
                    <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                      {c.cliente_documento}
                    </span>
                  ) : null}
                </td>

                <td className="hidden px-4 py-2.5 font-mono text-xs text-[var(--fg-muted)] lg:table-cell">
                  {c.orden_compra_cliente ?? "—"}
                </td>
                <td className="hidden px-4 py-2.5 text-right tabular text-[var(--fg-muted)] lg:table-cell">
                  {c.items}
                </td>

                <td className="px-4 py-2.5 text-right">
                  <Moneda valor={c.total} tamano="sm" enfasis="fuerte" />
                </td>

                <td className="px-4 py-2.5 text-right">
                  <Margen valor={c.margen_pct} />
                </td>

                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block rounded-sm px-1.5 py-0.5 text-xs font-medium ${COLOR_ESTADO[c.estado]}`}
                  >
                    {ETIQUETA_ESTADO[c.estado]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --------------------------------------------------------- Móvil */}
      <ul className="flex flex-col gap-2 px-3 py-1 md:hidden">
        {filas.map((c) => (
          <li key={c.id} className="flex overflow-hidden rounded-md border border-[var(--border)]">
            <span
              aria-hidden="true"
              className={`w-1 shrink-0 ${RIEL_ESTADO[c.estado]}`}
            />
            <Link href={`/cotizaciones/${c.id}`} className="min-w-0 flex-1 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-brand-700">
                  {c.numero}
                </span>
                <Moneda valor={c.total} tamano="sm" enfasis="fuerte" />
              </div>

              <p className="mt-0.5 truncate text-sm">{c.cliente}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span
                  className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${COLOR_ESTADO[c.estado]}`}
                >
                  {ETIQUETA_ESTADO[c.estado]}
                </span>
                <span className="tabular text-[var(--fg-muted)]">
                  {fechaCorta(c.fecha)}
                </span>
                {vencida(c) ? (
                  <span className="text-[var(--warn)]">vencida</span>
                ) : null}
                <span className="ml-auto">
                  <Margen valor={c.margen_pct} />
                </span>
              </div>
            </Link>
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

/**
 * El margen.
 *
 * Es el número por el que Willy abre esta pantalla, así que se pinta con
 * color y no en gris pequeño: por debajo de 10 % la operación casi no deja
 * nada, y entre 10 y 15 conviene mirarla. Sin costo cargado se pone una raya,
 * no un cero: «no se sabe» y «cero» no son lo mismo.
 */
function Margen({ valor }: { valor: number }) {
  if (valor <= 0) {
    return <span className="tabular text-[var(--fg-subtle)]">—</span>;
  }
  // Los cortes son sobre el COSTO (023): 12 y 20 son el equivalente de los
  // 10 y 15 que había cuando el denominador era la venta, y el 20 coincide
  // con el objetivo que trae la plantilla de productos.
  const tono =
    valor < 12
      ? "text-[var(--danger)]"
      : valor < 20
        ? "text-[var(--warn)]"
        : "text-[var(--ok)]";
  return (
    <span className={`tabular font-medium ${tono}`}>{valor.toFixed(1)}%</span>
  );
}

/** Fecha corta en formato peruano, sin depender de la zona del servidor. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a.slice(2)}` : iso;
}
