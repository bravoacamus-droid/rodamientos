import { HojaDocumento, type EmisorHoja } from "@/componentes/hoja-documento";
import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";

import type { CompraDetalle } from "../dominio/tipos";

const fecha = (f: string) => {
  const [a, m, d] = f.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : f;
};

/**
 * La orden de compra en papel, para mandársela al proveedor (12/10).
 *
 * La hoja de Willy del 09/10 acaba en «ÓRDENES DE COMPRA OC1, OC2, OC3»: una
 * por proveedor. Sale en la misma hoja que la cotización y la factura
 * (`HojaDocumento`), así que el proveedor recibe el mismo membrete.
 *
 * Lo que NO lleva, a propósito: el cliente para el que se compra ni el precio
 * al que se le vende. Es información de Rodatech, y en manos del proveedor
 * es la forma más corta de que le venda directo al cliente.
 */
export function DocumentoOrdenCompra({ c, emisor }: { c: CompraDetalle; emisor: EmisorHoja }) {
  const simbolo = c.moneda === "PEN" ? "S/" : "$";
  const dinero = (n: number) =>
    `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const unitario = (n: number) =>
    `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

  return (
    <HojaDocumento
      emisor={emisor}
      titulo="Orden de compra"
      numero={c.numero}
      datos={[
        { etiqueta: "Señores", valor: c.proveedor ?? "—", ancho: true },
        ...(c.proveedor_direccion ? [{ etiqueta: "Dirección", valor: c.proveedor_direccion, ancho: true }] : []),
        { etiqueta: "RUC", valor: c.proveedor_documento ?? "—" },
        { etiqueta: "Fecha", valor: fecha(c.fecha) },
        { etiqueta: "Moneda", valor: c.moneda === "PEN" ? "Soles" : "Dólares" },
        c.fecha_estimada ? { etiqueta: "Entrega", valor: fecha(c.fecha_estimada) } : null,
      ]}
      columnas={[
        { clave: "n", titulo: "#", alinear: "centro" },
        { clave: "codigo", titulo: "Código" },
        { clave: "marca", titulo: "Marca" },
        { clave: "descripcion", titulo: "Descripción" },
        { clave: "cantidad", titulo: "Cant.", alinear: "derecha" },
        { clave: "unidad", titulo: "U.M.", alinear: "centro" },
        { clave: "precio", titulo: "Precio unit.", alinear: "derecha" },
        { clave: "importe", titulo: "Importe", alinear: "derecha" },
      ]}
      filas={c.lineas.map((l, i) => ({
        n: i + 1,
        codigo: l.codigo,
        marca: l.marca ?? "—",
        descripcion: l.descripcion,
        cantidad: <span className="tabular">{l.cantidad}</span>,
        unidad: unidadLegible(l.unidad),
        precio: <span className="tabular">{unitario(l.costo_unitario)}</span>,
        importe: <span className="tabular">{dinero(l.importe)}</span>,
      }))}
      totales={[
        { etiqueta: "Subtotal", valor: dinero(c.subtotal) },
        { etiqueta: "IGV", valor: dinero(c.igv) },
        { etiqueta: "Total", valor: dinero(c.total), destacado: true },
      ]}
      pie={
        <p>
          Precios sin IGV. Favor de indicar el número de esta orden en su guía y su factura.
        </p>
      }
    />
  );
}
