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

export function Documento({ c }: { c: CotizacionImpresa }) {
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
        { etiqueta: "Señores", valor: c.cliente.razonSocial },
        { etiqueta: "Fecha", valor: formatoFecha(c.fecha) },
        {
          etiqueta: c.cliente.tipoDocumento ?? "Doc.",
          valor: c.cliente.documento ?? "—",
        },
        {
          etiqueta: "Válida hasta",
          valor: `${formatoFecha(c.validaHasta)} (${c.validezDias} días)`,
        },
        c.cliente.direccion
          ? { etiqueta: "Dirección", valor: c.cliente.direccion }
          : null,
        { etiqueta: "Entrega", valor: c.tiempoEntrega ?? "Por confirmar" },
        { etiqueta: "Atención", valor: c.cliente.contacto ?? "—" },
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
          <div className="mt-3 flex items-end justify-between">
            <span>{c.vendedor ? `Atendido por ${c.vendedor}` : ""}</span>
            {c.emisor.email ? <span>{c.emisor.email}</span> : null}
          </div>
        </>
      }
    />
  );
}
