import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Printer } from "lucide-react";
import {
  Badge,
  EstadoBadge,
  EstadoError,
  Moneda,
  buttonVariants,
  cn,
  formatearFecha,
} from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { estadoConfiguracion } from "../api/configuracion";
import { detalleComprobante, motivosNota, yaAcreditadoDe } from "../api/consultas";
import { ETIQUETA_SUNAT, ETIQUETA_TIPO } from "../dominio/tipos";
import { EmisorNota } from "./emisor-nota";
import { EnviarASunat } from "./enviar-sunat";
import { abreviaturaUnidad } from "@rodatech/config";
import { Volver } from "@/componentes/volver";

/**
 * Ficha de un comprobante.
 *
 * Es un documento fiscal: no hay botón de editar, y no lo habrá. Corregir una
 * factura emitida se hace con una nota de crédito, que es otro documento con su
 * propio correlativo. Ese es el diseño que impone SUNAT y el que evita que un
 * número ya declarado cambie de contenido.
 */
export default async function PaginaDetalleComprobante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil, config, motivos, acreditado] = await Promise.all([
    detalleComprobante(id),
    perfilActual(),
    estadoConfiguracion(),
    motivosNota(),
    yaAcreditadoDe(id),
  ]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el comprobante"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const c = resultado.datos;
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEnviar = rol !== null && ["gerencia", "admin", "ventas"].includes(rol);

  // La fecha del servidor con la zona de Lima: acaba en un documento fiscal,
  // así que no puede depender del reloj del equipo.
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="anim-entrada flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Volver href="/facturacion">Volver a facturación</Volver>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              {c.numero}
            </h1>
            <Badge tone="neutral">{ETIQUETA_TIPO[c.tipo]}</Badge>
            {/* El mismo badge que el listado. Aquí se quedó `Badge` con
                `TONO_SUNAT` —plano y sin punto— cuando la tabla pasó a
                `EstadoBadge`: el estado ante SUNAT es lo que más caro sale
                confundir, y se leía distinto en la lista y en la ficha. */}
            <EstadoBadge
              estado={c.estado_sunat}
              etiqueta={ETIQUETA_SUNAT[c.estado_sunat]}
            />
            {c.estado === "anulado" ? <Badge tone="danger">Anulado</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            {c.cliente ?? "—"}
            {c.cliente_documento ? ` · ${c.cliente_documento}` : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 no-print">
          <div className="flex flex-wrap items-center gap-2">
            {/*
              Descargar e imprimir, iguales que en la guía y la cotización.

              Los dos van a la hoja con `auto=1`, que abre la ventana de
              imprimir sola. Descargar en azul porque con una factura lo
              primero que se hace es mandársela al cliente.

              Los tres con `buttonVariants` (revisión por módulos del 02/10):
              «Imprimir» llevaba el borde fuerte y «Emitir nota» el suave, y
              al lado parecían de dos familias distintas.
            */}
            <Link
              href={`/facturacion/${c.id}/imprimir?auto=1`}
              className={cn(buttonVariants({ variant: "primary" }), "px-3")}
            >
              <IconoDescargar />
              Descargar
            </Link>
            <Link
              href={`/facturacion/${c.id}/imprimir?auto=1`}
              className={cn(buttonVariants({ variant: "outline" }), "px-3")}
            >
              <IconoImprimir />
              Imprimir
            </Link>
            {/* Corregir una factura emitida es emitir una nota, no editarla.
                Por eso el botón vive aquí, junto al documento que corrige. */}
            {puedeEnviar ? (
              <EmisorNota
                documento={c}
                motivos={motivos.ok ? motivos.datos : []}
                hoy={hoy}
                yaAcreditado={acreditado}
              />
            ) : null}
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------- Cifras */}
      {/*
        Las cifras, en 18 px y con su color.

        `Moneda` pone su propio tamaño y color, así que el `text-lg` y el
        verde/ámbar de la tarjeta no le llegaban: el saldo salía en negro de
        14 px tanto si estaba cobrado como si no. Ahora se le pasan a ella
        (revisión por módulos del 02/10). Y una anulada no tiene saldo: decía
        «$ 1,018.17 · pagado 0.00», que se lee como una deuda viva.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta etiqueta="Gravada" valor={<Moneda valor={c.op_gravada} tamano="lg" className="text-lg" />} />
        <Tarjeta
          etiqueta="IGV"
          valor={<Moneda valor={c.igv} tamano="lg" enfasis="suave" className="text-lg" />}
        />
        <Tarjeta etiqueta="Total" valor={<Moneda valor={c.total} tamano="lg" className="text-lg" />} />
        {c.estado === "anulado" ? (
          <Tarjeta
            etiqueta="Saldo"
            valor={<span className="text-[var(--fg-muted)]">No se cobra</span>}
            pie="El comprobante está anulado."
          />
        ) : (
          <Tarjeta
            etiqueta="Saldo"
            valor={
              <Moneda
                valor={c.saldo}
                tamano="lg"
                className={`text-lg ${c.saldo <= 0 ? "text-ok" : "text-warn"}`}
              />
            }
            pie={c.saldo <= 0 ? "Cobrado" : <>Pagado <Moneda valor={c.pagado} tamano="sm" enfasis="suave" /></>}
          />
        )}
      </div>

      {c.total_letras ? (
        <p className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-sm">
          <span className="text-[var(--fg-muted)]">Son: </span>
          {c.total_letras}
        </p>
      ) : null}

      {/*
        `min-w-0` en las dos columnas: un hijo de rejilla no baja de lo que
        mide su contenido, y a 820 px la tabla del detalle empujaba la página
        201 px de lado (revisión por módulos del 02/10).
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ Líneas */}
        <section className="card @container min-w-0 p-4">
          <h2 className="mb-3 text-sm font-semibold">
            Detalle
            <span className="ml-1.5 font-normal text-[var(--fg-muted)]">
              · {c.lineas.length} {c.lineas.length === 1 ? "línea" : "líneas"}
            </span>
          </h2>
          {/*
            La tabla, solo cuando la CAJA pasa de 32 rem (`@lg`: 544 px con
            la letra de 17 px de esta casa).

            Cinco columnas en 414 px se leen arrastrando, y para cruzar el
            código con su importe hay que ir y volver. Luis, 11/09: *«las
            tablas de información de los productos, ponerlos como card»*.

            Revisión por módulos del 02/10: el corte era `md` de la PANTALLA,
            y a 1280 la caja mide 625 px: la tabla salía y se cortaba en
            «V. U…», con el importe fuera. Ahora se mide la caja, y el código
            va encima de la descripción en la misma celda —como en la
            tarjeta—, que es lo que hace que quepan las cifras.

            El comprobante impreso —el que vale— vive en
            `/facturacion/[id]/imprimir` y no se toca: ahí sigue siendo una
            tabla porque es el papel que se le entrega al cliente.
          */}
          <div className="scroll-x hidden @lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 text-right font-medium">Cant.</th>
                  <th className="py-2 pr-3 text-right font-medium">V. unit.</th>
                  <th className="py-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {c.lineas.map((l, i) => (
                  <tr
                    key={l.id}
                    className="anim-entrada border-b border-[var(--border-soft)] align-top last:border-0"
                    style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
                  >
                    <td className="py-2 pr-3">
                      <CodigoLinea id={l.producto_id} codigo={l.codigo} />
                      <span className="block text-[var(--fg-muted)]">{l.descripcion}</span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular">
                      {l.cantidad}{" "}
                      <span className="text-sm text-[var(--fg-subtle)]">
                        {abreviaturaUnidad(l.unidad)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular">
                      {l.valor_unitario.toFixed(4)}
                      {l.descuento_pct > 0 ? (
                        <span className="block text-sm text-[var(--fg-subtle)]">
                          −{l.descuento_pct}%
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right">
                      <Moneda valor={l.importe} tamano="sm" enfasis="fuerte" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --------------------------------------------------- Móvil */}
          <ul className="flex flex-col divide-y divide-[var(--border-soft)] @lg:hidden">
            {c.lineas.map((l) => (
              <li key={l.id} className="flex flex-col gap-1 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <CodigoLinea id={l.producto_id} codigo={l.codigo} />
                  <Moneda
                    valor={l.importe}
                    tamano="sm"
                    enfasis="fuerte"
                    className="shrink-0"
                  />
                </div>

                <p className="text-sm text-[var(--fg-muted)]">{l.descripcion}</p>

                {/* La cuenta entera: «4 NIU × 25.4000». Sin cabecera que
                    explique las columnas, se escribe la multiplicación. */}
                <p className="text-sm text-[var(--fg-muted)]">
                  <span className="tabular">{l.cantidad}</span> {abreviaturaUnidad(l.unidad)} ×{" "}
                  <span className="tabular">{l.valor_unitario.toFixed(4)}</span>
                  {l.descuento_pct > 0 ? (
                    <span className="text-[var(--fg-subtle)]">
                      {" "}
                      −{l.descuento_pct}%
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------- Datos */}
        <div className="flex flex-col gap-4">
          {/* Lo primero de la columna es lo accionable: el estado del envío. */}
          <section className="card p-4 no-print">
            <h2 className="mb-3 text-sm font-semibold">SUNAT</h2>

            {/*
              Una anulada o dada de baja no se envía. Aquí caía en el aviso
              «está emitido pero no se ha enviado… se envía desde aquí», que
              sobre un documento dado de baja es justo lo contrario de lo que
              hay que hacer (revisión por módulos del 02/10, F002-00000016).
            */}
            {c.estado === "anulado" ||
            c.estado_sunat === "baja_aceptada" ||
            c.estado_sunat === "baja_solicitada" ? (
              <div className="rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-sm">
                <p className="font-medium">{ETIQUETA_SUNAT[c.estado_sunat]}.</p>
                <p className="mt-0.5 text-[var(--fg-muted)]">
                  Este comprobante está anulado: no se envía a SUNAT ni se cobra.
                </p>
              </div>
            ) : c.estado_sunat === "aceptado" ? (
              <div className="rounded-sm border border-[var(--ok)] bg-[var(--surface-2)] p-2.5 text-sm">
                <p className="font-medium">Aceptado.</p>
                {c.sunat_enviado_en ? (
                  <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
                    {new Date(c.sunat_enviado_en).toLocaleString("es-PE")}
                  </p>
                ) : null}
                {c.sunat_hash_cdr ? (
                  <p className="mt-1 break-all font-mono text-sm text-[var(--fg-subtle)]">
                    {c.sunat_hash_cdr}
                  </p>
                ) : null}
              </div>
            ) : puedeEnviar ? (
              <EnviarASunat
                id={c.id}
                numero={c.numero}
                configurado={config.listo}
                yaAceptado={false}
              />
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">
                {ETIQUETA_SUNAT[c.estado_sunat]}. Tu rol no puede enviarlo.
              </p>
            )}

            {c.sunat_mensaje && c.estado_sunat !== "aceptado" ? (
              <p className="mt-2 text-sm text-[var(--fg-muted)]">
                Último mensaje: {c.sunat_mensaje}
              </p>
            ) : null}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Datos</h2>
            <dl className="flex flex-col gap-2 text-sm">
              {/* Fechas como en el papel (20/07/2026), y el vencimiento en su
                  propia línea: a 390 px «vence 2026-07-20» se partía en
                  «2026-07-» y «20» (revisión por módulos del 02/10). */}
              <Dato etiqueta="Emisión" valor={formatearFecha(c.fecha_emision)} />
              <Dato
                etiqueta="Pago"
                valor={
                  c.condicion_pago === "credito" ? (
                    <>
                      Crédito a {c.dias_credito} {c.dias_credito === 1 ? "día" : "días"}
                      {c.fecha_vencimiento ? (
                        <span className="block whitespace-nowrap">
                          vence {formatearFecha(c.fecha_vencimiento)}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    "Al contado"
                  )
                }
              />
              <Dato etiqueta="Cotización" valor={c.cotizacion_numero ?? "—"} />
              {/*
                Desde la 089 no se factura sin guía, así que el número de la
                guía es lo que justifica que esta factura exista. Salía en el
                papel y no en la ficha: para comprobarlo había que imprimir.
              */}
              <Dato
                etiqueta={
                  c.guia_numero?.includes(",") ? "Guías de remisión" : "Guía de remisión"
                }
                valor={c.guia_numero ?? "—"}
              />
              <Dato etiqueta="Orden de compra" valor={c.orden_compra_cliente ?? "—"} />
              {c.referencia_numero ? (
                <Dato etiqueta="Corrige a" valor={c.referencia_numero} />
              ) : null}
              <Dato etiqueta="Vendedor" valor={c.vendedor ?? "—"} />
            </dl>

            {c.detraccion_aplica ? (
              <div className="mt-3 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-sm">
                <p className="font-medium">
                  Detracción {c.detraccion_porcentaje}% ·{" "}
                  <Moneda valor={c.detraccion_monto} tamano="sm" />
                </p>
                <p className="mt-0.5 text-[var(--fg-muted)]">
                  El cliente paga{" "}
                  <Moneda valor={c.total - c.detraccion_monto} tamano="sm" enfasis="suave" /> y
                  deposita el resto en la cuenta de detracciones.
                </p>
              </div>
            ) : null}

            {c.observaciones ? (
              <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-sm text-[var(--fg-muted)]">
                {c.observaciones}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  pie?: React.ReactNode;
}) {
  return (
    <div className="card anim-entrada p-3">
      <p className="text-sm text-[var(--fg-muted)]">{etiqueta}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular">{valor}</p>
      {pie ? <p className="mt-0.5 text-sm text-[var(--fg-subtle)]">{pie}</p> : null}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words">{valor}</dd>
    </div>
  );
}

/**
 * El código de la línea: enlace a la ficha si viene del catálogo.
 *
 * Partido por cualquier carácter si no cabe: hay códigos como
 * «35X58X10-HMSA10RG» que, sin espacios, empujaban la tarjeta de lado.
 */
function CodigoLinea({ id, codigo }: { id: string | null; codigo: string }) {
  return id ? (
    <Link
      href={`/productos/${id}`}
      className="min-w-0 break-all font-mono text-sm font-semibold text-brand-600 hover:underline"
    >
      {codigo}
    </Link>
  ) : (
    <span className="min-w-0 break-all font-mono text-sm font-semibold">{codigo}</span>
  );
}

function IconoDescargar() {
  return <Download aria-hidden="true" className="size-[18px] shrink-0" />;
}

function IconoImprimir() {
  return <Printer aria-hidden="true" className="size-[18px] shrink-0" />;
}
