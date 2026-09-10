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
 * 3. **La columna de acciones.** Hasta hoy la única forma de entrar en una
 *    cotización era pulsar su número —texto azul de 13 px—, y para editar un
 *    borrador había que entrar antes a verlo. Luis, 08/09: *«una persona que
 *    no sabe que tiene que darle click ahí»*. Ahora cada fila lleva **Ver** y,
 *    cuando toca, el paso siguiente: editar si el cliente todavía no la ha
 *    aceptado, facturar si ya la aceptó.
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
              <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
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

                {/*
                  Rejilla de dos columnas FIJAS, no una fila que se encoge.

                  Con `flex` cada botón medía lo que medía su texto, así que
                  «Editar» y «Facturar» dejaban el «Ver» de su fila en una
                  equis distinta y la columna salía en escalera. Luis, 08/09:
                  *«los botones no cuadran»*.

                  Las dos columnas miden lo que mide el texto más largo de
                  cada una. Cuando una fila no tiene paso siguiente, la
                  segunda columna se queda vacía y el «Ver» no se mueve: es
                  justamente lo que mantiene la columna a plomo.
                */}
                <td className="px-4 py-2.5">
                  <div className="ml-auto grid w-[216px] grid-cols-[84px_1fr] gap-1.5">
                    <Link
                      href={`/cotizaciones/${c.id}`}
                      className={`${SECUNDARIO} w-full justify-center`}
                    >
                      <IconoVer />
                      Ver
                    </Link>
                    <Siguiente cotizacion={c} />
                  </div>
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
            {/* La tarjeta ya NO es un enlace entera.

                Lo era, y por eso no podía llevar botones: un `<a>` dentro de
                otro `<a>` es HTML inválido y el navegador lo deshace por su
                cuenta. Ahora los botones son los de la fila de escritorio, y
                se pulsan igual en un teléfono. */}
            <div className="min-w-0 flex-1 p-3">
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

              <div className="mt-3 flex items-center gap-2">
                <Link href={`/cotizaciones/${c.id}`} className={`${SECUNDARIO} flex-1 justify-center`}>
                  <IconoVer />
                  Ver
                </Link>
                <Siguiente cotizacion={c} />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="px-3 py-3 sm:px-4">
        <PaginacionKeyset
          porPagina={filtros.limite}
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={null}
        />
      </div>
    </>
  );
}

/*
  Los dos botones de la columna de acciones.

  Alto 36 px y `text-sm`: el mínimo con el que un botón sigue pareciendo un
  botón en una fila de tabla. Se escriben aquí como constantes y no como un
  componente para que la tabla siga siendo un componente de servidor entero —
  `Button` es de cliente, y traérselo para nueve filas cargaría Radix en una
  pantalla que solo pinta enlaces.
*/
const SECUNDARIO =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

const PRINCIPAL =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-brand-600 px-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

/**
 * El paso siguiente de esta cotización, si lo hay.
 *
 * Cambia con el estado, y esa es la mitad del valor: en un borrador dice
 * «Editar» y en una aprobada «Facturar», así que la fila dice qué hacer sin
 * que haya que abrirla y decidirlo.
 *
 * En `atendida`, `rechazada`, `vencida` y `anulada` no sale nada. No es un
 * olvido: en esas cuatro no queda ningún paso, y un botón que no lleva a
 * ninguna parte enseña a desconfiar de los que sí.
 */
function Siguiente({ cotizacion: c }: { cotizacion: CotizacionLista }) {
  // `w-full justify-center` en los dos: el ancho lo pone la rejilla de la
  // celda, no el texto de dentro. Es lo que los deja a plomo entre filas.
  if (c.estado === "borrador" || c.estado === "enviada") {
    return (
      <Link
        href={`/cotizaciones/${c.id}/editar`}
        className={`${SECUNDARIO} w-full justify-center`}
      >
        <IconoEditar />
        Editar
      </Link>
    );
  }
  if (c.estado === "aprobada") {
    return (
      <Link
        href={`/facturacion/nueva?cotizacion=${c.id}`}
        className={`${PRINCIPAL} w-full justify-center`}
      >
        <IconoFactura />
        Facturar
      </Link>
    );
  }
  return null;
}

/* Los iconos, en línea. Tres trazos cada uno: no compensa un paquete. */

function IconoVer() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoEditar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconoFactura() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h4" />
    </svg>
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
