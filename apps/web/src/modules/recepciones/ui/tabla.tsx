import Link from "next/link";
import { EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";

import { listarRecepciones } from "../api/consultas";
import type { FiltrosRecepciones } from "../dominio/tipos";

/**
 * Listado de recepciones.
 *
 * En móvil NO es una tabla: ocho columnas en un teléfono no se leen ni con
 * scroll horizontal, así que por debajo de `md` cada recepción es una tarjeta
 * con lo mismo apilado. Es el mismo criterio que el catálogo.
 */
export async function TablaRecepciones({ filtros }: { filtros: FiltrosRecepciones }) {
  const resultado = await listarRecepciones(filtros);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las recepciones"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(
      filtros.q || filtros.proveedor || filtros.desde || filtros.hasta,
    );
    return (
      <EstadoVacio
        titulo={filtrando ? "Ninguna recepción coincide" : "Todavía no se ha recibido nada"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por el número de guía del proveedor."
            : "Cuando llegue mercadería, regístrala aquí: es lo único que mueve el stock."
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
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Proveedor</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                Documentos
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Líneas</th>
              <th className="px-4 py-2.5 text-right font-medium">Valorizado</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Recibió</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                  r.anulada ? "opacity-60" : ""
                }`}
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/recepciones/${r.id}`}
                    className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                  >
                    {r.numero}
                  </Link>
                  {r.anulada ? (
                    <span className="ml-2 rounded-sm bg-[var(--danger-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--danger)]">
                      Anulada
                    </span>
                  ) : null}
                  {r.compra_numero ? (
                    <span className="ml-2 font-mono text-xs text-[var(--fg-subtle)]">
                      {r.compra_numero}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular">{r.fecha}</td>
                <td className="max-w-xs px-4 py-2.5">
                  <span className="block truncate">{r.proveedor ?? "—"}</span>
                </td>
                <td className="hidden px-4 py-2.5 text-xs text-[var(--fg-muted)] lg:table-cell">
                  {r.guia_proveedor ? <span className="block">G: {r.guia_proveedor}</span> : null}
                  {r.factura_proveedor ? (
                    <span className="block">F: {r.factura_proveedor}</span>
                  ) : null}
                  {!r.guia_proveedor && !r.factura_proveedor ? "—" : null}
                </td>
                <td className="px-4 py-2.5 text-right tabular">{r.items}</td>
                <td className="px-4 py-2.5 text-right">
                  <Moneda valor={r.valorizado} tamano="sm" />
                </td>
                <td className="hidden px-4 py-2.5 text-xs text-[var(--fg-muted)] lg:table-cell">
                  {r.recibido_por ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------- Móvil */}
      {/*
        Las recepciones, en tarjetas sueltas y con etiquetas.

        Luis, 11/09: *«todo junto, apegado»*. Y faltaban los papeles del
        proveedor —la guía y la factura con las que llegó la mercadería—, que
        en escritorio están en su columna y en el teléfono no salían: son el
        dato por el que se busca una recepción cuando el proveedor llama
        reclamando.
      */}
      <ul className="flex flex-col gap-2.5 p-3 md:hidden">
        {filas.map((r) => (
          <li
            key={r.id}
            className={`flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${
              r.anulada ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/recepciones/${r.id}`}
                  className="font-mono text-sm font-semibold text-brand-600"
                >
                  {r.numero}
                </Link>
                {r.compra_numero ? (
                  <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                    {r.compra_numero}
                  </span>
                ) : null}
              </div>
              {r.anulada ? (
                <span className="shrink-0 rounded-sm bg-[var(--danger-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--danger)]">
                  Anulada
                </span>
              ) : null}
            </div>

            <p className="text-sm font-medium">{r.proveedor ?? "—"}</p>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <Dato etiqueta="Fecha">{r.fecha}</Dato>
              <Dato etiqueta="Líneas">{r.items}</Dato>
              <Dato etiqueta="Valorizado">
                <Moneda valor={r.valorizado} tamano="sm" />
              </Dato>
              <Dato etiqueta="Recibió">{r.recibido_por ?? "—"}</Dato>
              <div className="col-span-2 min-w-0">
                <dt className="text-xs text-[var(--fg-subtle)]">
                  Papeles del proveedor
                </dt>
                <dd className="text-sm">
                  {r.guia_proveedor || r.factura_proveedor
                    ? [
                        r.guia_proveedor ? `G: ${r.guia_proveedor}` : null,
                        r.factura_proveedor ? `F: ${r.factura_proveedor}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "—"}
                </dd>
              </div>
            </dl>

            {/* Una recepción no se edita ni se imprime: solo se abre para ver
                qué llegó y colgarle los papeles. Un botón, entero. */}
            <Link
              href={`/recepciones/${r.id}`}
              className={`${SECUNDARIO} w-full justify-center`}
            >
              Ver recepción
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

/*
  El botón de la tarjeta de móvil. Mismo aspecto que el «Ver» de guías y
  facturación: en esta casa un botón tiene que parecer un botón.
*/
const SECUNDARIO =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

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
