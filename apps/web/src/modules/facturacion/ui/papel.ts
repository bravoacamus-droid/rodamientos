import { siglaBanco, type CuentaParaPagar } from "@/componentes/cuentas-para-pagar";
import type { EmisorHoja } from "@/componentes/hoja-documento";
import type { BloquePiePdf, HojaPdf } from "@/lib/pdf-hoja";

import { cuotasNetas, RETENCION_PCT } from "../dominio/retencion";
import { enMonedaDelDocumento, nombreMoneda, simboloDe } from "../dominio/moneda-documento";
import { ETIQUETA_TIPO, type ComprobanteDetalle } from "../dominio/tipos";

/**
 * Lo que dice la cabecera del papel del comprobante, y el comprobante entero
 * como PDF (14/10).
 *
 * Aparte del componente porque ahora lo dibujan DOS: la hoja que se imprime
 * (`DocumentoComprobante`) y el PDF que se descarga. Escrito una sola vez,
 * no pueden decir cosas distintas.
 */

const dinero = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (f: string) => {
  const [a, m, d] = f.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : f;
};

export function datosDeComprobante(c: ComprobanteDetalle) {
  const esNota = c.tipo === "nota_credito" || c.tipo === "nota_debito";
  const alCredito = c.condicion_pago === "credito";
  return [
    { etiqueta: "Señores", valor: c.cliente ?? "—" },
    { etiqueta: "Fecha de emisión", valor: fecha(c.fecha_emision) },
    {
      etiqueta: c.cliente_tipo_documento ?? "Doc.",
      valor: c.cliente_documento ?? "—",
    },
    {
      etiqueta: "Condición",
      valor: alCredito ? `Crédito a ${c.dias_credito} días` : "Contado",
    },
    c.cliente_direccion
      ? { etiqueta: "Dirección", valor: c.cliente_direccion }
      : null,
    alCredito && c.fecha_vencimiento
      ? { etiqueta: "Vence", valor: fecha(c.fecha_vencimiento) }
      : null,
    // La moneda, dicha (su formato la lleva: «MONEDA: USD», 15/10).
    { etiqueta: "Moneda", valor: c.moneda === "PEN" ? "Soles (PEN)" : "Dólares americanos (USD)" },
    // Una nota sin decir qué corrige no sirve de nada: es el dato por el
    // que se busca, tanto en el ERP como en la contabilidad del cliente.
    esNota && c.referencia_numero
      ? { etiqueta: "Modifica a", valor: c.referencia_numero }
      : null,
    c.orden_compra_cliente
      ? { etiqueta: "O/C del cliente", valor: c.orden_compra_cliente }
      : null,
    c.cotizacion_numero
      ? { etiqueta: "Cotización", valor: c.cotizacion_numero }
      : null,
    // Con qué guía salió la mercadería. Su formato la imprime, y es la
    // que ata el papel que firmó el almacén del cliente con la factura
    // que tiene que pagar: la guía sellada es lo que autoriza a facturar.
    c.guia_numero
      ? {
          // En plural cuando ampara varias (084). Willy, 16/09: «a veces
          // hay que hacer una factura de dos guías».
          etiqueta: c.guia_numero.includes(",")
            ? "Guías de remisión"
            : "Guía de remisión",
          valor: c.guia_numero,
          // A lo ancho: tres números de guía no caben en media columna.
          ancho: c.guia_numero.includes(","),
        }
      : null,
  ];
}

/**
 * Las columnas del detalle, las mismas en el papel y en el PDF (15/10). Su
 * formato lleva el valor unitario Y el precio unitario con IGV, y el nuestro
 * solo el primero: el cliente que compara con su orden de compra suele mirar
 * el precio con IGV.
 */
export const COLUMNAS_COMPROBANTE = [
  { clave: "n", titulo: "#", alinear: "centro" as const },
  { clave: "codigo", titulo: "Código" },
  { clave: "marca", titulo: "Marca" },
  { clave: "descripcion", titulo: "Descripción" },
  { clave: "cantidad", titulo: "Cant.", alinear: "derecha" as const },
  { clave: "unidad", titulo: "U.M.", alinear: "centro" as const },
  { clave: "valorUnitario", titulo: "V. unit.", alinear: "derecha" as const },
  { clave: "precioUnitario", titulo: "P. unit. (con IGV)", alinear: "derecha" as const },
  { clave: "importe", titulo: "Importe", alinear: "derecha" as const },
];

/** El precio unitario con IGV, a cuatro decimales como el de su formato. */
export function precioConIgv(valorUnitario: number, descuentoPct = 0): string {
  return (valorUnitario * (1 - descuentoPct / 100) * 1.18).toFixed(4);
}

/**
 * Los totales del papel, como su formato: el total de ítems, las cuatro
 * operaciones —gravada, gratuita, exonerada, inafecta, aunque vayan en cero—,
 * el IGV y el total.
 */
export function totalesDelPapel(c: ComprobanteDetalle): { etiqueta: string; valor: string; destacado?: boolean }[] {
  const sim = simboloDe(c.moneda);
  const items = c.lineas.reduce((a, l) => a + Number(l.cantidad), 0);
  return [
    { etiqueta: "Total de ítems", valor: items.toFixed(2) },
    { etiqueta: "Op. gravada", valor: `${sim} ${dinero(c.op_gravada)}` },
    { etiqueta: "Op. gratuita", valor: `${sim} 0.00` },
    { etiqueta: "Op. exonerada", valor: `${sim} ${dinero(c.op_exonerada)}` },
    { etiqueta: "Op. inafecta", valor: `${sim} ${dinero(c.op_inafecta)}` },
    ...(c.descuento_global > 0 ? [{ etiqueta: "Descuento", valor: `${sim} - ${dinero(c.descuento_global)}` }] : []),
    { etiqueta: "IGV (18%)", valor: `${sim} ${dinero(c.igv)}` },
    { etiqueta: "Importe total", valor: `${sim} ${dinero(c.total)}`, destacado: true },
  ];
}

/**
 * Las cuotas se imprimen siempre que es a crédito —«DETALLE CUOTAS PAGO
 * PENDIENTE», como su formato—, aunque sea una sola. Con retención ya las
 * dice el cuadro de la retención (cuota, fecha y neto), y no se repiten.
 */
export function imprimeCuotas(c: ComprobanteDetalle): boolean {
  return c.condicion_pago === "credito" && c.cuotas.length > 0 && !c.retencion_aplica;
}

/**
 * El cuadro de la retención: cuánto se retiene, en cuántas cuotas, cuándo se
 * paga y cuánto llega de verdad (14/10). Lo usan el papel y el PDF.
 */
/**
 * El renglón «Información de la retención», como lo imprime su F002-564:
 * base imponible (el total), porcentaje y monto.
 */
export function infoRetencion(c: ComprobanteDetalle): string {
  return `Base imponible de la retención: ${simboloDe(c.moneda)} ${dinero(c.total)} · Porcentaje: ${RETENCION_PCT}% · Monto: ${simboloDe(c.moneda)} ${dinero(c.retencion_monto)}`;
}

/** Las cuotas que se imprimen: con retención, lo pendiente (total − retenido). */
export function cuotasDelPapel(c: ComprobanteDetalle) {
  return cuotasNetas(c.cuotas, c.retencion_aplica ? c.retencion_monto : 0);
}

export function cuadroRetencion(c: ComprobanteDetalle): { cabecera: string[]; fila: string[] } {
  const neto = Math.round((c.total - c.retencion_monto) * 100) / 100;
  return {
    cabecera: [`Retención IGV (${RETENCION_PCT}%)`, "Cuotas", "Fecha de pago", "Monto neto a pagar"],
    fila: [
      `${simboloDe(c.moneda)} ${dinero(c.retencion_monto)}`,
      String(Math.max(c.cuotas.length, 1)),
      fecha(c.fecha_vencimiento ?? c.fecha_emision),
      `${simboloDe(c.moneda)} ${dinero(neto)}`,
    ],
  };
}

const MONEDA_CUENTA: Record<string, string> = { USD: "DÓLARES", PEN: "SOLES" };

export function hojaDeComprobante(
  original: ComprobanteDetalle,
  emisor: EmisorHoja,
  cuentas: readonly CuentaParaPagar[] = [],
  qr: { png: string; hash: string | null } | null = null,
): HojaPdf {
  // En soles, todo en soles (116): las líneas, los totales y las cuotas.
  const c = enMonedaDelDocumento(original);
  const pie: BloquePiePdf[] = [];
  if (c.detraccion_aplica) {
    pie.push({
      tipo: "parrafo",
      trozos: [
        { texto: `Detracción ${c.detraccion_porcentaje}%: `, negrita: true },
        {
          texto: `${simboloDe(c.moneda)} ${dinero(c.detraccion_monto)}${c.detraccion_codigo ? ` (código ${c.detraccion_codigo})` : ""}. El cliente paga ${simboloDe(c.moneda)} ${dinero(c.total - c.detraccion_monto)} y deposita el resto en la cuenta de detracciones.`,
        },
      ],
    });
  }
  if (c.observaciones) pie.push({ tipo: "parrafo", trozos: [{ texto: c.observaciones }] });
  pie.push({
    tipo: "parrafo",
    trozos: [{ texto: "Los importes están expresados en " }, { texto: nombreMoneda(c.moneda), negrita: true }, { texto: "." }],
  });
  pie.push({
    tipo: "parrafo",
    trozos: [{ texto: "Representación impresa del comprobante electrónico. Consulte su validez en el portal de SUNAT." }],
  });
  // Las cuotas, solo si hay más de una (igual que el papel).
  if (imprimeCuotas(c)) {
    pie.push({
      tipo: "tabla",
      titulo: `Detalle de cuotas · pago pendiente (${simboloDe(c.moneda)} ${dinero(cuotasDelPapel(c).reduce((a, q) => a + q.monto, 0))})`,
      cabecera: ["Cuota", "Vence", "Importe"],
      filas: cuotasDelPapel(c).map((q) => [String(q.numero), fecha(q.fecha_vencimiento), `${simboloDe(c.moneda)} ${dinero(q.monto)}`]),
      derecha: [2],
    });
  }
  if (c.retencion_aplica) {
    const cuadro = cuadroRetencion(c);
    pie.push({
      tipo: "parrafo",
      trozos: [{ texto: "Información de la retención: ", negrita: true }, { texto: infoRetencion(c) }],
    });
    pie.push({ tipo: "tabla", titulo: "", cabecera: cuadro.cabecera, filas: [cuadro.fila] });
  }
  if (c.mostrar_cuenta && cuentas.length > 0) {
    const orden = (m: string) => ({ USD: 0, PEN: 1 } as Record<string, number>)[m.toUpperCase()] ?? 9;
    pie.push({
      tipo: "cuentas",
      titulo: "CUENTAS BANCARIAS",
      filas: [...cuentas]
        .sort((a, b) => orden(a.moneda) - orden(b.moneda))
        .map((k) => [siglaBanco(k.banco), MONEDA_CUENTA[k.moneda.toUpperCase()] ?? k.moneda, k.numero, k.cci ?? "—"] as [string, string, string, string]),
    });
  }

  if (qr) pie.push({ tipo: "qr", dato: qr.png, hash: qr.hash });
  return {
    emisor,
    // Anulado, que se vea en el papel y en el PDF (auditoría 14/10).
    titulo: `${ETIQUETA_TIPO[c.tipo]} electrónica${c.estado === "anulado" ? " · ANULADA, sin validez" : ""}`,
    numero: c.numero,
    datos: datosDeComprobante(c),
    columnas: COLUMNAS_COMPROBANTE,
    filas: c.lineas.map((l, i) => ({
      n: String(i + 1),
      codigo: l.codigo,
      marca: l.marca ?? "—",
      descripcion: l.descripcion,
      cantidad: String(l.cantidad),
      unidad: l.unidad,
      valorUnitario: dinero(l.valor_unitario),
      precioUnitario: precioConIgv(l.valor_unitario, l.descuento_pct),
      importe: dinero(l.importe),
    })),
    totales: totalesDelPapel(c),
    enLetras: c.total_letras,
    pie,
  };
}
