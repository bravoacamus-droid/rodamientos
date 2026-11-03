import "server-only";

import { ETIQUETA_RETENCION } from "../dominio/cobro";
import { ETIQUETA_SITUACION, resumirSituacion, situacionDe } from "../dominio/situacion";
import { saldoEnMoneda, type DocumentoPorCobrar } from "../dominio/tipos";
import { documentosPagados } from "./consultas";

/**
 * El estado de TODAS las facturas, en Excel (03/11).
 *
 * Willy: *«faltan los reportes en Excel del estado total de facturas para
 * poder manejarlo así; luego del Excel filtro lo que requiera»*. Por eso va
 * todo —pagadas, vencidas y por vencer— en una sola hoja con filtros en la
 * cabecera, y no un reporte ya filtrado: el filtro lo pone él.
 *
 * Sale de la misma consulta que «Mostrar: Todas» en la pantalla
 * (`documentosPagados`), con la misma regla de vencida (`situacion.ts`): el
 * Excel y la lista no pueden contar distinto.
 *
 * Dos hojas: **Facturas**, una fila por factura con lo vencido en rojo, y
 * **Por cliente**, cuánto pagó, cuánto tiene vencido y cuánto por vencer cada
 * uno, que es lo primero que se arma a mano con la primera.
 */

const AZUL = "FF0E4C73";
const ROJO = "FFB42318";
const NUMERO = "#,##0.00;[Red]-#,##0.00";
const DOLARES = '"$ "#,##0.00;[Red]-"$ "#,##0.00';

const fechaExcel = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : null);

export async function libroCobranzas(filtro: { cliente?: string }, hoy: string): Promise<Buffer> {
  const r = await documentosPagados({ cliente: filtro.cliente }, "todas");
  if (!r.ok) throw new Error(r.error);
  // Por número, de la más antigua a la última: es como la lleva Willy.
  const facturas = [...r.datos].sort((a, b) => a.numero.localeCompare(b.numero));

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();

  const cabecera = (h: import("exceljs").Worksheet) => {
    const fila = h.getRow(1);
    fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
    fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    fila.alignment = { vertical: "middle", wrapText: true };
    fila.height = 32;
  };

  // ---------------------------------------------------------------- Facturas --
  const h = wb.addWorksheet("Facturas", { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = [
    { header: "Factura", width: 16 },
    { header: "Emisión", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Vencimiento", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Situación", width: 14 },
    { header: "Días de atraso", width: 9 },
    { header: "Cliente", width: 40 },
    { header: "RUC / DNI", width: 14 },
    { header: "Orden de compra", width: 16 },
    { header: "Condición", width: 10 },
    { header: "Moneda", width: 8 },
    { header: "Total (en su moneda)", width: 14, style: { numFmt: NUMERO } },
    { header: "Pagado (en su moneda)", width: 14, style: { numFmt: NUMERO } },
    { header: "Saldo (en su moneda)", width: 14, style: { numFmt: NUMERO } },
    { header: "Total en dólares", width: 14, style: { numFmt: DOLARES } },
    { header: "Saldo en dólares", width: 14, style: { numFmt: DOLARES } },
    { header: "Retención", width: 22 },
    { header: "Vendedor", width: 18 },
  ];
  cabecera(h);

  for (const d of facturas) {
    const s = situacionDe(d, hoy);
    const totalDoc = d.pen_total ?? d.total;
    const saldoDoc = saldoEnMoneda(d);
    const fila = h.addRow([
      d.numero,
      fechaExcel(d.fecha_emision),
      fechaExcel(d.fecha_vencimiento),
      ETIQUETA_SITUACION[s],
      s === "vencida" ? d.dias_vencido : null,
      d.cliente,
      d.documento ?? "",
      d.orden_compra_cliente ?? "",
      d.condicion_pago === "credito" ? "Crédito" : "Contado",
      d.moneda === "PEN" ? "S/" : "US$",
      totalDoc,
      Math.round((totalDoc - saldoDoc) * 100) / 100,
      saldoDoc,
      d.total,
      d.saldo,
      ETIQUETA_RETENCION[d.estado_retencion],
      d.vendedor ?? "",
    ]);
    // Lo vencido en rojo, como en la pantalla (Willy, 03/11).
    if (s === "vencida") fila.font = { color: { argb: ROJO }, bold: true };
  }
  if (h.rowCount > 1) {
    h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.columnCount } };
    const n = h.rowCount;
    const total = h.addRow([]);
    total.getCell(1).value = "TOTAL";
    for (const c of [14, 15]) {
      const letra = h.getColumn(c).letter;
      // SUBTOTAL(9, …) y no SUM: al filtrar en Excel, suma solo lo que se ve.
      total.getCell(c).value = { formula: `SUBTOTAL(9,${letra}2:${letra}${n})` };
    }
    total.font = { bold: true };
  }

  // ------------------------------------------------------------- Por cliente --
  const pc = wb.addWorksheet("Por cliente", { views: [{ state: "frozen", ySplit: 1 }] });
  pc.columns = [
    { header: "Cliente", width: 40 },
    { header: "RUC / DNI", width: 14 },
    { header: "Facturas", width: 9 },
    { header: "Pagadas", width: 9 },
    { header: "Pagado US$", width: 14, style: { numFmt: DOLARES } },
    { header: "Vencidas", width: 9 },
    { header: "Vencido US$", width: 14, style: { numFmt: DOLARES } },
    { header: "Por vencer", width: 9 },
    { header: "Por vencer US$", width: 14, style: { numFmt: DOLARES } },
    { header: "Debe en total US$", width: 15, style: { numFmt: DOLARES } },
  ];
  cabecera(pc);

  const porCliente = new Map<string, DocumentoPorCobrar[]>();
  for (const d of facturas) porCliente.set(d.cliente_id, [...(porCliente.get(d.cliente_id) ?? []), d]);
  const filas = [...porCliente.values()].map((docs) => {
    const s = resumirSituacion(docs, hoy);
    const porVencer = { facturas: s.por_vencer.facturas + s.sin_vencimiento.facturas, monto: s.por_vencer.monto + s.sin_vencimiento.monto };
    return { d: docs[0]!, s, porVencer, debe: Math.round((s.vencida.monto + porVencer.monto) * 100) / 100 };
  });
  // Quien más debe, arriba; luego por nombre.
  filas.sort((a, b) => b.debe - a.debe || a.d.cliente.localeCompare(b.d.cliente));
  for (const { d, s, porVencer, debe } of filas) {
    const fila = pc.addRow([
      d.cliente,
      d.documento ?? "",
      s.todas.facturas,
      s.pagada.facturas,
      s.pagada.monto,
      s.vencida.facturas,
      s.vencida.monto,
      porVencer.facturas,
      Math.round(porVencer.monto * 100) / 100,
      debe,
    ]);
    if (s.vencida.facturas > 0) fila.getCell(7).font = { color: { argb: ROJO }, bold: true };
  }
  if (pc.rowCount > 1) pc.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: pc.columnCount } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

