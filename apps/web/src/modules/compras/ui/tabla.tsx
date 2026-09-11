import Link from "next/link";
import {
  Button,
  EstadoBadge,
  EstadoError,
  EstadoVacio,
  Moneda,
  PaginacionKeyset,
} from "@rodatech/ui";

import { listarCompras } from "../api/consultas";
import type { EstadoCompra, FiltrosCompras } from "../dominio/tipos";

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

  const { filas, siguiente, anterior } = resultado.datos;

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
              {/*
                Pegada a la derecha, igual que la columna del producto en el
                comparador: la tabla necesita 1313 px y en un portátil de 1366
                el botón cae justo fuera de la vista. Uno al que hay que
                desplazarse está tan escondido como el que no estaba.
              */}
              <th className="sticky right-0 z-20 border-l border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2.5">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr
                key={c.id}
                className={`group/fila border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)] ${
                  c.estado === "anulada" ? "opacity-60" : ""
                }`}
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/compras/${c.id}`}
                    className="font-mono text-sm font-medium text-brand-600 hover:underline"
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
                    <span className="block text-sm text-[var(--fg-subtle)]">
                      llega {c.fecha_estimada}
                    </span>
                  ) : null}
                </td>
                <td className="max-w-xs px-4 py-2.5">
                  <span className="block truncate">{c.proveedor ?? "—"}</span>
                </td>
                {/* El número de factura del proveedor es por lo que se busca
                    una compra —así está escrito en el marcador del buscador de
                    esta misma pantalla—, así que se lee: en 14, no en 12. */}
                <td className="hidden px-4 py-2.5 text-[var(--fg-muted)] lg:table-cell">
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
                  {/* El mismo badge que guías y cotizaciones: con punto —el
                      segundo canal, para quien no distingue verde de rojo— y
                      con las anuladas tachadas. */}
                  <EstadoBadge estado={c.estado} size="xs" />
                </td>
                <td className="sticky right-0 z-10 border-l border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2.5 text-right group-hover/fila:bg-[var(--surface-2)]">
                  {faltaRecibir(c.estado) ? (
                    <Button asChild variant="outline">
                      <Link href={`/recepciones/nueva?compra=${c.id}`}>
                        Recibir mercadería
                      </Link>
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------- Móvil */}
      {/*
        Las compras, en tarjetas sueltas y con etiquetas.

        Luis, 11/09: *«todo junto, apegado»*. Iban pegadas por una raya de un
        píxel y con fecha, líneas y total seguidos en una misma línea de 12 px,
        sin decir cuál era cuál. Ahora cada compra es una tarjeta con su borde,
        cada dato con su nombre encima, y el botón de ver abajo: hasta hoy solo
        se entraba pulsando el número, que no parece un botón.
      */}
      <ul className="flex flex-col gap-2.5 p-3 md:hidden">
        {filas.map((c) => (
          <li
            key={c.id}
            className={`flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${
              c.estado === "anulada" ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <Link
                  href={`/compras/${c.id}`}
                  className="font-mono text-sm font-semibold text-brand-600"
                >
                  {c.numero}
                </Link>
                {c.tipo === "importacion" ? (
                  <span className="rounded-sm bg-[var(--surface-2)] px-1.5 py-0.5 text-xs text-[var(--fg-muted)]">
                    Import.
                  </span>
                ) : null}
              </span>
              <span className="shrink-0">
                <EstadoBadge estado={c.estado} size="xs" />
              </span>
            </div>

            <div>
              <p className="text-sm font-medium">{c.proveedor ?? "—"}</p>
              {c.documento_proveedor ? (
                <p className="text-sm text-[var(--fg-subtle)]">
                  {c.documento_proveedor}
                </p>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <Dato etiqueta="Fecha">
                {c.fecha}
                {/* Cuándo llega, debajo: en una compra pendiente es el dato
                    por el que se entra a mirarla. */}
                {c.fecha_estimada ? (
                  <span className="block text-sm text-[var(--fg-subtle)]">
                    llega {c.fecha_estimada}
                  </span>
                ) : null}
              </Dato>
              <Dato etiqueta="Líneas">{c.items}</Dato>
              <Dato etiqueta="Total">
                <Moneda valor={c.total} tamano="sm" />
                {c.gastos_importacion > 0 ? (
                  <span className="block text-xs text-[var(--fg-subtle)]">
                    +{c.gastos_importacion.toFixed(2)} gastos
                  </span>
                ) : null}
              </Dato>
              <div className="min-w-0">
                <dt className="text-xs text-[var(--fg-subtle)]">Recibido</dt>
                <dd className="pt-1">
                  <BarraAvance valor={c.avance} anulada={c.estado === "anulada"} />
                </dd>
              </div>
            </dl>

            {/* «Recibir mercadería» es el paso siguiente de la compra, así que
                manda sobre «Ver»: relleno y a la derecha, que es donde el
                pulgar cae. */}
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="flex-1">
                <Link href={`/compras/${c.id}`}>Ver</Link>
              </Button>
              {faltaRecibir(c.estado) ? (
                <Button asChild className="flex-1">
                  <Link href={`/recepciones/nueva?compra=${c.id}`}>
                    Recibir mercadería
                  </Link>
                </Button>
              ) : null}
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

/**
 * ¿Todavía queda mercadería por llegar de esta compra?
 *
 * Luis, mirando el listado: *«acá en compras falta el botón de recibir
 * mercadería, no darle clic al número»*. El botón existía, pero solo dentro de
 * la compra: había que entrar por el número —que ni parece un enlace a quien no
 * sabe— para encontrarlo. Recibir es lo que se hace desde esta pantalla el 90 %
 * de las veces, así que va en la fila.
 *
 * Se decide por ESTADO y no por `avance`, que viene redondeado: con 999 de 1000
 * unidades recibidas el avance sale «100 %» y el botón desaparecería quedando
 * una unidad por llegar.
 */
function faltaRecibir(estado: EstadoCompra): boolean {
  return estado === "registrada" || estado === "recibida_parcial";
}

/**
 * Cuánto de lo pedido ya llegó.
 *
 * Es la columna que de verdad se mira en un listado de compras: el estado dice
 * «parcial», pero no si falta el 5 % o el 90 %.
 */
function BarraAvance({ valor, anulada }: { valor: number; anulada: boolean }) {
  if (anulada) return <span className="text-[var(--fg-subtle)]">—</span>;

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
      {/* El porcentaje es la única lectura exacta de la barra —el estado dice
          «parcial», pero no si falta el 5 % o el 90 %—, así que va en 14. */}
      <span className="tabular text-sm text-[var(--fg-muted)]">{valor}%</span>
    </div>
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
