import { CuentasParaPagar, type CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import { HojaDocumento } from "@/componentes/hoja-documento";

import type { CotizacionImpresa } from "../../dominio/impresion";
import { formatoFecha } from "../../dominio/whatsapp";
import { columnasDelPapel, datosDelPapel } from "./papel";

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
  const columnas = columnasDelPapel(c);

  return (
    <HojaDocumento
      emisor={c.emisor}
      titulo="Cotización"
      numero={c.numero}
      datos={datosDelPapel(c)}
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
          l.contiene.length > 0 || l.nota ? (
            <>
              <span className="block">{l.descripcion}</span>
              {/*
                11.5 px y no 10: la tabla del papel está en 12.75 y Willy no ve
                bien. Un escalón se lee; dos, no. Es más pequeño que la
                descripción a propósito —es información secundaria— pero no
                tanto como para que haya que acercar la hoja.

                En la tarjeta del teléfono (menos de 672 px de hoja), 14 px:
                ahí todo va a 14 y un escalón por debajo ya no se lee (29/10).
              */}
              {l.contiene.length > 0 ? (
                <span className="mt-0.5 block text-[11.5px] leading-snug text-[#444] @max-2xl:text-sm print:text-[11.5px]">
                  Contiene: {l.contiene.map((c) => `${c.cantidad} × ${c.texto}`).join(" · ")}
                </span>
              ) : null}
              {/* La nota de la línea (112): el mismo escalón que «Contiene». */}
              {l.nota ? (
                <span className="mt-0.5 block text-[11.5px] italic leading-snug text-[#444] @max-2xl:text-sm print:text-[11.5px]">Nota: {l.nota}</span>
              ) : null}
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
          {/* En soles (13/10) se dice a qué cambio y de qué día: un precio
              convertido sin su tipo de cambio no se puede comprobar, y el
              cliente que vuelve a la semana tiene que saber de dónde salió. */}
          {c.moneda === "PEN" && c.tipoCambio ? (
            <p className="mb-1">
              Los precios están expresados en <strong>soles</strong>, al tipo de cambio venta
              de <strong>S/ {c.tipoCambio.valor.toFixed(3)}</strong> por dólar del{" "}
              {formatoFecha(c.tipoCambio.fecha)}, y no incluyen IGV en la columna de valor
              unitario.
            </p>
          ) : (
            <p className="mb-1">
              Los precios están expresados en <strong>dólares americanos</strong> y no
              incluyen IGV en la columna de valor unitario.
            </p>
          )}
          <CuentasParaPagar cuentas={cuentas} />

          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 print:flex-nowrap">
            <span>{c.vendedor ? `Atendido por ${c.vendedor}` : ""}</span>
            {c.emisor.email ? <span>{c.emisor.email}</span> : null}
          </div>
        </>
      }
    />
  );
}
