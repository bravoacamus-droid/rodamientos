import Link from "next/link";
import { Badge, EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";

import { listarCompras } from "../api/consultas";
import { ETIQUETA_ESTADO, TONO_ESTADO, type FiltrosCompras } from "../dominio/tipos";

/**
 * Listado de compras.
 *
 * En móvil NO es una tabla: ocho columnas en un teléfono no se leen ni con
 * scroll horizontal, así que por debajo de `md` cada compra es una tarjeta con
 * lo mismo apilado. Es el mismo criterio que el catálogo y las recepciones.
 */
export async function TablaCompras({ filtros }: { filtros: FiltrosCompras }) {
  const resultado = await listarCompras(filtros);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las compras"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(
      filtros.q || filtros.proveedor || filtros.estado || filtros.tipo ||
      filtros.desde || filtros.hasta,
    );
    return (
      <EstadoVacio
        titulo={filtrando ? "Ninguna compra coincide" : "Todavía no hay compras"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por el número de factura del proveedor."
            : "Registra lo que le pides al proveedor. El stock no se mueve hasta que la mercadería llegue y se recepcione."
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
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Documento</th>
              <th className="px-4 py-2.5 text-right font-medium">Líneas</th>
              <th className="px-4 py-2.5 font-medium">Recibido</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr
                key={c.id}
                className={`border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                  c.estado === "anulada" ? "opacity-60" : ""
                }`}
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/compras/${c.id}`}
                    className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                  >
                    {c.numero}
                  </Link>
                  {c.tipo === "importacion" ? (
                    <span className="ml-2 rounded-sm bg-[var(--surface-2)] px-1.5 py-0.5 text-xs text-[var(--fg-muted)]">
                      Import.
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular">
                  {c.fecha}
                  {c.fecha_estimada ? (
                    <span className="block text-xs text-[var(--fg-subtle)]">
                      llega {c.fecha_estimada}
                    </span>
                  ) : null}
                </td>
                <td className="max-w-xs px-4 py-2.5">
                  <span className="block truncate">{c.proveedor ?? "—"}</span>
                </td>
                <td className="hidden px-4 py-2.5 text-xs text-[var(--fg-muted)] lg:table-cell">
                  {c.documento_proveedor ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular">{c.items}</td>
                <td className="px-4 py-2.5">
                  <BarraAvance valor={c.avance} anulada={c.estado === "anulada"} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Moneda valor={c.total} tamano="sm" />
                  {c.gastos_importacion > 0 ? (
                    <span className="block text-xs text-[var(--fg-subtle)]">
                      +{c.gastos_importacion.toFixed(2)} gastos
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={TONO_ESTADO[c.estado]} size="xs">
                    {ETIQUETA_ESTADO[c.estado]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------- Móvil */}
      <ul className="flex flex-col divide-y divide-[var(--border-soft)] md:hidden">
        {filas.map((c) => (
          <li
            key={c.id}
            className={`px-3 py-3 ${c.estado === "anulada" ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <Link
                href={`/compras/${c.id}`}
                className="font-mono text-sm font-semibold text-brand-600"
              >
                {c.numero}
              </Link>
              <span className="tabular text-xs text-[var(--fg-muted)]">{c.fecha}</span>
            </div>

            <p className="mt-0.5 line-clamp-1 text-sm">{c.proveedor ?? "—"}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Badge tone={TONO_ESTADO[c.estado]} size="xs">
                {ETIQUETA_ESTADO[c.estado]}
              </Badge>
              <span className="text-[var(--fg-muted)]">
                {c.items} {c.items === 1 ? "línea" : "líneas"}
              </span>
              <Moneda valor={c.total} tamano="sm" />
            </div>

            {c.estado !== "anulada" && c.avance < 100 ? (
              <div className="mt-2">
                <BarraAvance valor={c.avance} anulada={false} />
              </div>
            ) : null}
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
 * Cuánto de lo pedido ya llegó.
 *
 * Es la columna que de verdad se mira en un listado de compras: el estado dice
 * «parcial», pero no si falta el 5 % o el 90 %.
 */
function BarraAvance({ valor, anulada }: { valor: number; anulada: boolean }) {
  if (anulada) return <span className="text-xs text-[var(--fg-subtle)]">—</span>;

  const color =
    valor >= 100
      ? "bg-[var(--ok)]"
      : valor > 0
        ? "bg-[var(--warn)]"
        : "bg-[var(--border-strong)]";

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-3,var(--surface-2))]"
        role="progressbar"
        aria-valuenow={valor}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Recibido"
      >
        <div className={`h-full ${color}`} style={{ width: `${valor}%` }} />
      </div>
      <span className="tabular text-xs text-[var(--fg-muted)]">{valor}%</span>
    </div>
  );
}
