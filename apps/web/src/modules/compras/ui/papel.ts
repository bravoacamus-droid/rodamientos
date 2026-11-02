import type { DatoHoja, EmisorHoja } from "@/componentes/hoja-documento";
import type { HojaPdf } from "@/lib/pdf-hoja";
import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";

import type { CompraDetalle } from "../dominio/tipos";

/**
 * La orden de compra en papel y en PDF (02/11), escrita una sola vez.
 *
 * La dibujan dos: la hoja que se imprime (`DocumentoOrdenCompra`) y el PDF
 * que se descarga para mandárselo al proveedor. Como con la guía, si cada una
 * armara su cabecera acabarían diciendo cosas distintas.
 */

const fecha = (f: string) => {
  const [a, m, d] = f.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : f;
};

/** «Contado / previo pago» o «Crédito: factura a 30 días» (180). */
export function textoCondicionPago(c: Pick<CompraDetalle, "condicion_pago" | "dias_credito">): string | null {
  if (c.condicion_pago === "contado") return "Contado / previo pago";
  if (c.condicion_pago === "credito") return c.dias_credito ? `Crédito: factura a ${c.dias_credito} días` : "Crédito";
  return null;
}

/** Dónde se entrega (180): en el almacén de Rodatech o recojo en su local. */
export function textoEntrega(
  c: Pick<CompraDetalle, "entrega" | "direccion_entrega">,
  emisor: Pick<EmisorHoja, "direccion">,
): string | null {
  if (c.entrega === "recojo") return "Recojo en el local del proveedor";
  if (c.entrega === "almacen") return c.direccion_entrega ?? emisor.direccion ?? "En nuestro almacén";
  return null;
}

/** La cabecera: a quién va y en qué condiciones. */
export function datosDeOrden(c: CompraDetalle, emisor: EmisorHoja): DatoHoja[] {
  const pago = textoCondicionPago(c);
  const entrega = textoEntrega(c, emisor);
  return [
    { etiqueta: "Señores", valor: c.proveedor ?? "—", ancho: true },
    ...(c.proveedor_direccion ? [{ etiqueta: "Dirección", valor: c.proveedor_direccion, ancho: true }] : []),
    { etiqueta: "RUC", valor: c.proveedor_documento ?? "—" },
    { etiqueta: "Fecha", valor: fecha(c.fecha) },
    { etiqueta: "Moneda", valor: c.moneda === "PEN" ? "Soles" : "Dólares" },
    ...(c.fecha_estimada ? [{ etiqueta: "Fecha de entrega", valor: fecha(c.fecha_estimada) }] : []),
    ...(pago ? [{ etiqueta: "Condición de pago", valor: pago }] : []),
    ...(entrega ? [{ etiqueta: c.entrega === "recojo" ? "Entrega" : "Lugar de entrega", valor: entrega, ancho: true }] : []),
  ];
}

const PIE = "Precios sin IGV. Favor de indicar el número de esta orden en su guía y su factura.";

/** El pie: la nota de siempre y, si hay, las observaciones de la orden. */
export function pieDeOrden(c: Pick<CompraDetalle, "observaciones">): string[] {
  return [PIE, ...(c.observaciones?.trim() ? [`Observaciones: ${c.observaciones.trim()}`] : [])];
}

/** La orden entera, para el PDF. */
export function hojaDeOrdenCompra(c: CompraDetalle, emisor: EmisorHoja): HojaPdf {
  const simbolo = c.moneda === "PEN" ? "S/" : "$";
  const dinero = (n: number) =>
    `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const unitario = (n: number) =>
    `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return {
    emisor,
    titulo: "Orden de compra",
    numero: c.numero,
    datos: datosDeOrden(c, emisor),
    columnas: [
      { clave: "n", titulo: "#", alinear: "centro" },
      { clave: "codigo", titulo: "Código", sinCortar: true },
      { clave: "marca", titulo: "Marca" },
      { clave: "descripcion", titulo: "Descripción" },
      { clave: "cantidad", titulo: "Cant.", alinear: "derecha" },
      { clave: "unidad", titulo: "U.M.", alinear: "centro" },
      { clave: "precio", titulo: "Precio unit.", alinear: "derecha" },
      { clave: "importe", titulo: "Importe", alinear: "derecha" },
    ],
    filas: c.lineas.map((l, i) => ({
      n: String(i + 1),
      codigo: l.codigo,
      marca: l.marca ?? "—",
      descripcion: l.descripcion,
      cantidad: String(l.cantidad),
      unidad: unidadLegible(l.unidad),
      precio: unitario(l.costo_unitario),
      importe: dinero(l.importe),
    })),
    totales: [
      { etiqueta: "Subtotal", valor: dinero(c.subtotal) },
      { etiqueta: "IGV", valor: dinero(c.igv) },
      { etiqueta: "Total", valor: dinero(c.total), destacado: true },
    ],
    pie: pieDeOrden(c).map((t) => ({ tipo: "parrafo" as const, trozos: [{ texto: t }] })),
  };
}
