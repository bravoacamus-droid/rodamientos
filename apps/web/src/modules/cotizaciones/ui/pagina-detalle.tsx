import { cuentasParaCobrar } from "@/lib/emisor";
import { notFound } from "next/navigation";
import { EstadoBadge } from "@rodatech/ui";

import { comprobantesDelPedido, cotizacionPorId, tieneGuia } from "../api/consultas";
import { armarCotizacionImpresa, formaDePago } from "../dominio/impresion";
import { ETIQUETA_ESTADO } from "../dominio/tipos";
import { AccionesCotizacion } from "./detalle/acciones";
import { Documento } from "./detalle/documento";
import { LoQueFalta } from "./detalle/lo-que-falta";
import { YaFacturado } from "./detalle/ya-facturado";

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

  const datosMensaje = {
    numero: impresa.numero,
    cliente: impresa.cliente.razonSocial,
    total: impresa.total,
    validaHasta: impresa.validaHasta,
    emisor: emisor.nombre_comercial,
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

  return (
    /*
      La pantalla es andamio alrededor de un papel.

      Todo lo de fuera —cabecera, acciones, margen— lleva `print:hidden`, así
      que al imprimir queda solo la hoja. Por eso el documento se pinta como
      una hoja de verdad, con sombra y sobre el fondo de la aplicación: lo que
      se ve en pantalla es exactamente lo que va a salir, sin una «vista
      previa» aparte que se pueda desincronizar del documento real.
    */
    <div className="flex flex-col gap-4 print:gap-0">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-semibold tracking-tight sm:text-xl">
              {cabecera.numero}
            </h1>
            <EstadoBadge
              estado={cabecera.estado}
              etiqueta={ETIQUETA_ESTADO[cabecera.estado]}
            />
          </div>
          <p className="mt-0.5 truncate text-sm text-[var(--fg-muted)]">
            {cabecera.cliente.razon_social}
          </p>
        </div>

        <AccionesCotizacion
          id={cabecera.id}
          estado={cabecera.estado}
          // Los datos crudos, no los enlaces montados: el diálogo de enviar
          // arma el suyo con el número que se teclee ahí mismo, sin tener que
          // guardar el contacto y recargar antes de poder mandar nada.
          datosMensaje={datosMensaje}
          cliente={{
            id: cabecera.cliente_id,
            nombre: impresa.cliente.razonSocial,
            telefono: cabecera.cliente.telefono ?? "",
            whatsapp: cabecera.cliente.whatsapp ?? "",
            email: cabecera.cliente.email ?? "",
          }}
          // Sobre lo CONFIRMADO, no sobre lo cotizado: lo que el cliente no
          // aceptó no se factura nunca, así que no puede mantener vivo un
          // botón de facturar que ya no lleva a ninguna parte.
          facturable={lineas.some(
            (l) => (l.cantidad_aprobada ?? 0) - l.cantidad_atendida > 0,
          )}
          /*
            Hasta dónde se puede seguir cambiando el documento (070).

            Los dos hechos que lo cierran son que la mercadería haya salido o
            que se haya facturado algo — no el estado. Es la misma regla de la
            guía, del pedido y de la recepción: hasta donde todavía no es un
            compromiso de nadie.

            Se calcula aquí para no ofrecer un botón que la base va a
            rechazar; la comprobación que manda sigue estando en la función,
            porque toda Server Action es un endpoint público.
          */
          editable={!despachada && lineas.every((l) => l.cantidad_atendida <= 0)}
          // Las líneas viajan para poder preguntar QUÉ confirmó el
          // cliente. Se mandan crudas, sin el `id` de la cotización
          // repetido dentro: el diálogo solo necesita qué, cuánto y a
          // cuánto, para poder decir el total de lo que se está
          // confirmando mientras se ajusta.
          lineas={lineas.map((l) => ({
            id: l.id,
            codigo: l.codigo,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            // Lo ya confirmado, para que al CORREGIR el diálogo arranque de
            // ahí y no de lo cotizado.
            cantidadConfirmada: l.cantidad_aprobada ?? null,
            unidad: l.unidad_codigo,
            valorUnitario: l.valor_unitario,
            descuentoPct: l.descuento_pct,
          }))}
        />
      </header>

      {/*
        Qué falta comprar de este pedido.

        Solo cuando ya es un pedido: en un borrador todavía no se sabe qué va
        a confirmar el cliente, y avisar de que falta stock de algo que quizá
        no compre es ruido. Va ARRIBA del documento porque, recién confirmado,
        conseguir la mercadería es lo siguiente que hay que hacer.
      */}
      {cabecera.estado === "aprobada" ? (
        <LoQueFalta cotizacionId={cabecera.id} />
      ) : null}

      {/*
        Y lo que ya salió facturado, debajo de lo que falta comprar.

        El enlace pedido↔comprobante solo iba en un sentido: la factura sabía
        de qué pedido nacía y el pedido no sabía nada de sus facturas. Con el
        facturado por partes eso deja la ficha contando media historia.
      */}
      <YaFacturado comprobantes={facturas} />

      {/*
        El margen es información INTERNA.

        Borde discontinuo a propósito: es la señal de que ese bloque no forma
        parte del documento. Quien mira la pantalla al lado de un cliente tiene
        que ver de un golpe qué se imprime y qué no.
      */}
      {cabecera.costo_total > 0 ? (
        <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm print:hidden">
          <Interno etiqueta="Costo" valor={`$ ${cabecera.costo_total.toFixed(2)}`} />
          <Interno
            etiqueta="Margen"
            valor={`${cabecera.margen_pct.toFixed(1)}%`}
            tono={
              cabecera.margen_pct < 10
                ? "malo"
                : cabecera.margen_pct < 15
                  ? "aviso"
                  : "ok"
            }
          />
          <Interno
            etiqueta="Utilidad"
            valor={`$ ${(cabecera.subtotal - cabecera.costo_total).toFixed(2)}`}
          />
          <span className="text-xs text-[var(--fg-subtle)] sm:ml-auto">
            Nada de esta franja se imprime.
          </span>
        </section>
      ) : null}

      {/* La hoja. La sombra solo existe en pantalla. */}
      <div className="overflow-hidden rounded-md bg-white elev-2 print:rounded-none print:shadow-none">
        <Documento c={impresa} cuentas={cuentas} />
      </div>
    </div>
  );
}

function Interno({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: string;
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
    <span className="flex flex-col">
      <span className="text-xs text-[var(--fg-muted)]">{etiqueta}</span>
      <span className={`tabular font-semibold ${color}`}>{valor}</span>
    </span>
  );
}
