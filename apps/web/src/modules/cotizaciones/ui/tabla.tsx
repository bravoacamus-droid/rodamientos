import Link from "next/link";
import { EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";

import { listarCotizaciones } from "../api/consultas";
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  type FiltrosCotizaciones,
} from "../dominio/tipos";

/** Fecha corta en formato peruano, sin depender de la zona del servidor. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a.slice(2)}` : iso;
}

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
        descripcion="La consulta no llegó a completarse. Si el esquema todavía no está aplicado en Supabase, esto es lo esperado."
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
            : "Crea la primera desde el botón «Nueva cotización»."
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

  return (
    <>
      <div className="scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Número</th>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">O/C</th>
              <th className="px-4 py-2.5 text-right font-medium">Ítems</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Margen</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => {
              const vencida =
                c.estado === "enviada" && c.fecha_vencimiento < hoy;
              return (
                <tr
                  key={c.id}
                  className="border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/cotizaciones/${c.id}`}
                      className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                    >
                      {c.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular">
                    {fechaCorta(c.fecha)}
                    {vencida ? (
                      <span className="ml-1.5 text-[0.7rem] text-[var(--warn)]">
                        vencida
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-xs px-4 py-2.5">
                    <span className="block truncate">{c.cliente}</span>
                    {c.cliente_documento ? (
                      <span className="block font-mono text-[0.7rem] text-[var(--fg-subtle)]">
                        {c.cliente_documento}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[0.75rem] text-[var(--fg-muted)]">
                    {c.orden_compra_cliente ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{c.items}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Moneda valor={c.total} tamano="sm" enfasis="fuerte" />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {c.margen_pct > 0 ? (
                      <span
                        className={
                          c.margen_pct < 15
                            ? "text-[var(--warn)]"
                            : "text-[var(--fg-muted)]"
                        }
                      >
                        {c.margen_pct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[var(--fg-subtle)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded-sm px-1.5 py-0.5 text-[0.7rem] font-medium ${COLOR_ESTADO[c.estado]}`}
                    >
                      {ETIQUETA_ESTADO[c.estado]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3">
        <PaginacionKeyset
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={null}
        />
      </div>
    </>
  );
}
