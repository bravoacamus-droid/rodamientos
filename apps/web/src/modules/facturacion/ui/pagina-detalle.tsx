import Link from "next/link";
import { notFound } from "next/navigation";
import { mensajeParaPersona } from "@rodatech/sunat/red";
import { Building2, HandCoins, Printer } from "lucide-react";
import {
  Badge,
  EstadoBadge,
  EstadoError,
  Moneda,
  buttonVariants,
  cn,
  formatearFecha,
} from "@rodatech/ui";
import { misPermisos } from "@/lib/permisos";
import { HistorialDocumento } from "@/modules/bitacora/ui/historial-documento";
import { ETIQUETA_MEDIO, VoucherDelPago, pagosDe } from "@/modules/cobranzas";

import { estadoConfiguracion } from "../api/configuracion";
import { crDe, detalleComprobante, motivosNota, notasDe, seriesDeNota, yaAcreditadoDe } from "../api/consultas";
import { enlacesDelComprobante } from "../api/ficha-enlaces";
import { RegistrarCr } from "./registrar-cr";
import { cuotasNetas } from "../dominio/retencion";
import { ETIQUETA_SUNAT, ETIQUETA_TIPO } from "../dominio/tipos";
import { EmisorNota } from "./emisor-nota";
import { EnviarASunat } from "./enviar-sunat";
import { abreviaturaUnidad } from "@rodatech/config";
import { Volver } from "@/componentes/volver";
import { BotonDescargarPdf } from "@/componentes/boton-pdf";
import { cuentasParaCobrar, emisorParaImprimir } from "@/lib/emisor";
import { nombreArchivo } from "@/lib/pdf-hoja";
import { VistaPreviaDocumento } from "@/modules/cotizaciones/ui/detalle/vista-previa";
import { DocumentoComprobante } from "./documento";
import { hojaDeComprobante } from "./papel";
import { qrDeComprobante } from "../api/qr";
import { enMonedaDelDocumento } from "../dominio/moneda-documento";

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
  const [resultado, perfil, config, motivos, acreditado, emisor, cuentas, notas, series, cr, enlaces, pagos] = await Promise.all([
    detalleComprobante(id),
    misPermisos(),
    estadoConfiguracion(),
    motivosNota(),
    yaAcreditadoDe(id),
    emisorParaImprimir(),
    cuentasParaCobrar(),
    notasDe(id),
    seriesDeNota(),
    crDe(id),
    // De dónde viene y quién la anuló (TR-05, TR-07), y sus cobros (TR-06).
    enlacesDelComprobante(id),
    pagosDe(id),
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

  // En la moneda en que se emitió (116): en soles, todo lo de abajo en soles.
  const c = enMonedaDelDocumento(resultado.datos);
  // El PDF, armado aquí con lo mismo que pinta el papel (14/10).
  // El QR y el hash de la representación impresa (15/10).
  const qr = await qrDeComprobante(resultado.datos, emisor.ruc);
  const hoja = hojaDeComprobante(c, emisor, cuentas, qr);
  const archivo = nombreArchivo(c.numero, c.cliente);
  // Mandar a SUNAT y hacer notas es trabajar sobre la factura; cobrarla, de
  // Cobranzas; la constancia de retención la sube cualquiera de los dos (143).
  const puedeEnviar = perfil.tiene("facturacion", "editar");
  const puedeCobrar = perfil.tiene("cobranzas", "crear");
  const puedeCr = puedeEnviar || puedeCobrar;

  /*
    Auditoría del 14/10: la ficha de una NOTA enseñaba saldo, forma de pago,
    guía y O/C —que no le tocan— y no decía su motivo; y la de una factura no
    llevaba a su cobro ni a las notas que la corrigen.
  */
  const esNota = c.tipo === "nota_credito" || c.tipo === "nota_debito";
  const anulado = c.estado === "anulado";
  const motivoNota = c.motivo_nota_codigo
    ? ((motivos.ok ? motivos.datos : []).find((m) => m.codigo === c.motivo_nota_codigo)?.descripcion ??
      `Código ${c.motivo_nota_codigo}`)
    : null;
  // Con todo ya acreditado no queda nada que corregir: el botón sobra.
  const quedaPorAcreditar = resultado.datos.total - acreditado > 0.005;

  // La fecha del servidor con la zona de Lima: acaba en un documento fiscal,
  // así que no puede depender del reloj del equipo.
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  // Si los enlaces no cargan, la ficha cae al texto de siempre: es un dato de
  // más, no uno sin el que no se pueda trabajar.
  const enl = enlaces.ok ? enlaces.datos : null;
  const anulacion = enl?.anulacion ?? null;
  // Los pagos se guardan en dólares; en una factura en soles, a la misma
  // proporción que el saldo (116), para que sumen lo que dice la tarjeta.
  const original = resultado.datos;
  const factorPagos =
    original.moneda === "PEN" && original.pen && original.total > 0 ? original.pen.total / original.total : 1;
  const puedeSubirVoucher = perfil.tiene("cobranzas", "editar");

  return (
    <>
    {/*
      La ficha, en pantalla; al imprimir, solo el papel (14/10). El «Imprimir»
      de la vista previa saca la PÁGINA, y sin esto sacaba la ficha.
    */}
    <div className="flex flex-col gap-5 print:hidden">
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
            {/* El mismo de la lista, con su raya y su tachado (UI1-05). */}
            {c.estado === "anulado" ? <EstadoBadge estado="anulada" etiqueta="Anulado" /> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-sm text-[var(--fg-muted)]">
              {c.cliente ?? "—"}
              {c.cliente_documento ? ` · ${c.cliente_documento}` : ""}
            </p>
            <BotonFichaCliente id={c.cliente_id} />
          </div>
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
            {/* Vista previa y «Descargar PDF» de verdad, como en la
                cotización (14/10). «Descargar» llevaba a la ventana de
                imprimir del navegador. */}
            <VistaPreviaDocumento numero={c.numero} junto={<BotonDescargarPdf hoja={hoja} nombre={archivo} />}>
              <DocumentoComprobante c={c} emisor={emisor} cuentas={cuentas} qr={qr} />
            </VistaPreviaDocumento>
            {/* Anulado, el PDF no va en azul: no es lo que se le manda a nadie. */}
            <BotonDescargarPdf hoja={hoja} nombre={archivo} variante={anulado ? "outline" : "primary"} />
            {/* El cobro, desde la factura (auditoría 14/10): solo se llegaba
                desde la tarjeta «Falta cobrar» de la lista. */}
            {puedeCobrar && !esNota && !anulado && c.saldo > 0 ? (
              <Link
                href={`/cobranzas?q=${encodeURIComponent(c.numero)}`}
                className={cn(buttonVariants({ variant: "outline" }), "px-3")}
              >
                <HandCoins className="size-4" aria-hidden="true" />
                Registrar cobro
              </Link>
            ) : null}
            <Link
              href={`/facturacion/${c.id}/imprimir?auto=1`}
              className={cn(buttonVariants({ variant: "outline" }), "px-3")}
            >
              <IconoImprimir />
              Imprimir
            </Link>
            {/* Corregir una factura emitida es emitir una nota, no editarla.
                Por eso el botón vive aquí, junto al documento que corrige. */}
            {puedeEnviar && !esNota && !anulado && quedaPorAcreditar ? (
              <EmisorNota
                // El original, en dólares: la nota se arma en dólares y la
                // base la pasa a soles (116). El diálogo enseña en soles.
                documento={resultado.datos}
                motivos={motivos.ok ? motivos.datos : []}
                hoy={hoy}
                yaAcreditado={acreditado}
                series={series}
              />
            ) : null}
          </div>
        </div>
      </header>

      {/*
        Quién la anuló, cuándo y por qué (TR-07). Decía «No se cobra · El
        comprobante está anulado» y nada más, aunque la base guarda las tres
        cosas. Las bajas por SUNAT no apuntan a la persona: sale sin nombre.
      */}
      {anulacion ? (
        <p className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm">
          <strong>{fraseAnulacion(anulacion.en, anulacion.por)}</strong>
          {anulacion.motivo ? <> Motivo: {anulacion.motivo}</> : null}
        </p>
      ) : null}

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
        <Tarjeta etiqueta="Gravada" valor={<Moneda moneda={c.moneda} valor={c.op_gravada} tamano="lg" className="text-lg" />} />
        <Tarjeta
          etiqueta="IGV"
          valor={<Moneda moneda={c.moneda} valor={c.igv} tamano="lg" enfasis="suave" className="text-lg" />}
        />
        <Tarjeta etiqueta="Total" valor={<Moneda moneda={c.moneda} valor={c.total} tamano="lg" className="text-lg" />} />
        {esNota ? (
          <Tarjeta
            etiqueta="Motivo"
            valor={<span className="text-base font-semibold">{motivoNota ?? "—"}</span>}
            pie={c.referencia_numero ? `Corrige a ${c.referencia_numero}` : undefined}
          />
        ) : c.estado === "anulado" ? (
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
                moneda={c.moneda}
                valor={c.saldo}
                tamano="lg"
                className={`text-lg ${c.saldo <= 0 ? "text-ok" : "text-warn"}`}
              />
            }
            pie={c.saldo <= 0 ? "Cobrado" : <>Pagado <Moneda moneda={c.moneda} valor={c.pagado} tamano="sm" enfasis="suave" /></>}
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
                      {l.valor_unitario.toFixed(c.moneda === "PEN" ? 2 : 4)}
                      {l.descuento_pct > 0 ? (
                        <span className="block text-sm text-[var(--fg-subtle)]">
                          −{l.descuento_pct}%
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right">
                      <Moneda moneda={c.moneda} valor={l.importe} tamano="sm" enfasis="fuerte" />
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
                    moneda={c.moneda}
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
                  <span className="tabular">{l.valor_unitario.toFixed(c.moneda === "PEN" ? 2 : 4)}</span>
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
                    {new Date(c.sunat_enviado_en).toLocaleString("es-PE", { timeZone: "America/Lima" })}
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
                {/* Los cortes guardados en crudo («fetch failed») se leen en cristiano (21/10). */}
                Último mensaje: {mensajeParaPersona(c.sunat_mensaje)}
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
              {esNota ? (
                <>
                  <Dato etiqueta="Motivo" valor={motivoNota ?? "—"} />
                  {c.referencia_id ? (
                    <Dato
                      etiqueta="Corrige a"
                      valor={
                        <Link href={`/facturacion/${c.referencia_id}`} className="font-medium text-brand-700 underline dark:text-brand-300">
                          {c.referencia_numero ?? "el comprobante"}
                        </Link>
                      }
                    />
                  ) : null}
                </>
              ) : (
                <>
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
              {/* Enlazada, como el pedido de abajo (TR-05): era texto, y para
                  ir a ella había que saberse el número y buscarlo. */}
              <Dato
                etiqueta="Cotización"
                valor={
                  enl?.cotizacion ? (
                    <Link href={`/cotizaciones/${enl.cotizacion.id}`} className={ENLACE_DOC}>
                      {enl.cotizacion.numero}
                    </Link>
                  ) : (
                    (c.cotizacion_numero ?? "—")
                  )
                }
              />
              {/* Al pedido que factura (revisión del 15/10). */}
              {c.pedido ? (
                <Dato
                  etiqueta="Pedido"
                  valor={
                    <Link href={`/pedidos/${c.pedido.id}`} className={ENLACE_DOC}>
                      {c.pedido.numero}
                    </Link>
                  }
                />
              ) : null}
              {/*
                Desde la 089 no se factura sin guía, así que el número de la
                guía es lo que justifica que esta factura exista. Salía en el
                papel y no en la ficha: para comprobarlo había que imprimir.
              */}
              {/* Y cada guía es un enlace, una por línea (TR-05). */}
              {enl && enl.guias.length > 0 ? (
                <Dato
                  etiqueta={enl.guias.length > 1 ? "Guías de remisión" : "Guía de remisión"}
                  valor={
                    <ul className="flex flex-col gap-0.5">
                      {enl.guias.map((g) => (
                        <li key={g.id}>
                          <Link href={`/guias/${g.id}`} className={ENLACE_DOC}>
                            {g.numero}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  }
                />
              ) : (
                <Dato
                  etiqueta={
                    c.guia_numero?.includes(",") ? "Guías de remisión" : "Guía de remisión"
                  }
                  valor={c.guia_numero ?? "—"}
                />
              )}
              <Dato etiqueta="Orden de compra" valor={c.orden_compra_cliente ?? "—"} />
                </>
              )}
              <Dato etiqueta="Vendedor" valor={c.vendedor ?? "—"} />
            </dl>

            {/* La retención y las cuotas: estaban solo en el papel. */}
            {!esNota && c.retencion_aplica ? (
              <div className="mt-3 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-sm">
                <p className="font-medium">
                  Retención del IGV · <Moneda moneda={c.moneda} valor={c.retencion_monto} tamano="sm" />
                </p>
                <p className="mt-0.5 text-[var(--fg-muted)]">
                  Te pagan <Moneda moneda={c.moneda} valor={Math.round((c.total - c.retencion_monto) * 100) / 100} tamano="sm" enfasis="suave" />.
                  Lo retenido se registra en Cobranzas con «Retención».
                </p>
              </div>
            ) : null}
            {/* «Registrar CR» (Willy, 14/10): el comprobante de retención. */}
            {!esNota && c.retencion_aplica && !anulado ? (
              <div className="mt-3">
                <RegistrarCr comprobanteId={c.id} numero={c.numero} cr={cr} puede={puedeCr} />
              </div>
            ) : null}
            {!esNota && c.cuotas.length > 1 ? (
              <div className="mt-3 text-sm">
                <p className="mb-1 font-medium">Cuotas</p>
                <ul className="flex flex-col gap-0.5">
                  {cuotasNetas(c.cuotas, c.retencion_aplica ? c.retencion_monto : 0).map((q) => (
                    <li key={q.numero} className="flex justify-between gap-2">
                      <span>
                        Cuota {q.numero} · vence {formatearFecha(q.fecha_vencimiento)}
                      </span>
                      <Moneda moneda={c.moneda} valor={q.monto} tamano="sm" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Las notas que la corrigen, con su enlace. */}
            {notas.length > 0 ? (
              <div className="mt-3 border-t border-[var(--border-soft)] pt-3 text-sm">
                <p className="mb-1 font-medium">{notas.length === 1 ? "Nota que la corrige" : "Notas que la corrigen"}</p>
                <ul className="flex flex-col gap-1">
                  {notas.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/facturacion/${n.id}`} className="font-mono font-medium text-brand-700 underline dark:text-brand-300">
                        {n.numero}
                      </Link>
                      <span className="text-[var(--fg-muted)]">
                        {formatearFecha(n.fecha_emision)} ·{" "}
                        <Moneda moneda={n.moneda} valor={n.moneda === "PEN" && n.pen_total != null ? n.pen_total : n.total} tamano="sm" />
                        {n.estado === "anulado" ? " · anulada" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {c.detraccion_aplica ? (
              <div className="mt-3 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-sm">
                <p className="font-medium">
                  Detracción {c.detraccion_porcentaje}% ·{" "}
                  <Moneda moneda={c.moneda} valor={c.detraccion_monto} tamano="sm" />
                </p>
                <p className="mt-0.5 text-[var(--fg-muted)]">
                  El cliente paga{" "}
                  <Moneda moneda={c.moneda} valor={c.total - c.detraccion_monto} tamano="sm" enfasis="suave" /> y
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

          {/*
            Sus cobros (TR-06): cuándo, cuánto, por qué medio, quién lo
            registró y con qué voucher. Decía «Pagado X» y nada más; el resto
            solo se veía desde Cobranzas. Una nota no se cobra: no lleva esto.
          */}
          {!esNota ? (
            <section className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">Cobros</h2>
              {!pagos.ok ? (
                <p role="alert" className="text-sm text-[var(--danger)]">
                  No se pudieron leer los cobros: {pagos.error}
                </p>
              ) : pagos.datos.length === 0 ? (
                <p className="text-sm text-[var(--fg-muted)]">Todavía no se ha cobrado nada.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-[var(--border-soft)] text-sm">
                  {pagos.datos.map((p) => (
                    <li key={p.id} className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
                      <p>
                        <span className="tabular">{formatearFecha(p.fecha)}</span>
                        {" · "}
                        <Moneda
                          moneda={c.moneda}
                          valor={Math.round(p.monto * factorPagos * 100) / 100}
                          tamano="sm"
                          enfasis="fuerte"
                        />
                        {" · "}
                        {ETIQUETA_MEDIO[p.medio] ?? p.medio}
                        {p.referencia ? ` · Op. ${p.referencia}` : ""}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[var(--fg-muted)]">
                          {p.registrado_por ? `Lo registró ${p.registrado_por}` : "Sin persona apuntada"}
                        </span>
                        <VoucherDelPago pagoId={p.id} tiene={p.tiene_voucher} puedeSubir={puedeSubirVoucher} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      </div>

      {/* Quién la emitió, la cambió o la anuló (TR-03). */}
      <HistorialDocumento entidad="comprobantes" id={c.id} />
    </div>
    <div className="hidden print:block">
      <DocumentoComprobante c={c} emisor={emisor} cuentas={cuentas} qr={qr} />
    </div>
    </>
  );
}

/** El enlace a otro documento de la cadena: el mismo que el del pedido. */
const ENLACE_DOC = "font-mono font-semibold text-brand-600 underline underline-offset-4";

/** «Anulada el 07/10/2026 por Willy Fernández.», o sin persona si no la hay. */
function fraseAnulacion(en: string | null, por: string | null): string {
  const cuando = en ? ` el ${formatearFecha(en)}` : "";
  const quien = por ? ` por ${por}` : "";
  return `Anulada${cuando}${quien}.`;
}

/**
 * «Ficha del cliente», junto a su nombre (FS-08). Para corregir su dirección
 * fiscal o su teléfono no había camino desde ninguna ficha de documento.
 */
function BotonFichaCliente({ id }: { id: string | null }) {
  if (!id) return null;
  return (
    <Link href={`/clientes/${id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "px-3")}>
      <Building2 className="size-4" aria-hidden="true" />
      Ficha del cliente
    </Link>
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

function IconoImprimir() {
  return <Printer aria-hidden="true" className="size-[18px] shrink-0" />;
}
