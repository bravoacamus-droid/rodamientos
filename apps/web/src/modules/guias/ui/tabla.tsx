import Link from "next/link";
import { EstadoBadge, EstadoError, EstadoVacio, PaginacionKeyset } from "@rodatech/ui";

import { listarGuias } from "../api/consultas";
import type { FiltrosGuias } from "../dominio/tipos";

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

  const { filas, siguiente, anterior } = resultado.datos;

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
              {/* La columna de acciones tenía cabecera vacía. Con una fila sola
                  no se nota; con veinte, los dos botones flotan sin decir de
                  qué son. */}
              <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
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
                    className="font-mono text-sm font-medium text-brand-600 hover:underline"
                  >
                    {g.numero}
                  </Link>
                  {g.cotizacion_numero ? (
                    <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                      {g.cotizacion_numero}
                    </span>
                  ) : null}
                </td>
                {/* El motivo, en 14: en la tarjeta de móvil tiene su propio
                    `Dato` a tamaño de dato, y aquí era la letra pequeña de la
                    celda de la fecha. La misma cifra no puede leerse en dos
                    tamaños según el ancho de la pantalla. */}
                <td className="whitespace-nowrap px-4 py-2.5 tabular">
                  {g.fecha_traslado}
                  <span className="block text-sm text-[var(--fg-subtle)]">
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
                  {/*
                    El mismo badge que el resto del ERP.

                    Aquí se pintaba con `Badge` a secas y `TONO_ESTADO`, así que
                    «Emitida» salía verde y sin punto: distinto de cómo se ve un
                    estado en cotizaciones o en facturas, y con el color como
                    único canal. `EstadoBadge` trae el punto —forma distinta por
                    estado, que es el segundo canal para quien no distingue
                    verde de rojo— y el tachado de las anuladas.
                  */}
                  <EstadoBadge estado={g.estado} size="xs" />
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
                    {/*
                      El de imprimir lleva el icono en azul.

                      Luis, 10/09: *«el botón de imprimir podemos ponerle ese
                      botón azul así bonito»*. En relleno serían veinte botones
                      azules gritando a la vez y le comerían el sitio al único
                      que crea algo, que es «Preparar guía». Con el icono en
                      color se distingue del de Ver sin robarle el papel.
                    */}
                    <Link
                      href={`/guias/${g.id}/imprimir?auto=1`}
                      className={`${SECUNDARIO} w-full justify-center [&>svg]:text-brand-600`}
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
      {/*
        Las guías, en tarjetas sueltas y con sus botones.

        Luis, 11/09, comparando con su prototipo: *«así es mi prototipo, se ve
        todo; pero acá no, los botones, nada»*. Y tenía razón por partida
        doble:

        1. La tarjeta enseñaba número, fecha, cliente y peso. Faltaba a dónde
           va —la dirección de entrega, que en escritorio está en su columna—,
           que es justo lo que se mira para saber cuál es cuál.
        2. Para verla o imprimirla había que pulsar el número. Un enlace no
           parece un botón, y aquí eso no es una opinión: *«una persona que no
           sabe que tiene que darle click ahí»*.

        Y van sueltas, con su borde, en vez de pegadas con una línea entre
        ellas. Luis, el mismo día, sobre facturación: *«todo junto, apegado»*.
        Con cuatro datos y dos botones dentro, una raya de un píxel ya no
        alcanza para decir dónde acaba una guía y empieza la siguiente.
      */}
      <ul className="flex flex-col gap-2.5 p-3 md:hidden">
        {filas.map((g, i) => (
          <li
            key={g.id}
            className={`anim-entrada flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${
              g.estado === "anulada" ? "opacity-60" : ""
            }`}
            style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/guias/${g.id}`}
                  className="font-mono text-sm font-semibold text-brand-600"
                >
                  {g.numero}
                </Link>
                {g.cotizacion_numero ? (
                  <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                    {g.cotizacion_numero}
                  </span>
                ) : null}
              </div>
              <span className="shrink-0">
                <EstadoBadge estado={g.estado} size="xs" />
              </span>
            </div>

            {/* Sin recortar: en la tabla el nombre compite con siete columnas;
                aquí tiene la tarjeta entera, y equivocarse de destinatario en
                una guía es un viaje perdido. */}
            <div>
              <p className="text-sm font-medium">{g.cliente ?? "—"}</p>
              {g.cliente_documento ? (
                <p className="font-mono text-xs text-[var(--fg-subtle)]">
                  {g.cliente_documento}
                </p>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <Dato etiqueta="Traslado">{g.fecha_traslado}</Dato>
              {/* El peso primero de los dos números: es lo que Willy llamó «lo
                  más importante» (02:46), porque es lo que el transportista
                  necesita antes de cargar. */}
              <Dato etiqueta="Peso">{g.peso_bruto_kg.toFixed(3)} kg</Dato>
              <Dato etiqueta="Bultos">{g.numero_bultos}</Dato>
              <Dato etiqueta="Motivo">{g.motivo ?? "—"}</Dato>
              {/* La dirección, a ancho completo y SIN recortar: los demás
                  datos caben en media tarjeta, esta no, y una dirección
                  cortada en «AV. PLACIDO JIMENEZ NRO. 1051 COO. LAS PIRAMID…»
                  no dice a dónde va el camión, que es para lo que se mira. */}
              <div className="col-span-2 min-w-0">
                <dt className="text-xs text-[var(--fg-subtle)]">Entrega</dt>
                <dd className="text-sm">{g.direccion_llegada ?? "—"}</dd>
              </div>
            </dl>

            {/* Los mismos dos botones de la fila de escritorio, repartiéndose
                el ancho: con el pulgar se pulsa sin apuntar. */}
            <div className="flex items-center gap-1.5">
              <Link
                href={`/guias/${g.id}`}
                className={`${SECUNDARIO} flex-1 justify-center`}
              >
                <IconoVer />
                Ver
              </Link>
              <Link
                href={`/guias/${g.id}/imprimir?auto=1`}
                className={`${SECUNDARIO} flex-1 justify-center [&>svg]:text-brand-600`}
              >
                <IconoImprimir />
                Imprimir
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <div className="px-3 py-3 sm:px-4">
        <PaginacionKeyset
          porPagina={filtros.limite}
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={anterior}
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

/**
 * Un dato de la tarjeta de móvil: su etiqueta encima, pequeña, y el valor
 * debajo.
 *
 * Sin cabecera de tabla que diga qué es cada cosa, cada dato tiene que
 * presentarse solo. La etiqueta va en 12 px porque no se lee, se reconoce; el
 * valor, en 14, que es el mínimo de esta casa.
 */
function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--fg-subtle)]">{etiqueta}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}
