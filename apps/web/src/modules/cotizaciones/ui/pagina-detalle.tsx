import { cuentasParaCobrar } from "@/lib/emisor";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EstadoBadge } from "@rodatech/ui";

import { comprobantesDelPedido, cotizacionPorId, tieneGuia } from "../api/consultas";
import { loQueFaltaDelPedido } from "../api/falta";
import { armarCotizacionImpresa, formaDePago } from "../dominio/impresion";
import { ETIQUETA_ESTADO } from "../dominio/tipos";
import { AccionesCotizacion } from "./detalle/acciones";
import { Documento } from "./detalle/documento";
import { LoQueFalta } from "./detalle/lo-que-falta";
import { YaFacturado } from "./detalle/ya-facturado";
import { VistaPreviaDocumento } from "./detalle/vista-previa";

/**
 * Ficha de una cotización.
 *
 * Es a la vez la pantalla de trabajo y el papel: lo que se ve arriba es lo que
 * sale impreso, sin una «vista previa» aparte que se pueda desincronizar del
 * documento real. Al imprimir, las acciones y el panel interno desaparecen
 * (`print:hidden`) y queda solo la hoja.
 */
export default async function PaginaDetalleCotizacion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resultado = await cotizacionPorId(id);

  if (!resultado.ok) {
    if (resultado.error.includes("no existe")) notFound();
    return (
      <div className="p-6">
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-4 text-sm">
          {resultado.error}
        </p>
      </div>
    );
  }

  const { cabecera, lineas, emisor } = resultado.datos;

  // Lo que ya salió facturado de este pedido. Después de `cotizacionPorId` y
  // no en paralelo porque solo hace falta si el documento existe: pedirlo
  // antes sería una consulta de más en cada 404.
  // Las dos juntas: ninguna depende de la otra, y la cotización se imprime
  // con las cuentas al pie (064).
  const [facturas, cuentas, despachada] = await Promise.all([
    comprobantesDelPedido(cabecera.id),
    cuentasParaCobrar(),
    // Para saber si el botón de editar todavía tiene sentido (070).
    tieneGuia(cabecera.id),
  ]);

  const impresa = armarCotizacionImpresa({
    emisor: {
      razonSocial: emisor.razon_social,
      nombreComercial: emisor.nombre_comercial,
      ruc: emisor.ruc,
      direccion: emisor.direccion,
      telefono: emisor.telefono,
      email: emisor.email_ventas ?? emisor.email,
      web: emisor.web,
      logoUrl: emisor.logo_url,
    },
    numero: cabecera.numero,
    fecha: cabecera.fecha,
    validezDias: cabecera.validez_dias,
    cliente: {
      razonSocial: cabecera.cliente.razon_social,
      documento: cabecera.cliente.numero_documento,
      tipoDocumento: cabecera.cliente.tipo_documento,
      direccion: cabecera.cliente.direccion,
      contacto: cabecera.contacto ?? cabecera.cliente.contacto,
    },
    vendedor: cabecera.vendedor,
    tiempoEntrega: cabecera.tiempo_entrega,
    // El dato viajaba en la cabecera desde siempre y no llegaba al papel.
    formaPago: formaDePago(cabecera.cliente.condicion_pago, cabecera.cliente.dias_credito),
    condiciones: cabecera.condiciones,
    observaciones: cabecera.observaciones,
    ordenCompraCliente: cabecera.orden_compra_cliente,
    mostrarDescuento: cabecera.mostrar_descuento,
    mostrarDisponibilidad: cabecera.mostrar_disponibilidad,
    lineas: lineas.map((l) => ({
      codigo: l.codigo,
      marca: l.marca,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad_codigo,
      valorUnitario: l.valor_unitario,
      descuentoPct: l.descuento_pct,
      disponibilidad: l.disponibilidad,
      diasEntrega: l.dias_entrega,
    })),
  });

  /*
    El enlace que se le manda al cliente (072).

    La base se saca de la CABECERA de la petición y no de una variable de
    entorno: así sale bien en local, en una vista previa de Vercel y en el
    dominio de producción sin que nadie tenga que acordarse de configurar
    nada. Una variable mal puesta aquí no rompe la pantalla —se ve igual— pero
    manda al cliente un enlace muerto, y eso no se descubre hasta que llama.

    `x-forwarded-proto` porque detrás de un proxy la petición interna llega en
    http aunque el cliente esté en https; sin eso el enlace saldría en http y
    el navegador se quejaría.
  */
  const cabeceras = await headers();
  const host = cabeceras.get("host");
  const protocolo = cabeceras.get("x-forwarded-proto") ?? "http";
  const enlace = host
    ? `${protocolo}://${host}/ver/${cabecera.token_publico}`
    : null;

  const datosMensaje = {
    numero: impresa.numero,
    cliente: impresa.cliente.razonSocial,
    total: impresa.total,
    validaHasta: impresa.validaHasta,
    emisor: emisor.nombre_comercial,
    enlace,
  };

  /*
    Los enlaces de WhatsApp y correo YA NO se arman aquí.

    Se montaban en el servidor con el contacto guardado, y eso obligaba a
    apuntar el teléfono, guardar y recargar antes de poder mandar nada. Con 97
    clientes sin un solo teléfono, ese era el camino normal y no la excepción.

    Ahora los arma el diálogo de enviar con lo que se teclea en él —las dos
    funciones son del dominio, sin red ni reloj, así que dan lo mismo en un
    lado que en otro— y de paso lo guarda en la ficha para la próxima. Willy
    13:21: *«correo y WhatsApp»*, y es el mismo texto por los dos sitios.
  */

  const dolar = (n: number) =>
    n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

  /*
    Qué le falta a este pedido, una sola vez y para dos sitios.

    Luis, 09/09: *«cuando se apruebe, lo que falta debería salir en listos para
    entregar… pero las cosas que hay que comprar, mira cómo podemos hacer el
    diseño»*.

    La respuesta no es una pantalla más: el «Ver» de «Listos para entregar» ya
    trae aquí. Lo que faltaba era que **la propia tabla de productos dijera qué
    hay y qué falta**, línea a línea. Hasta hoy el aviso de arriba decía «faltan
    3 productos» y luego la tabla los listaba los seis iguales, sin distinguir
    cuáles se pueden despachar hoy.

    Se calcula aquí y se reparte a los dos —el aviso y la tabla— porque
    `bandejaPorComprar()` lee TODAS las líneas confirmadas del sistema y
    reparte el stock entre ellas. Es de las consultas más caras del ERP;
    pagarla dos veces por pintar la misma pantalla sería absurdo.

    Solo en pedidos aprobados: en un borrador todavía no se sabe qué va a
    confirmar el cliente, y avisar de que falta stock de algo que quizá no
    compre es ruido.
  */
  const falta =
    cabecera.estado === "aprobada" ? await loQueFaltaDelPedido(cabecera.id) : [];

  /** Por producto, para poder marcar cada fila de la tabla. */
  const faltaPorProducto = new Map(falta.map((f) => [f.producto_id, f]));

  return (
    <>
      {/* ------------------------------------------------ Ficha de trabajo */}
      {/*
        Lo que se mira para TRABAJAR, y no se imprime.

        Hasta el 09/09 esta pantalla era la hoja A4 con unos botones encima.
        Tenía la ventaja de que lo que se ve es lo que sale, y el coste de que
        para leer la condición de pago o la validez había que buscarlas dentro
        de un documento maquetado para el cliente. Ahora los datos están en
        tarjetas y el papel se mira con «Vista previa» — que enseña el mismo
        componente, así que la ventaja no se pierde.
      */}
      <div className="flex flex-col gap-5 print:hidden">
        <Link
          href="/cotizaciones"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <span aria-hidden="true">←</span> Cotizaciones
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 font-mono text-sm font-medium">
                {cabecera.numero}
              </span>
              <EstadoBadge
                estado={cabecera.estado}
                etiqueta={ETIQUETA_ESTADO[cabecera.estado]}
              />
            </div>

            {/*
              El CLIENTE en grande, no el número del documento.

              Es lo que identifica la cotización para quien la abre: Willy no
              recuerda «la COT1-000006», recuerda «la de ACEROS CHILCA». El
              número queda arriba, en pastilla, para cuando hace falta
              exactamente ese dato.
            */}
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {cabecera.cliente.razon_social}
            </h1>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              {cabecera.cliente.numero_documento
                ? `${cabecera.cliente.tipo_documento} ${cabecera.cliente.numero_documento} · `
                : ""}
              {fechaCorta(cabecera.fecha)}
            </p>
          </div>

          <AccionesCotizacion
            id={cabecera.id}
            estado={cabecera.estado}
            datosMensaje={datosMensaje}
            cliente={{
              id: cabecera.cliente_id,
              nombre: impresa.cliente.razonSocial,
              telefono: cabecera.cliente.telefono ?? "",
              whatsapp: cabecera.cliente.whatsapp ?? "",
              email: cabecera.cliente.email ?? "",
            }}
            facturable={lineas.some(
              (l) => (l.cantidad_aprobada ?? 0) - l.cantidad_atendida > 0,
            )}
            editable={!despachada && lineas.every((l) => l.cantidad_atendida <= 0)}
            lineas={lineas.map((l) => ({
              id: l.id,
              codigo: l.codigo,
              descripcion: l.descripcion,
              cantidad: l.cantidad,
              cantidadConfirmada: l.cantidad_aprobada ?? null,
              unidad: l.unidad_codigo,
              valorUnitario: l.valor_unitario,
              descuentoPct: l.descuento_pct,
            }))}
            vistaPrevia={
              <VistaPreviaDocumento numero={cabecera.numero}>
                <Documento c={impresa} cuentas={cuentas} />
              </VistaPreviaDocumento>
            }
          />
        </header>

        {/* ---------------------------------------------------- Resumen */}
        {/*
          Las cuatro cosas que se preguntan de una cotización sin abrirla.

          Salían todas dentro del papel, en cuerpo pequeño. El margen además
          vivía en una franja aparte con borde discontinuo porque «no se
          imprime» — ahora nada de esta mitad se imprime, así que esa
          advertencia sobra y el dato puede estar donde toca.
        */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Resumen
            etiqueta="Condición de pago"
            valor={
              cabecera.cliente.condicion_pago === "credito" ? "A crédito" : "Al contado"
            }
            detalle={
              cabecera.cliente.condicion_pago === "credito"
                ? `${cabecera.cliente.dias_credito} días`
                : "sin plazo"
            }
          />
          <Resumen
            etiqueta="Orden de cliente"
            valor={cabecera.orden_compra_cliente ?? "—"}
            detalle="O/C"
          />
          <Resumen
            etiqueta="Validez"
            valor={`${cabecera.validez_dias} días`}
            detalle={`hasta el ${fechaCorta(impresa.validaHasta)}`}
          />
          {/*
            El margen, solo si hay costo con el que calcularlo.

            Sin costo cargado la cuenta da 100 % —la venta entera como
            ganancia— y eso ya rompió el tablero una vez. Aquí se pone una
            raya, que es la verdad: no se sabe.
          */}
          <Resumen
            etiqueta="Margen al costo"
            valor={
              cabecera.costo_total > 0 ? `${cabecera.margen_pct.toFixed(1)}%` : "—"
            }
            detalle={
              cabecera.costo_total > 0
                ? `${dolar(cabecera.subtotal - cabecera.costo_total)} de utilidad`
                : "sin costo cargado"
            }
            tono={
              cabecera.costo_total <= 0
                ? undefined
                : cabecera.margen_pct < 12
                  ? "malo"
                  : cabecera.margen_pct < 20
                    ? "aviso"
                    : "ok"
            }
          />
        </div>

        {/*
          Qué falta comprar de este pedido.

          Solo cuando ya es un pedido: en un borrador todavía no se sabe qué va
          a confirmar el cliente, y avisar de que falta stock de algo que quizá
          no compre es ruido. Va antes de los productos porque, recién
          confirmado, conseguir la mercadería es lo siguiente que hay que hacer.
        */}
        <LoQueFalta falta={falta} />

        {/*
          Y lo que ya salió facturado.

          El enlace pedido↔comprobante solo iba en un sentido: la factura sabía
          de qué pedido nacía y el pedido no sabía nada de sus facturas.
        */}
        <YaFacturado comprobantes={facturas} />

        {/* --------------------------------------------------- Productos */}
        <section className="card overflow-hidden">
          <header className="border-b border-[var(--border-soft)] px-4 py-3">
            <h2 className="text-base font-semibold">Productos</h2>
            <p className="text-sm text-[var(--fg-muted)]">
              {lineas.length === 1 ? "1 ítem" : `${lineas.length} ítems`} en la
              cotización.
            </p>
          </header>

          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Código</th>
                  <th className="px-3 py-2.5 font-medium">Descripción</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cantidad</th>
                  {/*
                    Solo en un pedido aprobado: en un borrador no hay nada
                    comprometido todavía, así que no hay nada que cubrir.
                  */}
                  {cabecera.estado === "aprobada" ? (
                    <th className="px-3 py-2.5 font-medium">Almacén</th>
                  ) : null}
                  <th className="px-3 py-2.5 text-right font-medium">P. unitario</th>
                  <th className="px-4 py-2.5 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--border-soft)]">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="block font-medium">{l.codigo}</span>
                      {l.marca ? (
                        <span className="block text-xs text-[var(--fg-subtle)]">
                          {l.marca}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">{l.descripcion}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular">
                      {l.cantidad}{" "}
                      <span className="text-[var(--fg-subtle)]">{l.unidad_codigo}</span>
                    </td>

                    {/*
                      Línea a línea: qué se puede sacar hoy y qué hay que
                      comprar.

                      El aviso de arriba dice «faltan 3 productos» y la tabla
                      los listaba los seis iguales, así que había que cruzar
                      los códigos a ojo para saber cuál era cuál. Esto es lo
                      que Luis pedía ver del pedido: *«lo que hay, lo que falta
                      comprar, todo eso»*.
                    */}
                    {cabecera.estado === "aprobada" ? (
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <EstadoDeLinea falta={faltaPorProducto.get(l.producto_id ?? "")} />
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular">
                      {dolar(l.valor_unitario)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular font-medium">
                      {dolar(
                        Math.round(l.cantidad * l.valor_unitario * (1 - l.descuento_pct / 100) * 100) / 100,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Los totales al pie y a la derecha, como en el papel: es donde el
              ojo los busca después de leer la última línea. */}
          <div className="flex justify-end px-4 py-3">
            <dl className="w-full max-w-xs text-sm">
              <div className="flex items-baseline justify-between py-1">
                <dt className="text-[var(--fg-muted)]">Subtotal (sin IGV)</dt>
                <dd className="tabular">{dolar(cabecera.subtotal)}</dd>
              </div>
              {cabecera.descuento_total > 0 ? (
                <div className="flex items-baseline justify-between py-1">
                  <dt className="text-[var(--fg-muted)]">Descuento</dt>
                  <dd className="tabular text-[var(--ok)]">
                    − {dolar(cabecera.descuento_total)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between py-1">
                <dt className="text-[var(--fg-muted)]">IGV (18%)</dt>
                <dd className="tabular">{dolar(cabecera.igv)}</dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-2">
                <dt className="font-semibold">Total</dt>
                <dd className="tabular text-lg font-semibold">{dolar(cabecera.total)}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------- El papel */}
      {/*
        Montado siempre, visible solo al imprimir.

        Es el mismo componente que enseña la vista previa, así que no hay una
        versión «de pantalla» y otra «de papel» que puedan separarse con el
        tiempo. Al pulsar Imprimir sale esto y nada más.
      */}
      <div className="hidden print:block">
        <Documento c={impresa} cuentas={cuentas} />
      </div>
    </>
  );
}

/**
 * En qué estado está una línea respecto al almacén.
 *
 * Tres respuestas y no dos, y la del medio es la que más importa: **«ya
 * pedido»** no es lo mismo que «falta comprar». Sin distinguirlas, quien mira
 * el pedido vuelve a pedir lo que ya viene en camino — que es comprar dos
 * veces, pagar dos fletes y quedarse con stock parado.
 *
 * Sale de la bandeja «Por comprar», que reparte el stock entre todos los
 * pedidos que esperan cada producto. No se resta aquí: dos pantallas con
 * cifras distintas sobre lo mismo es peor que una pantalla de menos.
 */
function EstadoDeLinea({ falta }: { falta?: { falta: number; enCamino: boolean } }) {
  if (!falta) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--ok)]">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        En almacén
      </span>
    );
  }

  if (falta.enCamino) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-[var(--fg-muted)]">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        Faltan {falta.falta} · ya pedido
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-[var(--warn)]">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      Faltan {falta.falta} · comprar
    </span>
  );
}

/** Una de las cuatro tarjetas de arriba. */
function Resumen({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: "ok" | "aviso" | "malo";
}) {
  const color =
    tono === "malo"
      ? "text-[var(--danger)]"
      : tono === "aviso"
        ? "text-[var(--warn)]"
        : tono === "ok"
          ? "text-[var(--ok)]"
          : "";

  return (
    <div className="card p-4">
      <p className="text-sm font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
        {etiqueta}
      </p>
      <p className={`mt-1 truncate text-xl font-semibold ${color}`} title={valor}>
        {valor}
      </p>
      <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{detalle}</p>
    </div>
  );
}

/** Fecha corta en formato peruano, sin depender de la zona del servidor. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}
