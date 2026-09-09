import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EstadoError, EstadoVacio, Moneda, formatearFecha } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { listosParaEntregar, type PedidoDelCliente } from "../api/por-comprar";
import { ETIQUETA_URGENCIA } from "../dominio/por-comprar";

/**
 * Los pedidos confirmados, y qué se puede hacer con cada uno.
 *
 * ---------------------------------------------------------------------------
 * El hueco entre aprobar y despachar
 * ---------------------------------------------------------------------------
 * El ERP tenía cerrada toda la cadena menos el tramo del medio. Se aprobaba la
 * cotización, y desde ahí el pedido solo volvía a existir cuando el almacén ya
 * podía cubrirlo. Mientras tanto no estaba en ninguna pantalla **como pedido**:
 * la bandeja «Por comprar» lo tiene, pero desmenuzado por código, y un cliente
 * no llama preguntando por el 6205, llama preguntando por lo suyo.
 *
 * Luis, 08/09: *«después de aprobar la cotización pase a listos para entregar,
 * porque acá podríamos ver qué productos faltan comprar, uno gestiona antes de
 * hacer la guía»*.
 *
 * Así que esta pantalla ya no es «lo que se puede mover hoy» sino **los pedidos
 * abiertos**, en tres montones:
 *
 *   · **Cubierto**   — se despacha entero. Botón para preparar la guía.
 *   · **Parcial**    — hay algo. Se despacha y se factura por partes (047).
 *   · **Por cubrir** — el almacén no tiene nada. Botón a la bandeja de compras.
 *
 * ---------------------------------------------------------------------------
 * Lo que sigue sin decir
 * ---------------------------------------------------------------------------
 * No dice «es suyo» en ningún sitio, dice «se le puede entregar». Mientras
 * `stock.reservado` siga sin escribirlo nadie (§G.2, pendiente de que Willy
 * conteste si confirmar un pedido aparta la mercadería), el reparto por
 * antigüedad es un cálculo y no una decisión que él haya tomado.
 */

type Monton = PedidoDelCliente["estado"];

const ETIQUETA: Record<Monton, string> = {
  completo: "Cubierto",
  parcial: "Parcial",
  por_cubrir: "Por cubrir",
};

/** El orden de las pastillas es el del trabajo: primero lo que ya se puede hacer. */
const MONTONES: readonly Monton[] = ["completo", "parcial", "por_cubrir"];

function esMonton(v: string | undefined): v is Monton {
  return v === "completo" || v === "parcial" || v === "por_cubrir";
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaListos({ searchParams }: Props) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  const sp = await searchParams;
  const crudo = Array.isArray(sp.estado) ? sp.estado[0] : sp.estado;
  // Viene de la barra de direcciones: se valida antes de usarlo para filtrar.
  const filtro = esMonton(crudo) ? crudo : undefined;

  const r = await listosParaEntregar();

  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar los pedidos"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }

  const todos = r.datos;
  const visibles = filtro ? todos.filter((p) => p.estado === filtro) : todos;
  const cuenta = (m: Monton) => todos.filter((p) => p.estado === m).length;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Listos para entregar</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Pedidos que salieron de una cotización aprobada y todavía no se han
          entregado del todo. Los que están «Por cubrir» aún no tienen stock.
        </p>
      </header>

      {todos.length === 0 ? (
        <EstadoVacio
          titulo="No hay pedidos abiertos"
          descripcion="Cuando apruebes una cotización, el pedido aparecerá aquí hasta que se entregue entero."
          accion={
            <Link
              href="/cotizaciones?estado=enviada"
              className="inline-flex h-11 items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Ver cotizaciones enviadas
            </Link>
          }
        />
      ) : (
        <>
          <Pastillas activo={filtro} total={todos.length} cuenta={cuenta} />

          <div className="card overflow-hidden">
            <div className="scroll-x">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Cotización</th>
                    <th className="px-3 py-2.5 font-medium">Fecha</th>
                    <th className="px-3 py-2.5 font-medium">Cliente</th>
                    <th className="px-3 py-2.5 text-right font-medium">Ítems</th>
                    <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">
                      Se entrega
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">Total</th>
                    <th className="px-3 py-2.5 font-medium">Prometido</th>
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr
                      key={p.cotizacion_id}
                      className="border-b border-[var(--border-soft)] last:border-0 transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-[0.8rem] font-semibold text-brand-700">
                          {p.cotizacion}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5 tabular">
                        {formatearFecha(p.fecha)}
                      </td>

                      <td className="max-w-xs px-3 py-2.5">
                        <span className="block truncate" title={p.cliente}>
                          {p.cliente}
                        </span>
                        {p.cliente_documento ? (
                          <span className="block font-mono text-xs text-[var(--fg-subtle)]">
                            {p.cliente_documento}
                          </span>
                        ) : null}
                      </td>

                      <td className="px-3 py-2.5 text-right tabular text-[var(--fg-muted)]">
                        {p.lineas}
                      </td>

                      {/* En unidades y no en líneas. «0 de 2 líneas» al lado de
                          «listo» se contradicen a la vista, y lo que se saca
                          del almacén son unidades. */}
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular lg:table-cell">
                        {p.estado === "completo" ? (
                          <span>{p.unidades}</span>
                        ) : p.estado === "parcial" ? (
                          <span>
                            {p.unidades}{" "}
                            <span className="text-[var(--fg-subtle)]">de {p.pendientes}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--fg-subtle)]">0 de {p.pendientes}</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-right">
                        <Moneda valor={p.total} tamano="sm" enfasis="fuerte" />
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5">
                        <Badge
                          tone={
                            p.urgencia === "vencido"
                              ? "danger"
                              : p.urgencia === "hoy"
                                ? "warning"
                                : "neutral"
                          }
                          size="xs"
                        >
                          {ETIQUETA_URGENCIA[p.urgencia]}
                        </Badge>
                        <span className="ml-1.5 text-xs text-[var(--fg-subtle)]">
                          {formatearFecha(p.prometida)}
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        <EstadoDelPedido estado={p.estado} />
                      </td>

                      {/* Rejilla de dos columnas fijas y no una fila: si cada
                          botón mide lo que mide su texto, «Preparar guía» y
                          «Qué falta comprar» dejan el «Ver» de cada fila en
                          una equis distinta y la columna sale en escalera. */}
                      <td className="px-4 py-2.5">
                        <div className="ml-auto grid w-[312px] grid-cols-[124px_1fr] gap-1.5">
                          <Link
                            href={`/cotizaciones/${p.cotizacion_id}`}
                            className={`${SECUNDARIO} w-full justify-center`}
                          >
                            <IconoVer />
                            {/* «Ver pedido» y no «Ver» a secas: lleva a la ficha
                                del pedido, donde ahora se ve linea a linea que hay
                                en almacen y que falta comprar. */}
                            Ver pedido
                          </Link>
                          <Siguiente pedido={p} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {visibles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--fg-muted)]">
                Ningún pedido en «{filtro ? ETIQUETA[filtro] : ""}».{" "}
                <Link href="/cotizaciones/listos" className="text-brand-700 underline">
                  Ver todos
                </Link>
              </p>
            ) : null}
          </div>

          <p className="text-xs text-[var(--fg-muted)]">
            El stock se reparte por orden de confirmación, el más antiguo
            primero — es el mismo reparto que usa la bandeja «Por comprar», para
            que las dos pantallas no puedan contradecirse.
          </p>
        </>
      )}
    </div>
  );
}

/** Las pastillas de filtro. Son enlaces, no botones: filtrar es navegar. */
function Pastillas({
  activo,
  total,
  cuenta,
}: {
  activo: Monton | undefined;
  total: number;
  cuenta: (m: Monton) => number;
}) {
  const clase = (seleccionado: boolean) =>
    `inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors ${
      seleccionado
        ? "bg-brand-600 font-medium text-white"
        : "bg-[var(--surface-2)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
    }`;

  return (
    <div className="flex flex-wrap gap-1.5">
      <Link href="/cotizaciones/listos" className={clase(!activo)}>
        Todos
        <span className="tabular opacity-70">{total}</span>
      </Link>
      {MONTONES.map((m) => (
        <Link
          key={m}
          href={`/cotizaciones/listos?estado=${m}`}
          className={clase(activo === m)}
        >
          {ETIQUETA[m]}
          <span className="tabular opacity-70">{cuenta(m)}</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * El estado, con punto de color.
 *
 * El punto hace el trabajo en una lista larga: se distingue el montón sin leer
 * la palabra. La palabra sigue ahí porque el color solo no es accesible —y
 * porque Willy no ve bien.
 */
function EstadoDelPedido({ estado }: { estado: Monton }) {
  const tono =
    estado === "completo"
      ? "bg-[var(--ok-bg)] text-[var(--ok)]"
      : estado === "parcial"
        ? "bg-[var(--warn-bg)] text-[var(--warn)]"
        : "bg-[var(--surface-2)] text-[var(--fg-muted)]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-medium ${tono}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {ETIQUETA[estado]}
    </span>
  );
}

/**
 * El paso siguiente de este pedido.
 *
 * Es lo que Luis pedía con «uno gestiona antes de hacer la guía»: con algo en
 * almacén se prepara la guía; sin nada, lo que toca es comprar, y el botón
 * lleva a la bandeja en vez de a una guía que saldría vacía.
 */
function Siguiente({ pedido }: { pedido: PedidoDelCliente }) {
  // El ancho lo pone la rejilla de la celda, no el texto: por eso los dos
  // llevan `w-full` y no un ancho propio.
  if (pedido.estado === "por_cubrir") {
    /*
      A pedir precio de LO DE ESTE PEDIDO, no a la bandeja general.

      Luis, 09/09: *«ese "falta comprar" tiene que dirigirme a compras, o sea a
      pedir precios, porque falta comprar, cotizar esa compra»*.

      Llevaba a `/compras/por-comprar`, que ordena por PRODUCTO y mezcla lo de
      este cliente con lo de todos los demás: había que reconocer los códigos
      del pedido entre los de la lista entera y marcarlos a mano. El camino
      existía —la pantalla de pedir precio ya acepta `?items=`— y no estaba
      conectado desde aquí.

      Si por lo que fuera no hay nada descubierto que llevar, se cae a la
      bandeja en vez de mandar a una pantalla vacía.
    */
    const items = pedido.faltan
      .map((f) => `${f.producto_id}:${f.cantidad}`)
      .join(",");

    return (
      <Link
        href={items ? `/compras/pedir-precio?items=${items}` : "/compras/por-comprar"}
        className={`${SECUNDARIO} w-full justify-center`}
      >
        <IconoCarrito />
        Pedir precio
      </Link>
    );
  }
  return (
    <Link
      href={`/guias/nueva?cotizacion=${pedido.cotizacion_id}`}
      className={`${PRINCIPAL} w-full justify-center`}
    >
      <IconoGuia />
      Preparar guía
    </Link>
  );
}

const SECUNDARIO =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

const PRINCIPAL =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-brand-600 px-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

function IconoVer() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoGuia() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 3h13v13H1z" />
      <path d="M14 8h4l3 3v5h-7" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="17.5" cy="19" r="2" />
    </svg>
  );
}

function IconoCarrito() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h2.5l2.2 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L20 7H5.2" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
    </svg>
  );
}
