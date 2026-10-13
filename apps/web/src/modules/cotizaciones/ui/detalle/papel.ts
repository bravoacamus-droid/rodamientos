import type { ColumnaHoja } from "@/componentes/hoja-documento";

import type { CotizacionImpresa } from "../../dominio/impresion";
import { formatoFecha } from "../../dominio/whatsapp";

/**
 * Lo que dicen la cabecera y las columnas del papel de la cotización.
 *
 * Aparte del componente desde el 14/10 porque ahora lo dibujan DOS: la hoja
 * que se imprime (`Documento`) y el PDF que se descarga
 * (`descargarCotizacionPdf`). Escrito una sola vez, no pueden decir cosas
 * distintas.
 */

export function columnasDelPapel(c: CotizacionImpresa): ColumnaHoja[] {
  // C4: este orden exacto. C1: NO hay columna de precio con IGV — es la que
  // le costó ventas, porque el cliente comparaba ese número contra el valor
  // de la competencia y lo veía caro. C5: el descuento solo si se activó.
  return [
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
}

export function datosDelPapel(c: CotizacionImpresa) {
  return [
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
  ];
}
