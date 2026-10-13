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
  if (c.cuotas.length > 1) {
    pie.push({
      tipo: "tabla",
      titulo: "Cuotas",
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

  const hayDescuento = c.descuento_global > 0;
  return {
    emisor,
    titulo: `${ETIQUETA_TIPO[c.tipo]} electrónica`,
    numero: c.numero,
    datos: datosDeComprobante(c),
    columnas: [
      { clave: "n", titulo: "#", alinear: "centro" },
      { clave: "codigo", titulo: "Código" },
      { clave: "marca", titulo: "Marca" },
      { clave: "descripcion", titulo: "Descripción" },
      { clave: "cantidad", titulo: "Cant.", alinear: "derecha" },
      { clave: "unidad", titulo: "U.M.", alinear: "centro" },
      { clave: "valorUnitario", titulo: "Valor unit.", alinear: "derecha" },
      { clave: "importe", titulo: "Importe", alinear: "derecha" },
    ],
    filas: c.lineas.map((l, i) => ({
      n: String(i + 1),
      codigo: l.codigo,
      marca: l.marca ?? "—",
      descripcion: l.descripcion,
      cantidad: String(l.cantidad),
      unidad: l.unidad,
      valorUnitario: dinero(l.valor_unitario),
      importe: dinero(l.importe),
    })),
    totales: [
      { etiqueta: "Op. gravada", valor: `${simboloDe(c.moneda)} ${dinero(c.op_gravada)}` },
      ...(c.op_exonerada > 0 ? [{ etiqueta: "Op. exonerada", valor: `${simboloDe(c.moneda)} ${dinero(c.op_exonerada)}` }] : []),
      ...(c.op_inafecta > 0 ? [{ etiqueta: "Op. inafecta", valor: `${simboloDe(c.moneda)} ${dinero(c.op_inafecta)}` }] : []),
      ...(hayDescuento ? [{ etiqueta: "Descuento", valor: `${simboloDe(c.moneda)} - ${dinero(c.descuento_global)}` }] : []),
      { etiqueta: "IGV (18%)", valor: `${simboloDe(c.moneda)} ${dinero(c.igv)}` },
      { etiqueta: "Total", valor: `${simboloDe(c.moneda)} ${dinero(c.total)}`, destacado: true },
    ],
    enLetras: c.total_letras,
    pie,
  };
}
