import Link from "next/link";
import { EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";

import { kardex } from "../api/consultas";
import { enlaceDeReferencia } from "../dominio/enlaces";
import { ETIQUETA_MOVIMIENTO, type FiltrosKardex, type TipoMovimiento } from "../dominio/tipos";

const COLOR: Record<TipoMovimiento, string> = {
  ingreso: "bg-[var(--ok-bg)] text-[var(--ok)]",
  salida: "bg-[var(--info-bg)] text-[var(--info)]",
  ajuste_positivo: "bg-[var(--warn-bg)] text-[var(--warn)]",
  ajuste_negativo: "bg-[var(--warn-bg)] text-[var(--warn)]",
};

/**
 * La fecha como se escribe en Perú, «25/09/2026», y no en ISO: «2026-09-25»
 * hay que leerlo al revés (revisión por módulos del 02/10).
 */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
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

  const { filas, siguiente, anterior } = resultado.datos;

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
    <div className="@container">
      {/*
        EN MÓVIL, TARJETAS. Medido a 390 px: la tabla pide 595 y no encoge,
        porque la descripción del producto no se deja.

        El kardex se consulta para responder «¿y esto de dónde salió?», así que
        la tarjeta lleva el movimiento, la cantidad con su signo y el documento
        que lo causó. Los costos —unitario y promedio— se quedan en la tabla de
        escritorio: ahí no se miran de pie en el almacén, se analizan sentado.

        Por ancho del contenedor y no de la ventana, y con margen dentro de la
        sección: las tarjetas iban pegadas al borde de la caja que las contiene
        (revisión por módulos del 02/10).
      */}
      <div className="flex flex-col gap-2.5 p-3 pt-0 @3xl:hidden">
        {filas.map((m) => {
          const enlace = enlaceDeReferencia(m.referencia_tipo, m.referencia_id);
          return (
            <div key={m.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/inventario/kardex?producto=${m.producto_id}`}
                  className="font-mono text-sm font-medium text-brand-600 hover:underline"
                >
                  {m.codigo}
                </Link>
                <span
                  className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-sm font-medium ${COLOR[m.tipo]}`}
                >
                  {ETIQUETA_MOVIMIENTO[m.tipo]}
                </span>
              </div>

              <p className="mt-1 text-sm">{m.descripcion}</p>

              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                {/* El signo delante: en una lista de movimientos, lo primero
                    que se busca es si entró o salió. */}
                <span className="tabular font-medium">
                  {m.entrada > 0
                    ? `+${Number(m.entrada).toLocaleString("es-PE")}`
                    : `−${Number(m.salida).toLocaleString("es-PE")}`}
                </span>
                <span className="text-[var(--fg-muted)]">
                  Quedan{" "}
                  <span className="tabular font-medium text-[var(--fg)]">
                    {Number(m.saldo_cantidad).toLocaleString("es-PE")}
                  </span>
                </span>
                <span className="tabular text-[var(--fg-subtle)]">
                  {fechaCorta(m.fecha)}
                </span>
              </div>

              {m.referencia_numero ? (
                <p className="mt-1 text-sm">
                  {enlace ? (
                    <Link
                      href={enlace}
                      className="font-mono text-brand-600 hover:underline"
                    >
                      {m.referencia_numero}
                    </Link>
                  ) : (
                    <span className="font-mono">{m.referencia_numero}</span>
                  )}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="hidden scroll-x @3xl:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Producto</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              {/* Entrada y salida en UNA columna con su signo, como en la
                  tarjeta: con dos, a 1280 con el menú abierto la tabla no
                  cabía y se cortaba la referencia (revisión del 02/10). */}
              <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
              <th className="hidden px-4 py-2.5 text-right font-medium 2xl:table-cell">
                Costo unit.
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
              <th className="hidden px-4 py-2.5 text-right font-medium 2xl:table-cell">
                Costo prom.
              </th>
              <th className="px-4 py-2.5 font-medium">Referencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => {
              const enlace = enlaceDeReferencia(m.referencia_tipo, m.referencia_id);
              return (
                <tr
                  key={m.id}
                  className="border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)]"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 tabular text-sm">
                    {fechaCorta(m.fecha)}
                    <span className="ml-1 text-sm text-[var(--fg-subtle)]">
                      {m.fecha.slice(11, 16)}
                    </span>
                  </td>
                  <td className="max-w-[16rem] px-4 py-2.5">
                    <Link
                      href={`/inventario/kardex?producto=${m.producto_id}`}
                      className="block font-mono text-sm font-medium text-brand-600 hover:underline"
                    >
                      {m.codigo}
                    </Link>
                    <span
                      className="block truncate text-sm text-[var(--fg-subtle)]"
                      title={m.descripcion}
                    >
                      {m.descripcion}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-sm font-medium ${COLOR[m.tipo]}`}
                    >
                      {ETIQUETA_MOVIMIENTO[m.tipo]}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-2.5 text-right tabular font-medium ${
                      m.entrada > 0 ? "text-[var(--ok)]" : ""
                    }`}
                  >
                    {m.entrada > 0
                      ? `+${Number(m.entrada).toLocaleString("es-PE")}`
                      : `−${Number(m.salida).toLocaleString("es-PE")}`}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right 2xl:table-cell">
                    <Moneda valor={m.costo_unitario} tamano="sm" enfasis="suave" />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular font-medium">
                    {Number(m.saldo_cantidad).toLocaleString("es-PE")}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right 2xl:table-cell">
                    <Moneda valor={m.costo_promedio} tamano="sm" enfasis="suave" />
                  </td>
                  <td className="max-w-[12rem] whitespace-nowrap px-4 py-2.5 text-sm">
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
                        className="block truncate text-sm text-[var(--fg-subtle)]"
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
          porPagina={filtros.limite}
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={anterior}
        />
      </div>
    </div>
  );
}
