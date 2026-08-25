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
                    <span className="ml-2 rounded-sm bg-[var(--danger-bg)] px-1.5 py-0.5 text-[0.7rem] font-medium text-[var(--danger)]">
                      Anulada
                    </span>
                  ) : null}
                  {r.compra_numero ? (
                    <span className="ml-2 font-mono text-[0.7rem] text-[var(--fg-subtle)]">
                      {r.compra_numero}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular">{r.fecha}</td>
                <td className="max-w-xs px-4 py-2.5">
                  <span className="block truncate">{r.proveedor ?? "—"}</span>
                </td>
                <td className="hidden px-4 py-2.5 text-[0.75rem] text-[var(--fg-muted)] lg:table-cell">
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
                <td className="hidden px-4 py-2.5 text-[0.75rem] text-[var(--fg-muted)] lg:table-cell">
                  {r.recibido_por ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------- Móvil */}
      <ul className="flex flex-col divide-y divide-[var(--border-soft)] md:hidden">
        {filas.map((r) => (
          <li key={r.id} className={`px-3 py-3 ${r.anulada ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <Link
                href={`/recepciones/${r.id}`}
                className="font-mono text-sm font-semibold text-brand-600"
              >
                {r.numero}
              </Link>
              <span className="tabular text-xs text-[var(--fg-muted)]">{r.fecha}</span>
            </div>

            <p className="mt-0.5 line-clamp-1 text-sm">{r.proveedor ?? "—"}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-[var(--fg-muted)]">
                {r.items} {r.items === 1 ? "línea" : "líneas"}
              </span>
              <Moneda valor={r.valorizado} tamano="sm" />
              {r.anulada ? (
                <span className="rounded-sm bg-[var(--danger-bg)] px-1.5 py-0.5 font-medium text-[var(--danger)]">
                  Anulada
                </span>
              ) : null}
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
