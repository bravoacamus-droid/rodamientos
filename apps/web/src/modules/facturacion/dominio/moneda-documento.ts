import { importeConDescuento, redondear2 } from "@rodatech/config";

import type { ComprobanteDetalle } from "./tipos";

/**
 * El comprobante en la moneda en que se emitió (116).
 *
 * Los importes guardados siguen en dólares —los suman los reportes, el tablero
 * y la cartera—. Una factura en soles guarda además sus totales en soles
 * (`pen`), que son los que se imprimen y van a SUNAT. Esto devuelve el MISMO
 * comprobante con todo en soles, para que el papel, el PDF, la ficha y el
 * envío no tengan que saber nada de monedas:
 *
 *  · Las líneas: el valor unitario a céntimos, `round(valor × cambio, 2)`,
 *    como `emitir_comprobante` y el papel de la cotización en soles.
 *  · Los totales: los guardados en `pen`, no recalculados.
 *  · Las cuotas: repartidas en proporción sobre el total en soles; el redondeo
 *    lo absorbe la última, para que sumen exacto (SUNAT lo valida).
 *  · Lo pagado y el saldo: al mismo cambio; pagada entera, saldo 0.
 *
 * En dólares lo devuelve tal cual. Y es idempotente: lo ya convertido sale
 * igual, así que el papel puede convertir aunque la ficha ya lo hiciera.
 */
export function enMonedaDelDocumento(c: ComprobanteDetalle): ComprobanteDetalle {
  if (c.moneda !== "PEN" || !c.pen || !c.tipo_cambio) return c;
  const tc = c.tipo_cambio;
  const pen = c.pen;

  const lineas = c.lineas.map((l) => {
    const valor = redondear2(l.valor_unitario * tc);
    return { ...l, valor_unitario: valor, importe: importeConDescuento(l.cantidad, valor, l.descuento_pct) };
  });

  const totalUsd = c.cuotas.reduce((a, q) => a + q.monto, 0);
  let acumulado = 0;
  const cuotas = c.cuotas.map((q, i) => {
    const monto =
      i === c.cuotas.length - 1
        ? redondear2(pen.total - acumulado)
        : redondear2(totalUsd > 0 ? (q.monto * pen.total) / totalUsd : 0);
    acumulado = redondear2(acumulado + monto);
    return { ...q, monto, pagado: redondear2(q.pagado * tc) };
  });

  const saldo = c.saldo <= 0 ? 0 : Math.min(pen.total, redondear2(c.saldo * tc));

  return {
    ...c,
    // Ya convertido: `pen` a null hace que una segunda llamada lo deje igual.
    pen: null,
    lineas,
    cuotas,
    op_gravada: pen.gravada,
    descuento_global: pen.descuento,
    igv: pen.igv,
    total: pen.total,
    retencion_monto: pen.retencion,
    // Exonerada e inafecta: este ERP solo emite gravado (tipo 10).
    op_exonerada: redondear2(c.op_exonerada * tc),
    op_inafecta: redondear2(c.op_inafecta * tc),
    saldo,
    pagado: redondear2(pen.total - saldo),
  };
}

/** «$» o «S/», para lo que se escribe a mano delante de un importe. */
export function simboloDe(moneda: string): string {
  return moneda === "PEN" ? "S/" : "$";
}

/** «dólares americanos» o «soles», para la línea del pie. */
export function nombreMoneda(moneda: string): string {
  return moneda === "PEN" ? "soles" : "dólares americanos";
}
