import { cuentasParaCobrar } from "@/lib/emisor";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EstadoBadge } from "@rodatech/ui";

import {
  comprobantesDelPedido,
  cotizacionPorId,
  despachoDelPedido,
  ordenesDelPedido,
  tieneGuia,
} from "../api/consultas";
import { despachadoPorLinea, loQueFaltaDelPedido } from "../api/falta";
import { armarCotizacionImpresa, formaDePago } from "../dominio/impresion";
import { ETIQUETA_ESTADO } from "../dominio/tipos";
import { AccionesCotizacion } from "./detalle/acciones";
import { Documento } from "./detalle/documento";
import { LoQueFalta } from "./detalle/lo-que-falta";
import { OrdenesDeCompra } from "./detalle/ordenes-compra";
import { OrdenCliente } from "./detalle/orden-cliente";
import { demandaDeProductos } from "../api/demanda";
import { proveedoresGuardados } from "../dominio/compra-linea";
import { perfilActual } from "@rodatech/db/servidor";
import { YaFacturado } from "./detalle/ya-facturado";
import { VistaPreviaDocumento } from "./detalle/vista-previa";
import { unidadLegible } from "../dominio/unidades";
import { Volver } from "@/componentes/volver";

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
  const [facturas, cuentas, despachada, despacho] = await Promise.all([
    comprobantesDelPedido(cabecera.id),
    cuentasParaCobrar(),
    // Para saber si el botón de editar todavía tiene sentido (070).
    tieneGuia(cabecera.id),
    // Y para no ofrecer una guía cuando ya salió todo (17/09).
    despachoDelPedido(cabecera.id),
  ]);

  /*
    El papel de un pedido confirmado lleva lo que el cliente se LLEVA (13/10).
    Luis: *«para imprimir su cotización sigue saliendo los 4»* — había
    confirmado 3. Las líneas en cero no salen y las demás van con su cantidad
    confirmada; los totales del papel salen de sus líneas, así que cuadran
    solos. Mientras no esté aprobada, el papel es la cotización tal cual.
  */
  const papelConfirmado = cabecera.estado === "aprobada" || cabecera.estado === "atendida";
  const cantidadEnPapel = (l: (typeof lineas)[number]) =>
    papelConfirmado ? Number(l.cantidad_aprobada ?? l.cantidad) : Number(l.cantidad);

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
    lineas: lineas.filter((l) => cantidadEnPapel(l) > 0).map((l) => ({
      codigo: l.codigo,
      marca: l.marca,
      descripcion: l.descripcion,
      nota: l.nota,
      cantidad: cantidadEnPapel(l),
      unidad: l.unidad_codigo,
      valorUnitario: l.valor_unitario,
      descuentoPct: l.descuento_pct,
      // Lo que lleva el kit, para imprimirlo debajo de la descripción. Sin
      // precios: Willy, 16/09, *«no precios detallados por cada parte»*.
      contiene: (l.productos?.kit_componentes ?? [])
        .slice()
        .sort((a, b) => a.orden - b.orden)
        .map((c) => ({
          cantidad: c.cantidad,
          codigo: c.productos?.codigo ?? "",
          descripcion: c.productos?.descripcion ?? "",
        })),
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
  const [falta, despachado] =
    cabecera.estado === "aprobada"
      ? await Promise.all([
          loQueFaltaDelPedido(cabecera.id),
          despachadoPorLinea(cabecera.id),
        ])
      : [[], new Map<string, number>()];

  // Las órdenes de compra (111): solo de un pedido confirmado.
  const confirmado = cabecera.estado === "aprobada" || cabecera.estado === "atendida";
  const idsConProducto = lineas.map((l) => l.producto_id).filter((x): x is string => !!x);
  const [ordenes, perfil, demanda] = confirmado
    ? await Promise.all([ordenesDelPedido(cabecera.id), perfilActual(), demandaDeProductos(idsConProducto)])
    : [[], null, new Map()];
  const lineasConfirmadas = lineas
    .filter((l) => l.producto_id !== null)
    .map((l) => ({
      productoId: l.producto_id as string,
      codigo: l.codigo,
      cantidad: Number(l.cantidad),
      confirmada: Number(l.cantidad_aprobada ?? 0),
      unidad: l.unidad_codigo,
      proveedores: proveedoresGuardados(l.cotizacion_item_proveedores),
    }));

  /*
    Lo que el cliente se LLEVA (13/10). Luis aprobó marcando un producto como
    «No lo quiso» y la ficha lo seguía enseñando con su cantidad, en almacén y
    sumado al total: *«no es dinámico, no podemos equivocarnos así»*. La base
    lo tenía bien (`cantidad_aprobada` = 0); la pantalla leía `cantidad`.
  */
  const lleva = (l: (typeof lineas)[number]) =>
    confirmado ? Number(l.cantidad_aprobada ?? l.cantidad) : Number(l.cantidad);
  const importeDe = (l: (typeof lineas)[number], cantidad: number) =>
    Math.round(cantidad * l.valor_unitario * (1 - l.descuento_pct / 100) * 100) / 100;
  const cambioAlConfirmar = confirmado && lineas.some((l) => lleva(l) !== Number(l.cantidad));
  const subtotalConfirmado = Math.round(lineas.reduce((t, l) => t + importeDe(l, lleva(l)), 0) * 100) / 100;
  const igvConfirmado = Math.round(subtotalConfirmado * 0.18 * 100) / 100;
  // El margen, también sobre lo que se lleva.
  const ventaMargen = cambioAlConfirmar ? subtotalConfirmado : cabecera.subtotal;
  const costoMargen = cambioAlConfirmar
    ? Math.round(lineas.reduce((t, l) => t + Number(l.costo_unitario) * lleva(l), 0) * 100) / 100
    : cabecera.costo_total;
  const margenPct = cambioAlConfirmar
    ? costoMargen > 0
      ? ((ventaMargen - costoMargen) / costoMargen) * 100
      : 0
    : cabecera.margen_pct;

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
        <Volver href="/cotizaciones">Volver a cotizaciones</Volver>

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
            despachable={despacho.pendiente}
            guias={despacho.guias}
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
            // Sin «O/C» ni una raya sola: dicho con palabras (revisión por
            // módulos del 02/10).
            etiqueta="Orden de compra del cliente"
            valor={cabecera.orden_compra_cliente ?? "Sin orden"}
            detalle={
              cabecera.orden_compra_cliente
                ? "la que mandó el cliente"
                : "todavía no la han mandado"
            }
            accion={
              cabecera.estado === "anulada" ? null : (
                <OrdenCliente cotizacionId={cabecera.id} actual={cabecera.orden_compra_cliente} />
              )
            }
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
              // Dos decimales, como lo guarda la base y como lo calcula Willy
              // a mano (07/10: «debería salir 78.85»). Con uno salía «78.8»,
              // que además parece mal redondeado: 78,85 en coma flotante es
              // 78,8499… y `toFixed(1)` lo baja.
              costoMargen > 0 ? `${margenPct.toFixed(2)}%` : "—"
            }
            detalle={
              costoMargen > 0
                ? ventaMargen >= costoMargen
                  ? `${dolar(ventaMargen - costoMargen)} de utilidad${cambioAlConfirmar ? " en lo confirmado" : ""}`
                  : // «-USD 0.47 de utilidad» se lee al revés (02/10).
                    `pierde ${dolar(costoMargen - ventaMargen)}`
                : "sin costo cargado"
            }
            tono={
              costoMargen <= 0
                ? undefined
                : margenPct < 12
                  ? "malo"
                  : margenPct < 20
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
        <LoQueFalta
          falta={falta}
          analizados={lineasConfirmadas
            .filter((l) => l.proveedores.some((p) => p.cantidad > 0 && p.precio !== null))
            .map((l) => l.productoId)}
          puedeGenerar={!!perfil?.activo && ["gerencia", "admin", "compras"].includes(perfil.rol)}
        />

        {confirmado ? (
          <OrdenesDeCompra
            cotizacionId={cabecera.id}
            lineas={lineasConfirmadas}
            existentes={ordenes}
            puedeGenerar={!!perfil?.activo && ["gerencia", "admin", "compras"].includes(perfil.rol)}
            demanda={[...demanda.values()]}
          />
        ) : null}

        {/*
          Y lo que ya salió facturado.

          El enlace pedido↔comprobante solo iba en un sentido: la factura sabía
          de qué pedido nacía y el pedido no sabía nada de sus facturas.
        */}
        <YaFacturado comprobantes={facturas} />

        {/* --------------------------------------------------- Productos */}
        {/* `@container`: tabla o tarjetas según el ancho de la tarjeta y no
            de la pantalla. Con `md`, a 820 con el menú abierto salía la
            tabla en 500 px y el importe quedaba fuera (revisión por módulos
            del 02/10). */}
        <section className="card @container overflow-hidden">
          <header className="border-b border-[var(--border-soft)] px-4 py-3">
            <h2 className="text-base font-semibold">Productos</h2>
            <p className="text-sm text-[var(--fg-muted)]">
              {lineas.length === 1 ? "1 ítem" : `${lineas.length} ítems`} en la
              cotización.
            </p>
          </header>

          {/*
            La tabla, solo de `md` para arriba.

            Luis, 11/09, mirando el responsive: *«mejorar de ver cómo arreglar
            las tablas de información de los productos, ponerlos como card
            podría ser, para verlo bien»*. Y tenía razón: seis columnas en 414
            px salían con scroll horizontal dentro de la ficha, así que para
            leer el importe había que arrastrar la tabla y perder de vista el
            código.

            Esto NO es el documento que se imprime —ese es el `<Documento>` de
            abajo, intacto, y sigue siendo una tabla porque es el papel—. Aquí
            se puede partir en tarjetas sin romper nada. Era la decisión que
            quedó abierta en §AH.9 del diario.
          */}
          <div className="scroll-x hidden @2xl:block">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
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
                  <th className="px-3 py-2.5 text-right font-medium">Valor unitario</th>
                  <th className="px-4 py-2.5 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr
                    key={l.id}
                    className={`border-b border-[var(--border-soft)] ${lleva(l) === 0 ? "bg-[var(--danger-bg)]" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="block font-medium">{l.codigo}</span>
                      {l.marca ? (
                        <span className="block text-sm text-[var(--fg-subtle)]">
                          {l.marca}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.descripcion}
                      {l.nota ? <span className="mt-0.5 block text-sm italic text-[var(--fg-muted)]">Nota: {l.nota}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular">
                      <CantidadConfirmada
                        cotizada={Number(l.cantidad)}
                        lleva={lleva(l)}
                        unidad={unidadLegible(l.unidad_codigo)}
                      />
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
                        {lleva(l) === 0 ? (
                          <span className="text-sm font-semibold text-[var(--danger)]">No lo lleva</span>
                        ) : (
                          <EstadoDeLinea
                            falta={faltaPorProducto.get(l.producto_id ?? "")}
                            despachado={despachado.get(l.id) ?? 0}
                          />
                        )}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular">
                      {dolar(l.valor_unitario)}
                      {/* Sin esto, cantidad × valor no daba el importe de al
                          lado y no se veía por qué (revisión por módulos del
                          02/10). */}
                      {l.descuento_pct > 0 ? (
                        <span className="block text-sm text-[var(--fg-muted)]">
                          − {l.descuento_pct}% de descuento
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular font-medium">
                      {lleva(l) === 0 ? (
                        <span className="text-[var(--fg-subtle)] line-through">
                          {dolar(importeDe(l, Number(l.cantidad)))}
                        </span>
                      ) : (
                        dolar(importeDe(l, lleva(l)))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --------------------------------------------------------- Móvil */}
          <ul className="flex flex-col divide-y divide-[var(--border-soft)] @2xl:hidden">
            {lineas.map((l) => (
              <li
                key={l.id}
                className={`flex flex-col gap-2 px-4 py-3 ${lleva(l) === 0 ? "bg-[var(--danger-bg)]" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{l.codigo}</span>
                  <span
                    className={`shrink-0 tabular text-sm font-medium ${lleva(l) === 0 ? "text-[var(--fg-subtle)] line-through" : ""}`}
                  >
                    {dolar(importeDe(l, lleva(l) === 0 ? Number(l.cantidad) : lleva(l)))}
                  </span>
                </div>

                <p className="text-sm">
                  {l.marca ? (
                    <span className="text-[var(--fg-subtle)]">{l.marca} · </span>
                  ) : null}
                  {l.descripcion}
                </p>
                {l.nota ? <p className="text-sm italic text-[var(--fg-muted)]">Nota: {l.nota}</p> : null}

                {/* La cuenta, dicha entera: «4 NIU × $ 25.40». En la tabla son
                    dos columnas separadas y aquí no hay cabecera que las
                    explique, así que se escribe la multiplicación. */}
                <p className="text-sm text-[var(--fg-muted)]">
                  <CantidadConfirmada
                    cotizada={Number(l.cantidad)}
                    lleva={lleva(l)}
                    unidad={unidadLegible(l.unidad_codigo)}
                  />{" "}
                  ×{" "}
                  <span className="tabular">{dolar(l.valor_unitario)}</span>
                  {/* Con el descuento, o la cuenta no da el importe de arriba. */}
                  {l.descuento_pct > 0 ? (
                    <span className="tabular"> − {l.descuento_pct}%</span>
                  ) : null}
                </p>

                {cabecera.estado === "aprobada" ? (
                  lleva(l) === 0 ? (
                    <span className="text-sm font-semibold text-[var(--danger)]">No lo lleva</span>
                  ) : (
                    <EstadoDeLinea
                      falta={faltaPorProducto.get(l.producto_id ?? "")}
                      despachado={despachado.get(l.id) ?? 0}
                    />
                  )
                ) : null}
              </li>
            ))}
          </ul>

          {/* Los totales al pie y a la derecha, como en el papel: es donde el
              ojo los busca después de leer la última línea. */}
          <div className="flex justify-end px-4 py-3">
            {cambioAlConfirmar ? (
              /* Lo que se lleva, que es lo que se va a facturar. Lo cotizado
                 queda debajo, en pequeño: es lo que se le mandó. */
              <dl className="w-full max-w-xs text-sm">
                <div className="flex items-baseline justify-between py-1">
                  <dt className="text-[var(--fg-muted)]">Subtotal confirmado (sin IGV)</dt>
                  <dd className="tabular">{dolar(subtotalConfirmado)}</dd>
                </div>
                <div className="flex items-baseline justify-between py-1">
                  <dt className="text-[var(--fg-muted)]">IGV (18%)</dt>
                  <dd className="tabular">{dolar(igvConfirmado)}</dd>
                </div>
                <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-2">
                  <dt className="font-semibold">Total confirmado</dt>
                  <dd className="tabular text-lg font-semibold">{dolar(subtotalConfirmado + igvConfirmado)}</dd>
                </div>
                <div className="flex items-baseline justify-between pt-1 text-[var(--fg-muted)]">
                  <dt>Se había cotizado</dt>
                  <dd className="tabular">{dolar(cabecera.total)}</dd>
                </div>
              </dl>
            ) : (
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
            )}
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
function EstadoDeLinea({
  falta,
  despachado,
}: {
  falta?: { falta: number; enCamino: boolean };
  /** Cuánto de esta línea ya salió con una guía emitida. */
  despachado: number;
}) {
  /*
    Lo despachado se dice antes que nada.

    Un primer intento ponía «En almacén» a toda línea que no faltara, y era
    engañoso justo en el pedido más avanzado: la mercadería de COT1-000006
    había salido con la guía T001-00000001 y la ficha decía que estaba en el
    estante. Mandar a alguien a buscar algo que se entregó la semana pasada es
    peor que no decir nada.
  */
  if (despachado > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-[var(--fg-muted)]">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        Despachado
      </span>
    );
  }

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
  accion,
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: "ok" | "aviso" | "malo";
  /** Un botón debajo, para cambiar el dato sin salir de la ficha. */
  accion?: React.ReactNode;
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
      {accion}
    </div>
  );
}

/** Fecha corta en formato peruano, sin depender de la zona del servidor. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/**
 * La cantidad de una línea de pedido: lo que se lleva y, si no es todo, lo
 * cotizado al lado. «No lo quiso» en rojo cuando es cero.
 */
function CantidadConfirmada({ cotizada, lleva, unidad }: { cotizada: number; lleva: number; unidad: string }) {
  if (lleva === cotizada) {
    return (
      <>
        <span className="tabular">{cotizada}</span> <span className="text-[var(--fg-subtle)]">{unidad}</span>
      </>
    );
  }
  if (lleva === 0) {
    return (
      <span className="inline-flex flex-col items-end">
        <span className="text-[var(--fg-subtle)] line-through">
          {cotizada} {unidad}
        </span>
        <span className="text-sm font-semibold text-[var(--danger)]">No lo quiso</span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
      <span className="font-semibold tabular">
        {lleva} <span className="font-normal text-[var(--fg-subtle)]">{unidad}</span>
      </span>
      <span className="text-sm text-[var(--warn)]">de {cotizada} cotizadas</span>
    </span>
  );
}
