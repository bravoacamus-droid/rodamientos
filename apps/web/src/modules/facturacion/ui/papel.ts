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
  ];
}

/**
 * Los documentos que atan la factura a la venta, debajo del importe en
 * letras y con sus nombres, como su F002-564 (Luis, 15/10: *«pero te pasé
 * cómo lo tiene»*). Arriba, mezclados con el cliente, no se encontraban.
 */
export function referenciasDelPapel(c: ComprobanteDetalle): { etiqueta: string; valor: string }[] {
  return [
    c.orden_compra_cliente ? { etiqueta: "Orden de compra/servicio", valor: c.orden_compra_cliente } : null,
    c.cotizacion_numero ? { etiqueta: "Cotización", valor: c.cotizacion_numero } : null,
    // Con qué guía salió la mercadería: la guía sellada es lo que autoriza a
    // facturar. En plural cuando ampara varias (084).
    c.guia_numero
      ? {
          etiqueta: c.guia_numero.includes(",") ? "Guías de remisión remitente" : "Guía de remisión remitente",
          valor: c.guia_numero,
        }
      : null,
  ].filter((r): r is { etiqueta: string; valor: string } => r !== null);
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
 * PENDIENTE», como su formato—, aunque sea una sola. Con retención, netas:
 * es el «cuadrito aparte con la cuota, la fecha de pago y el monto neto» que
 * pidió Willy el 13/10, y en su F002-564 es esta misma tabla. Por eso ya no
 * hay un cuadro de la retención aparte (15/10).
 */
export function imprimeCuotas(c: ComprobanteDetalle): boolean {
  return c.condicion_pago === "credito";
}

/**
 * El renglón «Información de la retención», como lo imprime su F002-564:
 * base imponible (el total), porcentaje y monto.
 */
export function infoRetencion(c: ComprobanteDetalle): string[] {
  // «USD» y no «$», como su F002-564: es el bloque que copia el cliente al declarar.
  const sim = c.moneda === "PEN" ? "S/" : "USD";
  // En dólares, el monto también en soles: así lo declara el cliente.
  const enSoles =
    c.moneda !== "PEN" && c.tipo_cambio ? ` - S/ ${dinero(Math.round(c.retencion_monto * c.tipo_cambio * 100) / 100)}` : "";
  return [
    `Base imponible de la retención: ${sim} ${dinero(c.total)}`,
    `Porcentaje: ${RETENCION_PCT}% - Monto: ${sim} ${dinero(c.retencion_monto)}${enSoles}`,
  ];
}

/** Las cuotas que se imprimen: con retención, lo pendiente (total − retenido). */
export function cuotasDelPapel(c: ComprobanteDetalle) {
  // A crédito sin filas de cuotas (un solo pago): una, al vencimiento.
  const cuotas = c.cuotas.length > 0
    ? c.cuotas
    : [{ numero: 1, fecha_vencimiento: c.fecha_vencimiento ?? c.fecha_emision, monto: c.total, pagado: 0 }];
  return cuotasNetas(cuotas, c.retencion_aplica ? c.retencion_monto : 0);
}

/** «DETALLE CUOTAS PAGO PENDIENTE (USD 234.94)», como su formato. */
export function tituloCuotas(c: ComprobanteDetalle): string {
  const total = cuotasDelPapel(c).reduce((a, q) => a + q.monto, 0);
  return `Detalle cuotas pago pendiente (${c.moneda === "PEN" ? "S/" : "USD"} ${dinero(total)})`;
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
  // En el orden de su F002-564: referencias, retención, observaciones, el QR
  // con el hash, las cuotas, y abajo las leyendas y las cuentas.
  for (const r of referenciasDelPapel(c)) {
    pie.push({ tipo: "parrafo", trozos: [{ texto: `${r.etiqueta}: `, negrita: true }, { texto: r.valor }] });
  }
  if (c.retencion_aplica) {
    pie.push({ tipo: "parrafo", trozos: [{ texto: "Información de la retención:", negrita: true }] });
    for (const l of infoRetencion(c)) pie.push({ tipo: "parrafo", trozos: [{ texto: l }] });
  }
  if (c.observaciones) {
    pie.push({ tipo: "parrafo", trozos: [{ texto: "OBSERVACIONES:", negrita: true }] });
    pie.push({ tipo: "parrafo", trozos: [{ texto: c.observaciones }] });
  }
  if (qr) pie.push({ tipo: "qr", dato: qr.png, hash: qr.hash });
  if (imprimeCuotas(c)) {
    pie.push({
      tipo: "tabla",
      titulo: tituloCuotas(c).toUpperCase(),
      cabecera: ["Cuota", "Fecha", "Total"],
      filas: cuotasDelPapel(c).map((q) => [String(q.numero), fecha(q.fecha_vencimiento), `${c.moneda === "PEN" ? "S/" : "USD"} ${dinero(q.monto)}`]),
      derecha: [2],
    });
  }
  pie.push({
    tipo: "parrafo",
    trozos: [{ texto: "Los importes están expresados en " }, { texto: nombreMoneda(c.moneda), negrita: true }, { texto: "." }],
  });
  pie.push({
    tipo: "parrafo",
    trozos: [{ texto: "Representación impresa del comprobante electrónico. Consulte su validez en el portal de SUNAT." }],
  });
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
