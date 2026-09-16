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
          El orden del bloque: a quién va, dónde está, y solo después quién es
          ante SUNAT.

          Luis, 16/09, comparando con el formato de Willy: *«pone el nombre
          arriba, señor; la dirección, segundo; así lo tenemos más ordenado»*.
          Y el formato de Willy hace justo eso — Señor(es), Dirección, R.U.C.,
          Fecha de emisión.

          Tiene sentido más allá de la costumbre: las dos primeras líneas son
          «a quién le mando esto y a dónde». El RUC es un dato administrativo
          que se comprueba después, no lo que se lee de un vistazo.
        */
        { etiqueta: "Señores", valor: c.cliente.razonSocial },
        { etiqueta: "Fecha", valor: formatoFecha(c.fecha) },

        /*
          La dirección, a lo ancho de las dos columnas.

          Willy, 16/09: *«la fila de la "Dirección" debe estar libre, porque la
          razón social es siempre amplia»*. Partida en media hoja, una
          dirección del Callao salía en cinco renglones y empujaba hacia abajo
          todo lo que tenía al lado.

          Cuando NO hay dirección se omite entera, en vez de dejar un `null`:
          un hueco en una fila de ancho completo correría el RUC a la columna
          de la derecha y descuadraría todo lo de abajo.
        */
        ...(c.cliente.direccion
          ? [
              {
                etiqueta: "Dirección",
                valor: c.cliente.direccion,
                ancho: true,
              },
            ]
          : []),

        {
          etiqueta: c.cliente.tipoDocumento ?? "Doc.",
          valor: c.cliente.documento ?? "—",
        },
        {
          etiqueta: "Válida hasta",
          valor: `${formatoFecha(c.validaHasta)} (${c.validezDias} días)`,
        },
        { etiqueta: "Entrega", valor: c.tiempoEntrega ?? "Por confirmar" },
        /*
          Junto a la entrega, que es su pareja: las dos son la condición
          comercial, y el cliente las compara juntas.

          El formato de Willy lo imprime en dos sitios —«Forma de pago:
          CREDITO» y «FACTURA 30 DIAS»— y el nuestro no lo imprimía en
          ninguno, teniendo el dato en la cabecera desde siempre. Una
          cotización a 30 días y la misma al contado no son la misma oferta.
        */
        c.formaPago ? { etiqueta: "Forma de pago", valor: c.formaPago } : null,
        { etiqueta: "Atención", valor: c.cliente.contacto ?? "—" },
        /*
          El vendedor, arriba y no solo en el pie.

          Willy, 16/09: *«incluir también el campo "Vendedor"»*, y su formato
          lo lleva en la cabecera. Estaba abajo del todo, en el «Atendido por»,
          que es una firma de cortesía — no el dato con el que el cliente
          pregunta «¿con quién hablé?» seis semanas después.
        */
        { etiqueta: "Vendedor", valor: c.vendedor ?? "—" },
        c.ordenCompraCliente
          ? { etiqueta: "O/C del cliente", valor: c.ordenCompraCliente }
          : null,
      ]}
      columnas={columnas}
      filas={c.lineas.map((l) => ({
        n: l.n,
        codigo: <span className="font-medium">{l.codigo}</span>,
        marca: l.marca,
        descripcion: l.descripcion,
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
