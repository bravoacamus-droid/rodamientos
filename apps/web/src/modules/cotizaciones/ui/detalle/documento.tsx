import { CuentasParaPagar, type CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import {
  HojaDocumento,
  type ColumnaHoja,
} from "@/componentes/hoja-documento";

import type { CotizacionImpresa } from "../../dominio/impresion";
import { formatoFecha } from "../../dominio/whatsapp";

/**
 * La cotización, en papel.
 *
 * El formato vive en `HojaDocumento`, compartido con la factura, la boleta y
 * la guía: Willy lo vio el 03/09 y pidió que fuera el de todos. Aquí queda
 * solo lo que es PROPIO de una cotización, que son tres cosas:
 *
 *   · las seis correcciones que pidió el 18/08 sobre las columnas (C1-C6);
 *   · la columna «Entrega», que solo sale si hay algo que no sea inmediato;
 *   · el pie, con las condiciones y la advertencia de la moneda.
 */

const dinero = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Documento({
  c,
  cuentas = [],
}: {
  c: CotizacionImpresa;
  /**
   * Las cuentas a las que se le paga (064).
   *
   * Willy, 07/09: *«abajo de la cotización debe aparecer el número de cuentas
   * siempre»*. En la cotización van SIEMPRE y sin interruptor —a diferencia
   * de la factura, donde se puede quitar—: la cotización es justo el papel
   * con el que el cliente decide, y es cuando pregunta a dónde paga.
   */
  cuentas?: readonly CuentaParaPagar[];
}) {
  // C4: este orden exacto. C1: NO hay columna de precio con IGV — es la que
  // le costó ventas, porque el cliente comparaba ese número contra el valor
  // de la competencia y lo veía caro. C5: el descuento solo si se activó.
  const columnas: ColumnaHoja[] = [
    { clave: "n", titulo: "#", alinear: "centro" },
    { clave: "codigo", titulo: "Código" },
    { clave: "marca", titulo: "Marca" },
    { clave: "descripcion", titulo: "Descripción" },
    { clave: "cantidad", titulo: "Cant.", alinear: "derecha" },
    { clave: "unidad", titulo: "U.M.", alinear: "centro" },
    // C7 (01/09): cierra el bloque de «qué y cuándo» antes de empezar el de
    // «cuánto».
    ...(c.mostrarDisponibilidad
      ? [{ clave: "entrega", titulo: "Entrega", sinCortar: true } as ColumnaHoja]
      : []),
    { clave: "valorUnitario", titulo: "Valor unit.", alinear: "derecha" },
    ...(c.mostrarDescuento
      ? [{ clave: "descuento", titulo: "Dscto.", alinear: "derecha" } as ColumnaHoja]
      : []),
    { clave: "importe", titulo: "Importe", alinear: "derecha" },
  ];

  return (
    <HojaDocumento
      emisor={c.emisor}
      titulo="Cotización"
      numero={c.numero}
      datos={[
        /*
          El orden del bloque, y por qué es este.

          Luis, 16/09, comparando con el formato de Willy: *«pone el nombre
          arriba, señor; la dirección, segundo»*, y después: *«la fecha de la
          derecha ponla en la siguiente línea, o sea pasando la dirección, así
          no se pierde»*.

          Las dos frases piden lo mismo: que las dos primeras filas sean SOLO
          «a quién le mando esto y a dónde», a lo ancho de la hoja. Con la
          fecha arriba a la derecha, la razón social y la dirección la empujan
          y queda flotando sola encima de un hueco.

          Debajo, dos columnas con un criterio: a la IZQUIERDA el cliente —su
          RUC, con quién se habla, cómo paga— y a la DERECHA las fechas y los
          plazos del documento. Es el reparto del formato de Willy, donde los
          datos del cliente bajan por la izquierda y lo comercial vive a la
          derecha.
        */
        { etiqueta: "Señores", valor: c.cliente.razonSocial, ancho: true },

        /*
          La dirección, también a lo ancho.

          Willy, 16/09: *«la fila de la "Dirección" debe estar libre, porque la
          razón social es siempre amplia»*. Partida en media hoja, una del
          Callao salía en cinco renglones.

          Si NO hay dirección se omite entera en vez de dejar un `null`: un
          hueco en una fila de ancho completo correría la columna de abajo y
          descuadraría el resto.
        */
        ...(c.cliente.direccion
          ? [{ etiqueta: "Dirección", valor: c.cliente.direccion, ancho: true }]
          : []),

        {
          etiqueta: c.cliente.tipoDocumento ?? "Doc.",
          valor: c.cliente.documento ?? "—",
        },
        { etiqueta: "Fecha", valor: formatoFecha(c.fecha) },

        { etiqueta: "Atención", valor: c.cliente.contacto ?? "—" },
        {
          etiqueta: "Válida hasta",
          valor: `${formatoFecha(c.validaHasta)} (${c.validezDias} días)`,
        },

        /*
          La forma de pago, frente a la entrega: las dos son la condición
          comercial y el cliente las compara juntas.

          El formato de Willy la imprime en dos sitios —«Forma de pago:
          CREDITO» y «FACTURA 30 DIAS»— y el nuestro no la imprimía en ninguno,
          teniendo el dato en la cabecera desde siempre. Una cotización a 30
          días y la misma al contado no son la misma oferta.
        */
        c.formaPago ? { etiqueta: "Forma de pago", valor: c.formaPago } : null,
        { etiqueta: "Entrega", valor: c.tiempoEntrega ?? "Por confirmar" },

        c.ordenCompraCliente
          ? { etiqueta: "O/C del cliente", valor: c.ordenCompraCliente }
          : null,
        /*
          El vendedor, arriba y no solo en el pie.

          Willy, 16/09: *«incluir también el campo "Vendedor"»*, y su formato
          lo lleva abajo a la derecha del bloque, que es donde queda aquí.
          Estaba solo en el «Atendido por» del final, que es una firma de
          cortesía — no el dato con el que el cliente pregunta con quién habló
          seis semanas después.
        */
        { etiqueta: "Vendedor", valor: c.vendedor ?? "—" },
      ]}
      columnas={columnas}
      filas={c.lineas.map((l) => ({
        n: l.n,
        codigo: <span className="font-medium">{l.codigo}</span>,
        marca: l.marca,
        /*
          La descripción, y debajo lo que lleva el kit.

          Willy, 16/09 (10:35): *«puedes indicar kit de reparación de máquina
          tal y debajo puede aparecer una lista. Pero no son varios ítems de la
          factura: todo eso es un solo ítem que tiene un solo precio»*.

          Sin precios, que es lo que él remarcó: *«solamente se podría indicar
          lo que contiene, pero no precios detallados por cada parte»*.
          Detallarlos invitaría al cliente a comprar las piezas sueltas por su
          cuenta, que es justo lo contrario de vender un kit.

          Y va DENTRO de la celda de la descripción, no como filas aparte: en
          un comprobante una fila es un ítem con su importe, y las líneas a
          cero se rechazan.
        */
        descripcion:
          l.contiene.length > 0 ? (
            <>
              <span className="block">{l.descripcion}</span>
              {/*
                11.5 px y no 10: la tabla del papel está en 12.75 y Willy no ve
                bien. Un escalón se lee; dos, no. Es más pequeño que la
                descripción a propósito —es información secundaria— pero no
                tanto como para que haya que acercar la hoja.
              */}
              <span className="mt-0.5 block text-[11.5px] leading-snug text-[#444]">
                Contiene: {l.contiene.map((c) => `${c.cantidad} × ${c.texto}`).join(" · ")}
              </span>
            </>
          ) : (
            l.descripcion
          ),
        cantidad: <span className="tabular">{l.cantidad}</span>,
        unidad: l.unidad,
        entrega: l.entrega,
        valorUnitario: <span className="tabular">{dinero(l.valorUnitario)}</span>,
        descuento: l.descuentoPct > 0 ? `${l.descuentoPct}%` : "—",
        importe: <span className="tabular">{dinero(l.importe)}</span>,
      }))}
      totales={[
        { etiqueta: "Valor de venta", valor: `${c.simbolo} ${dinero(c.subtotal)}` },
        ...(c.mostrarDescuento && c.descuento > 0
          ? [{ etiqueta: "Descuento", valor: `${c.simbolo} − ${dinero(c.descuento)}` }]
          : []),
        {
          etiqueta: `IGV (${(c.tasaIgv * 100).toFixed(0)}%)`,
          valor: `${c.simbolo} ${dinero(c.igv)}`,
        },
        {
          etiqueta: "Total",
          valor: `${c.simbolo} ${dinero(c.total)}`,
          destacado: true,
        },
      ]}
      enLetras={c.enLetras}
      pie={
        <>
          {c.condiciones ? (
            <p className="mb-1">
              <strong>Condiciones:</strong> {c.condiciones}
            </p>
          ) : null}
          {c.observaciones ? (
            <p className="mb-1 whitespace-pre-line">{c.observaciones}</p>
          ) : null}
          {/* C6 y C1 juntas: la moneda y por qué el valor unitario no lleva
              IGV. Es la frase que evita la llamada del cliente preguntando. */}
          <p className="mb-1">
            Los precios están expresados en <strong>dólares americanos</strong> y no
            incluyen IGV en la columna de valor unitario.
          </p>
          <CuentasParaPagar cuentas={cuentas} />

          <div className="mt-3 flex items-end justify-between">
            <span>{c.vendedor ? `Atendido por ${c.vendedor}` : ""}</span>
            {c.emisor.email ? <span>{c.emisor.email}</span> : null}
          </div>
        </>
      }
    />
  );
}
