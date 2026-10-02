import Link from "next/link";
import { Eye, Printer } from "lucide-react";
import {
  Badge,
  EstadoBadge,
  EstadoError,
  EstadoVacio,
  Moneda,
  PaginacionKeyset,
  formatearFecha,
} from "@rodatech/ui";

import { listarComprobantes } from "../api/consultas";
import {
  ETIQUETA_SUNAT,
  ETIQUETA_TIPO,
  type ComprobanteLista,
  type FiltrosComprobantes,
} from "../dominio/tipos";

/**
 * Listado de comprobantes.
 *
 * Dos estados por fila y no uno, porque son dos cosas distintas que se
 * confunden a diario: el estado COMERCIAL (si está cobrado) y el estado ante
 * SUNAT (si está aceptado). Una factura puede estar pagada y rechazada a la
 * vez, y esa combinación es justo la que hay que ver.
 *
 * Tabla o tarjetas según el ancho de LA CAJA (`@container` en la sección de
 * `pagina.tsx`), no de la pantalla. Revisión por módulos del 02/10: con el
 * corte en `md` de la pantalla, a 820 px —el menú abierto deja 500 px a la
 * caja— la tabla salía y solo se veían «Documento» y «Fecha»: el cliente, el
 * total y el saldo quedaban detrás de la columna de acciones. Y a 1280 la
 * tabla medía 1235 px en una caja de 955: el total salía cortado en «T».
 */
export async function TablaComprobantes({
  filtros,
}: {
  filtros: FiltrosComprobantes;
}) {
  const resultado = await listarComprobantes(filtros);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar los comprobantes"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente, anterior } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(
      filtros.q || filtros.cliente || filtros.tipo || filtros.estado ||
      filtros.sunat || filtros.desde || filtros.hasta,
    );
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún comprobante coincide" : "Todavía no se ha facturado"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por el número del documento."
            : "Los comprobantes nacen de una cotización aprobada. Aprueba una y factúrala desde aquí."
        }
      />
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* ------------------------------------------------ Escritorio */}
      {/*
        Seis columnas y no ocho, para que quepa en la caja de 1280 con el menú
        abierto (955 px) sin desplazarse de lado (revisión por módulos del
        02/10):

        - El estado ante SUNAT y «Anulado» van debajo del número, junto al
          tipo. Son tres datos DEL documento y se leen juntos.
        - El saldo va debajo del total, con su vencimiento: un vencimiento
          solo importa mientras queda algo por cobrar, y en la columna de la
          fecha ensanchaba todas las filas aunque estuvieran cobradas.
        - «Cotización» ya estaba escondida hasta 1536 px; se queda así.

        El corte es `@3xl` (48 rem = 816 px con la letra de 17 px): con
        `@4xl` (952) la tabla salía a 1280 por tres píxeles, y con la barra de
        desplazamiento de Windows ya no.
      */}
      <div className="scroll-x hidden @3xl:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-3 py-2.5 font-medium">Documento</th>
              <th className="px-3 py-2.5 font-medium">Fecha</th>
              <th className="px-3 py-2.5 font-medium">Cliente</th>
              <th className="hidden px-3 py-2.5 font-medium 2xl:table-cell">Cotización</th>
              <th className="px-3 py-2.5 text-right font-medium">Importe</th>
              <th className="sticky right-0 z-20 border-l border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c, i) => (
              <tr
                key={c.id}
                // Entrada escalonada. El retraso se corta a la sexta fila: más
                // allá el usuario ya está leyendo y una fila que aparece tarde
                // distrae en vez de guiar.
                className={`anim-entrada group/fila border-b border-[var(--border-soft)] align-top transition-colors hover:bg-[var(--surface-2)] ${
                  c.estado === "anulado" ? "opacity-60" : ""
                }`}
                style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
              >
                <td className="px-3 py-2.5">
                  {/*
                    El tipo, al lado del número y no debajo en gris.

                    Es lo primero que hay que saber de una fila —una nota de
                    crédito no se lee como una factura— y en 12 px grises se
                    perdía. Como en el prototipo de Luis (10/09).
                  */}
                  <Link
                    href={`/facturacion/${c.id}`}
                    className="whitespace-nowrap font-mono text-sm font-medium text-brand-600 hover:underline"
                  >
                    {c.numero}
                  </Link>
                  <Insignias c={c} />
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 tabular">
                  {formatearFecha(c.fecha_emision)}
                </td>

                <td className="px-3 py-2.5">
                  {/* El nombre parte línea en vez de cortarse: «PRODUCTOS
                      QUIMIC…» no le dice a Willy de quién es la factura. */}
                  <span className="block">{c.cliente ?? "—"}</span>
                  <span className="block font-mono text-sm text-[var(--fg-subtle)]">
                    {c.cliente_documento ?? ""}
                  </span>
                </td>

                <td className="hidden px-3 py-2.5 font-mono text-[var(--fg-muted)] 2xl:table-cell">
                  {c.cotizacion_numero ?? "—"}
                </td>

                <td className="px-3 py-2.5 text-right">
                  <Moneda valor={c.total} tamano="sm" enfasis="fuerte" />
                  <Saldo c={c} hoy={hoy} />
                </td>

                {/*
                  Ver e Imprimir por fila, igual que en guías.

                  Rejilla de dos columnas fijas: con anchos libres, «Ver»
                  quedaría en una equis distinta en cada fila. Fija a la
                  derecha por si la caja se queda corta.
                */}
                <td className="sticky right-0 z-10 border-l border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5 group-hover/fila:bg-[var(--surface-2)]">
                  <div className="ml-auto grid w-[196px] grid-cols-[80px_1fr] gap-1.5">
                    <Link
                      href={`/facturacion/${c.id}`}
                      className={`${SECUNDARIO} w-full justify-center`}
                    >
                      <IconoVer />
                      Ver
                    </Link>
                    <Link
                      href={`/facturacion/${c.id}/imprimir?auto=1`}
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
        Los comprobantes, en tarjetas sueltas.

        Luis, 11/09, mirando esta pantalla en el teléfono: *«igual que
        facturación, todo junto, apegado»*. Estaban separadas por una raya de
        un píxel y con tres datos apretados en una línea: total, saldo y estado
        de SUNAT seguidos, sin decir cuál es cuál.

        Ahora cada comprobante es una tarjeta con su borde, y dentro lleva lo
        mismo que la fila de escritorio —incluidos los dos botones—, cada dato
        con su etiqueta. Es como lo tiene su prototipo. En una caja mediana
        (una tableta) van de dos en dos, para no estirar cada tarjeta a 700 px.
      */}
      <ul className="grid gap-2.5 p-3 @3xl:hidden @2xl:grid-cols-2">
        {filas.map((c, i) => {
          const vencida = esVencida(c, hoy);

          return (
            <li
              key={c.id}
              className={`anim-entrada flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${
                c.estado === "anulado" ? "opacity-60" : ""
              }`}
              style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Link
                  href={`/facturacion/${c.id}`}
                  className="font-mono text-sm font-semibold text-brand-600"
                >
                  {c.numero}
                </Link>
              </div>
              {/* El tipo y los dos estados juntos, debajo del número: una nota
                  de crédito no se lee como una factura, y es lo primero que
                  hay que saber. */}
              <Insignias c={c} />

              <div>
                <p className="text-sm font-medium">{c.cliente ?? "—"}</p>
                {c.cliente_documento ? (
                  <p className="font-mono text-sm text-[var(--fg-subtle)]">
                    {c.cliente_documento}
                  </p>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <Dato etiqueta="Fecha">
                  <span className="tabular">{formatearFecha(c.fecha_emision)}</span>
                </Dato>
                {/* La cotización solo si la hay: las 515 facturas del
                    histórico no tienen, y un «—» en cada tarjeta era una
                    línea entera de nada. */}
                {c.cotizacion_numero ? (
                  <Dato etiqueta="Cotización">
                    <span className="font-mono">{c.cotizacion_numero}</span>
                  </Dato>
                ) : null}
                <Dato etiqueta="Total">
                  <Moneda valor={c.total} tamano="sm" enfasis="fuerte" />
                </Dato>
                <Dato etiqueta="Saldo">
                  {c.estado === "anulado" ? (
                    <span className="text-[var(--fg-muted)]">No se cobra</span>
                  ) : c.saldo <= 0 ? (
                    <span className="font-medium text-[var(--ok)]">Cobrado</span>
                  ) : (
                    <>
                      <Moneda
                        valor={c.saldo}
                        tamano="sm"
                        className={vencida ? "font-medium text-danger" : ""}
                      />
                      {/* El vencimiento debajo y en rojo cuando ya pasó: es
                          de lo que se cobra. */}
                      {c.fecha_vencimiento ? (
                        <span
                          className={`block text-sm ${
                            vencida
                              ? "font-medium text-[var(--danger)]"
                              : "text-[var(--fg-subtle)]"
                          }`}
                        >
                          vence {formatearFecha(c.fecha_vencimiento)}
                        </span>
                      ) : null}
                    </>
                  )}
                </Dato>
              </dl>

              <div className="mt-auto flex items-center gap-1.5">
                <Link
                  href={`/facturacion/${c.id}`}
                  className={`${SECUNDARIO} flex-1 justify-center`}
                >
                  <IconoVer />
                  Ver
                </Link>
                <Link
                  href={`/facturacion/${c.id}/imprimir?auto=1`}
                  className={`${SECUNDARIO} flex-1 justify-center [&>svg]:text-brand-600`}
                >
                  <IconoImprimir />
                  Imprimir
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="px-3 py-3 sm:px-4">
        <PaginacionKeyset
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={anterior}
          porPagina={filtros.limite}
        />
      </div>
    </>
  );
}

function esVencida(c: ComprobanteLista, hoy: string): boolean {
  return (
    c.saldo > 0 &&
    c.fecha_vencimiento !== null &&
    c.fecha_vencimiento < hoy &&
    c.estado !== "anulado"
  );
}

/**
 * El tipo, el estado ante SUNAT y «Anulado», juntos.
 *
 * El mismo badge que guías y compras. La etiqueta la sigue poniendo el
 * módulo: el catálogo dice «Enviado» y aquí se llama igual, pero `pendiente`
 * es «En cola» y eso solo lo sabe facturación.
 */
function Insignias({ c }: { c: ComprobanteLista }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <Badge tone={c.tipo === "nota_credito" ? "warning" : "info"} size="xs">
        {ETIQUETA_TIPO[c.tipo]}
      </Badge>
      <EstadoBadge
        estado={c.estado_sunat}
        etiqueta={ETIQUETA_SUNAT[c.estado_sunat]}
        size="xs"
      />
      {c.estado === "anulado" ? (
        <span className="rounded-sm bg-[var(--danger-bg)] px-1.5 py-0.5 text-sm font-medium text-[var(--danger)]">
          Anulado
        </span>
      ) : null}
    </span>
  );
}

/**
 * Lo que queda por cobrar, debajo del total.
 *
 * «Cobrado» es un VALOR, no una etiqueta: va al lado de importes y en 12 px
 * se leía como un pie de nota. El rojo va en el propio importe —`Moneda`
 * pinta su color y el de un `<span>` de fuera no le llegaba—.
 */
function Saldo({ c, hoy }: { c: ComprobanteLista; hoy: string }) {
  if (c.estado === "anulado") {
    return <span className="block whitespace-nowrap text-sm text-[var(--fg-muted)]">No se cobra</span>;
  }
  if (c.saldo <= 0) {
    return <span className="block text-sm font-medium text-[var(--ok)]">Cobrado</span>;
  }
  const vencida = esVencida(c, hoy);
  const color = vencida ? "font-medium text-danger" : "text-warn";
  return (
    <span className={`block whitespace-nowrap text-sm ${color}`}>
      Debe <Moneda valor={c.saldo} tamano="sm" className={color} />
      {c.fecha_vencimiento ? (
        <span className="block">
          {vencida ? "venció" : "vence"} {formatearFecha(c.fecha_vencimiento)}
        </span>
      ) : null}
    </span>
  );
}

/*
  Los botones de la columna de acciones.

  El ancho lo pone la rejilla de la celda y no el texto: es lo que mantiene la
  columna a plomo entre filas. Mismo patrón que en cotizaciones y guías.
*/
const SECUNDARIO =
  "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

function IconoVer() {
  return <Eye aria-hidden="true" className="size-4 shrink-0" />;
}

function IconoImprimir() {
  return <Printer aria-hidden="true" className="size-4 shrink-0" />;
}

/**
 * Un dato de la tarjeta de móvil: su etiqueta encima y el valor debajo, los
 * dos en 14 px, que es el mínimo de esta casa.
 *
 * Sin cabecera de tabla que diga qué es cada cosa, cada dato tiene que
 * presentarse solo.
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
      <dt className="text-sm text-[var(--fg-subtle)]">{etiqueta}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
