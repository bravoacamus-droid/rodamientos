/**
 * La hoja de pedido (15/10): lo que el cliente confirmó, en papel.
 *
 * Luis: *«en pedido se puede imprimir, igual descargar la hoja de pedido»*.
 * Sale en la misma hoja que la cotización y la guía, y con los MISMOS datos
 * en la pantalla y en el PDF: los dos dibujan lo que devuelve esta función,
 * así que lo que puede separarse con el tiempo es el dibujo, nunca una cifra.
 *
 * Las cantidades son las del PEDIDO, no las de la cotización: si el cliente
 * confirmó una parte, o es un pedido repetido (121), la hoja dice lo que se
 * va a entregar esta vez. En soles, con el cambio fijado en la cotización
 * (119) y la misma cuenta que su ficha: unitario redondeado y luego importe.
 */

export interface PedidoParaHoja {
  numero: string;
  fecha: string;
  cliente: string;
  cotizacion: { numero: string; ordenCompraCliente: string | null };
  lineas: {
    codigo: string;
    marca: string | null;
    descripcion: string;
    cantidad: number;
    unidad: string;
    valorUnitario: number;
    descuentoPct: number;
  }[];
  papel: {
    moneda: "USD" | "PEN";
    tipoCambio: number | null;
    clienteDocumento: string | null;
    clienteDireccion: string | null;
  };
}

export interface PapelPedido {
  datos: ({ etiqueta: string; valor: string; ancho?: boolean } | null)[];
  columnas: { clave: string; titulo: string; alinear?: "izquierda" | "centro" | "derecha" }[];
  filas: Record<string, string>[];
  totales: { etiqueta: string; valor: string; destacado?: boolean }[];
  /** «Precios en dólares…», al pie. */
  nota: string;
}

const IGV = 0.18;
const r2 = (n: number) => Math.round(n * 100) / 100;

function fecha(f: string): string {
  const [a, m, d] = f.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : f;
}

export function papelDelPedido(p: PedidoParaHoja, unidad: (u: string) => string = (u) => u): PapelPedido {
  const tc = p.papel.moneda === "PEN" ? p.papel.tipoCambio : null;
  const simbolo = tc ? "S/" : "$";
  const num = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dinero = (n: number) => `${simbolo} ${num(n)}`;
  const hayDescuento = p.lineas.some((l) => l.descuentoPct > 0);

  const lineas = p.lineas.map((l) => {
    const unitario = tc ? r2(l.valorUnitario * tc) : l.valorUnitario;
    return { ...l, unitario, importe: r2(l.cantidad * unitario * (1 - l.descuentoPct / 100)) };
  });
  const subtotal = r2(lineas.reduce((t, l) => t + l.importe, 0));
  const igv = r2(subtotal * IGV);

  return {
    datos: [
      { etiqueta: "Señores", valor: p.cliente, ancho: true },
      p.papel.clienteDireccion ? { etiqueta: "Dirección", valor: p.papel.clienteDireccion, ancho: true } : null,
      { etiqueta: "Documento", valor: p.papel.clienteDocumento ?? "—" },
      { etiqueta: "Fecha", valor: fecha(p.fecha) },
      { etiqueta: "Cotización", valor: p.cotizacion.numero },
      { etiqueta: "O/C del cliente", valor: p.cotizacion.ordenCompraCliente ?? "—" },
      { etiqueta: "Moneda", valor: tc ? "Soles" : "Dólares" },
    ],
    columnas: [
      { clave: "n", titulo: "#", alinear: "centro" },
      { clave: "codigo", titulo: "Código" },
      { clave: "marca", titulo: "Marca" },
      { clave: "descripcion", titulo: "Descripción" },
      { clave: "cantidad", titulo: "Cant.", alinear: "derecha" },
      { clave: "unidad", titulo: "U.M.", alinear: "centro" },
      { clave: "unitario", titulo: "Valor unit.", alinear: "derecha" },
      ...(hayDescuento ? [{ clave: "descuento", titulo: "Dscto.", alinear: "derecha" as const }] : []),
      { clave: "importe", titulo: "Importe", alinear: "derecha" },
    ],
    filas: lineas.map((l, i) => ({
      n: String(i + 1),
      codigo: l.codigo,
      marca: l.marca ?? "—",
      descripcion: l.descripcion,
      cantidad: String(l.cantidad),
      unidad: unidad(l.unidad),
      unitario: num(l.unitario),
      ...(hayDescuento ? { descuento: l.descuentoPct > 0 ? `${l.descuentoPct}%` : "—" } : {}),
      importe: num(l.importe),
    })),
    totales: [
      { etiqueta: "Valor de venta", valor: dinero(subtotal) },
      { etiqueta: "IGV (18%)", valor: dinero(igv) },
      { etiqueta: "Total", valor: dinero(r2(subtotal + igv)), destacado: true },
    ],
    nota: tc
      ? `Precios en soles, al tipo de cambio de S/ ${tc.toFixed(3)} por dólar fijado en la cotización ${p.cotizacion.numero}. El valor unitario no incluye IGV.`
      : `Precios en dólares americanos. El valor unitario no incluye IGV.`,
  };
}
