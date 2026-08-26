import Link from "next/link";
import { EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";

import { kardex } from "../api/consultas";
import { ETIQUETA_MOVIMIENTO, type FiltrosKardex, type TipoMovimiento } from "../dominio/tipos";

const COLOR: Record<TipoMovimiento, string> = {
  ingreso: "bg-[var(--ok-bg)] text-[var(--ok)]",
  salida: "bg-[var(--info-bg)] text-[var(--info)]",
  ajuste_positivo: "bg-[var(--warn-bg)] text-[var(--warn)]",
  ajuste_negativo: "bg-[var(--warn-bg)] text-[var(--warn)]",
};

/** A dónde lleva la referencia de un movimiento, cuando hay a dónde ir. */
function enlaceReferencia(tipo: string | null, id: string | null): string | null {
  if (!id) return null;
  if (tipo === "recepcion") return `/recepciones/${id}`;
  // El resto —comprobante, guia, compra, ajuste— apuntará a su ficha cuando
  // esos módulos existan. Hasta entonces se enseña el número sin enlazar, que
  // es más honesto que un enlace a una pantalla en construcción.
  return null;
}

/**
 * El kardex: todos los movimientos, del más reciente al más antiguo.
 *
 * Es el libro mayor del almacén. `saldo_cantidad` y `costo_promedio` se
 * muestran TAL COMO QUEDARON en cada movimiento, no recalculados: el kardex
 * los grabó en su momento y esa es justamente la garantía que permite
 * reconstruir el stock si las copias denormalizadas se corrompen — que es como
 * se reparó el costo del 6205.
 */
export async function TablaKardex({ filtros }: { filtros: FiltrosKardex }) {
  const resultado = await kardex(filtros);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el kardex"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(
      filtros.producto || filtros.tipo || filtros.referencia || filtros.desde || filtros.hasta,
    );
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún movimiento coincide" : "El kardex está vacío"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros o amplía el rango de fechas."
            : "Todavía no ha entrado ni salido nada del almacén. Se llena solo al recibir mercadería, facturar o cuadrar."
        }
      />
    );
  }

  return (
    <>
      <div className="scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Producto</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              <th className="px-4 py-2.5 text-right font-medium">Entrada</th>
              <th className="px-4 py-2.5 text-right font-medium">Salida</th>
              <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">
                Costo unit.
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
              <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">
                Costo prom.
              </th>
              <th className="px-4 py-2.5 font-medium">Referencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => {
              const enlace = enlaceReferencia(m.referencia_tipo, m.referencia_id);
              return (
                <tr
                  key={m.id}
                  className="border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)]"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 tabular text-[0.8rem]">
                    {m.fecha.slice(0, 10)}
                    <span className="ml-1 text-xs text-[var(--fg-subtle)]">
                      {m.fecha.slice(11, 16)}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-2.5">
                    <Link
                      href={`/inventario/kardex?producto=${m.producto_id}`}
                      className="block font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                    >
                      {m.codigo}
                    </Link>
                    <span className="block truncate text-xs text-[var(--fg-subtle)]">
                      {m.descripcion}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-medium ${COLOR[m.tipo]}`}
                    >
                      {ETIQUETA_MOVIMIENTO[m.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {m.entrada > 0 ? Number(m.entrada).toLocaleString("es-PE") : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {m.salida > 0 ? Number(m.salida).toLocaleString("es-PE") : "—"}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right lg:table-cell">
                    <Moneda valor={m.costo_unitario} tamano="sm" enfasis="suave" />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular font-medium">
                    {Number(m.saldo_cantidad).toLocaleString("es-PE")}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right lg:table-cell">
                    <Moneda valor={m.costo_promedio} tamano="sm" enfasis="suave" />
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {m.referencia_numero ? (
                      enlace ? (
                        <Link
                          href={enlace}
                          className="font-mono text-brand-600 hover:underline"
                        >
                          {m.referencia_numero}
                        </Link>
                      ) : (
                        <span className="font-mono">{m.referencia_numero}</span>
                      )
                    ) : (
                      <span className="text-[var(--fg-subtle)]">
                        {m.referencia_tipo ?? "—"}
                      </span>
                    )}
                    {m.motivo ? (
                      <span
                        className="block truncate text-xs text-[var(--fg-subtle)]"
                        title={m.motivo}
                      >
                        {m.motivo}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
