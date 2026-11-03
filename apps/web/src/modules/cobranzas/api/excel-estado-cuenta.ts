import "server-only";

import { resumirCuenta, plazoEnPapel, PERIODOS_CUENTA, type PeriodoCuenta } from "../dominio/estado-cuenta";
import { ETIQUETA_MEDIO } from "../dominio/tipos";
import type { DocumentoCuenta, EstadoDeCuenta } from "./estado-cuenta";

/**
 * El estado de cuenta en Excel (03/11).
 *
 * Luis: *«¿por qué los estados de cuenta me traes en PDF? todo feo,
 * desordenado; debe ser Excel para ver lo que deben, fechas, todo eso»*. El
 * papel se queda para mandárselo al cliente; para trabajar, esto.
 *
 * Hojas:
 *   · **Resumen** (con más de un cliente): quién debe cuánto, cuánto vencido,
 *     cuánto por vencer y desde cuándo. Quien más debe, arriba.
 *   · **Todas las facturas**: una fila por factura de todos los elegidos, con
 *     filtros en la cabecera y TOTAL que suma solo lo filtrado.
 *   · **Una hoja por cliente**, armada para leerse y para mandarse: los datos
 *     del cliente, cuatro cifras grandes (pendiente, vencido, por vencer,
 *     pagado), la tabla —lo que se debe arriba, de lo que vence antes a lo que
 *     vence después; lo pagado debajo—, lo vencido en rojo, lo pagado en verde,
 *     y los pagos recibidos al pie.
 *
 * Las cifras sumadas van en dólares, que es en lo que suma la base; cada
 * factura lleva además su moneda y sus importes en ella (116).
 */

const AZUL = "FF0E4C73";
const AZUL_CLARO = "FFE8F1F8";
const ROJO = "FFB42318";
const ROJO_CLARO = "FFFDECEC";
const VERDE = "FF067647";
const GRIS = "FF667085";
const NUMERO = "#,##0.00;[Red]-#,##0.00";
const DOLARES = '"$ "#,##0.00;[Red]-"$ "#,##0.00';

type Hoja = import("exceljs").Worksheet;
type Fila = import("exceljs").Row;

const fecha = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : null);
const dinero = (n: number) => Math.round(n * 100) / 100;

function situacion(d: DocumentoCuenta): "Pagada" | "Vencida" | "Por vencer" | "Al contado" {
  if (!(d.saldo > 0)) return "Pagada";
  if (!d.fecha_vencimiento) return "Al contado";
  return d.dias_vencido > 0 ? "Vencida" : "Por vencer";
}

/** El nombre de una hoja: 31 letras como mucho, sin los signos que Excel no deja, y sin repetirse. */
function nombreDeHoja(nombre: string, usados: Set<string>): string {
  const base = nombre.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Cliente";
  let n = base;
  for (let i = 2; usados.has(n.toLowerCase()); i++) n = `${base.slice(0, 25)} (${i})`;
  usados.add(n.toLowerCase());
  return n;
}

function cabeceraTabla(f: Fila) {
  f.font = { bold: true, color: { argb: "FFFFFFFF" } };
  f.alignment = { vertical: "middle", wrapText: true };
  f.height = 30;
  f.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  });
}

/** Una fila de factura pintada según su situación, en cualquiera de las hojas. */
function pintar(f: Fila, s: ReturnType<typeof situacion>, columnas: number) {
  for (let i = 1; i <= columnas; i++) {
    const c = f.getCell(i);
    if (s === "Vencida") {
      c.font = { bold: true, color: { argb: ROJO } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROJO_CLARO } };
    } else if (s === "Pagada") {
      c.font = { color: { argb: GRIS } };
    }
  }
}

function anchos(h: Hoja, w: number[]) {
  w.forEach((x, i) => (h.getColumn(i + 1).width = x));
}

export async function libroEstadoCuenta(
  hojas: readonly EstadoDeCuenta[],
  hoy: string,
  periodo: PeriodoCuenta,
  empresa: string,
): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();
  const usados = new Set<string>(["resumen", "todas las facturas"]);
  const corte = fecha(hoy);

  const resumenes = hojas.map((h) => ({ h, r: resumirCuenta(h.documentos) }));

  // -------------------------------------------------------------- Resumen --
  if (hojas.length > 1) {
    const h = wb.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 4 }] });
    h.getCell("A1").value = `ESTADO DE CUENTA DE CLIENTES · ${empresa}`;
    h.getCell("A1").font = { bold: true, size: 15, color: { argb: AZUL } };
    h.getCell("A2").value = `Al ${hoy.split("-").reverse().join("/")} · ${PERIODOS_CUENTA[periodo]}`;
    h.getCell("A2").font = { color: { argb: GRIS } };
    const cab = h.getRow(4);
    cab.values = ["Cliente", "RUC / DNI", "Pendientes", "Vencidas", "Vencido US$", "Por vencer US$", "Total pendiente US$", "Días de la más atrasada", "Pagado US$"];
    cabeceraTabla(cab);
    const orden = [...resumenes].sort((a, b) => b.r.total - a.r.total || a.h.cliente.razonSocial.localeCompare(b.h.cliente.razonSocial));
    for (const { h: e, r } of orden) {
      const f = h.addRow([e.cliente.razonSocial, e.cliente.documento ?? "", r.documentos, r.documentosVencidos, r.vencido, r.porVencer, r.total, r.mayorAtraso || null, r.pagado]);
      if (r.vencido > 0) {
        f.getCell(5).font = { bold: true, color: { argb: ROJO } };
        f.getCell(8).font = { bold: true, color: { argb: ROJO } };
      }
      f.getCell(7).font = { bold: true };
    }
    const n = h.rowCount;
    const t = h.addRow(["TOTAL"]);
    for (const c of [3, 4, 5, 6, 7, 9]) {
      const l = h.getColumn(c).letter;
      t.getCell(c).value = { formula: `SUBTOTAL(9,${l}5:${l}${n})` };
    }
    t.font = { bold: true };
    t.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_CLARO } }));
    for (const c of [5, 6, 7, 9]) h.getColumn(c).numFmt = DOLARES;
    anchos(h, [42, 14, 11, 10, 15, 15, 17, 13, 15]);
    h.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 9 } };
  }

  // ---------------------------------------------------- Todas las facturas --
  if (hojas.length > 1) {
    const h = wb.addWorksheet("Todas las facturas", { views: [{ state: "frozen", ySplit: 1 }] });
    const cab = h.getRow(1);
    cab.values = ["Cliente", "RUC / DNI", "Factura", "Orden de compra", "Emisión", "Vencimiento", "Situación", "Días de atraso", "Vence en (días)", "Moneda", "Total", "Pagado", "Saldo", "Saldo US$"];
    cabeceraTabla(cab);
    for (const { h: e } of resumenes) {
      for (const d of e.documentos) {
        const s = situacion(d);
        const f = h.addRow([
          e.cliente.razonSocial,
          e.cliente.documento ?? "",
          d.numero,
          d.orden_compra_cliente ?? "",
          fecha(d.fecha_emision),
          fecha(d.fecha_vencimiento),
          s,
          s === "Vencida" ? d.dias_vencido : null,
          s === "Por vencer" ? -d.dias_vencido : null,
          d.moneda === "PEN" ? "S/" : "US$",
          d.total_doc,
          d.pagado_doc,
          d.saldo_doc,
          dinero(d.saldo),
        ]);
        pintar(f, s, 14);
      }
    }
    const n = h.rowCount;
    if (n > 1) {
      const t = h.addRow(["TOTAL"]);
      t.getCell(14).value = { formula: `SUBTOTAL(9,N2:N${n})` };
      t.font = { bold: true };
      h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 14 } };
    }
    for (const c of [5, 6]) h.getColumn(c).numFmt = "dd/mm/yyyy";
    for (const c of [11, 12, 13]) h.getColumn(c).numFmt = NUMERO;
    h.getColumn(14).numFmt = DOLARES;
    anchos(h, [40, 14, 16, 16, 12, 12, 12, 9, 9, 8, 13, 13, 13, 14]);
  }

  // -------------------------------------------------- Una hoja por cliente --
  for (const { h: e, r } of resumenes) {
    const h = wb.addWorksheet(nombreDeHoja(e.cliente.razonSocial, usados), {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    anchos(h, [17, 17, 12, 12, 20, 9, 13, 13, 13, 14]);

    h.mergeCells("A1:J1");
    h.getCell("A1").value = "ESTADO DE CUENTA";
    h.getCell("A1").font = { bold: true, size: 16, color: { argb: AZUL } };
    h.mergeCells("A2:J2");
    h.getCell("A2").value = empresa;
    h.getCell("A2").font = { color: { argb: GRIS } };

    const dato = (fila: number, etiqueta: string, valor: string | Date | null, ancho = false) => {
      h.getCell(`A${fila}`).value = etiqueta;
      h.getCell(`A${fila}`).font = { bold: true, color: { argb: AZUL } };
      if (ancho) h.mergeCells(`B${fila}:J${fila}`);
      else h.mergeCells(`B${fila}:E${fila}`);
      h.getCell(`B${fila}`).value = valor;
    };
    dato(4, "Cliente", e.cliente.razonSocial, true);
    dato(5, "RUC / DNI", e.cliente.documento ?? "—");
    dato(6, "Dirección", e.cliente.direccion ?? "—", true);
    dato(7, "Fecha de corte", corte);
    h.getCell("B7").numFmt = "dd/mm/yyyy";
    h.getCell("B7").alignment = { horizontal: "left" };
    dato(8, "Qué facturas salen", PERIODOS_CUENTA[periodo], true);

    // Cuatro cifras grandes, una al lado de otra.
    const cifras: [string, number, string][] = [
      ["TOTAL PENDIENTE", r.total, AZUL],
      ["VENCIDO", r.vencido, r.vencido > 0 ? ROJO : GRIS],
      ["POR VENCER", r.porVencer, AZUL],
      ["PAGADO", r.pagado, VERDE],
    ];
    cifras.forEach(([t, v, color], i) => {
      const col = 1 + i * 2;
      h.mergeCells(10, col, 10, col + 1);
      h.mergeCells(11, col, 11, col + 1);
      const a = h.getCell(10, col);
      const b = h.getCell(11, col);
      a.value = t;
      a.font = { bold: true, size: 10, color: { argb: GRIS } };
      b.value = v;
      b.numFmt = DOLARES;
      b.font = { bold: true, size: 16, color: { argb: color } };
      for (const c of [a, b]) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_CLARO } };
        c.alignment = { horizontal: "center", vertical: "middle" };
      }
    });
    h.getRow(11).height = 26;
    h.mergeCells("A12:J12");
    h.getCell("A12").value =
      r.documentosVencidos > 0
        ? `${r.documentos} pendientes, ${r.documentosVencidos} vencidas · la más atrasada, ${r.mayorAtraso} ${r.mayorAtraso === 1 ? "día" : "días"}`
        : r.documentos > 0
          ? `${r.documentos} pendientes, ninguna vencida`
          : "No debe nada";
    h.getCell("A12").font = { italic: true, color: { argb: r.documentosVencidos > 0 ? ROJO : GRIS } };

    const inicio = 14;
    const cab = h.getRow(inicio);
    cab.values = ["Factura", "Orden de compra", "Emisión", "Vencimiento", "Situación", "Moneda", "Total", "Pagado", "Saldo", "Saldo US$"];
    cabeceraTabla(cab);
    h.views = [{ state: "frozen", ySplit: inicio }];

    for (const d of e.documentos) {
      const s = situacion(d);
      const f = h.addRow([
        d.numero,
        d.orden_compra_cliente ?? "",
        fecha(d.fecha_emision),
        fecha(d.fecha_vencimiento),
        s === "Pagada" ? "Pagada" : plazoEnPapel(d.dias_vencido, d.fecha_vencimiento),
        d.moneda === "PEN" ? "S/" : "US$",
        d.total_doc,
        d.pagado_doc,
        s === "Pagada" ? null : d.saldo_doc,
        s === "Pagada" ? null : dinero(d.saldo),
      ]);
      // El formato, celda por celda y no por columna: la columna C también
      // tiene arriba la cifra «VENCIDO», y salía como fecha (03/11).
      for (const c of [3, 4]) f.getCell(c).numFmt = "dd/mm/yyyy";
      for (const c of [7, 8, 9]) f.getCell(c).numFmt = NUMERO;
      f.getCell(10).numFmt = DOLARES;
      pintar(f, s, 10);
      if (s === "Pagada") f.getCell(5).font = { bold: true, color: { argb: VERDE } };
    }
    const fin = h.rowCount;
    if (e.documentos.length === 0) {
      h.addRow(["No tiene facturas en lo elegido."]).font = { italic: true, color: { argb: GRIS } };
    } else {
      const t = h.addRow(["TOTAL PENDIENTE"]);
      t.getCell(10).value = { formula: `SUM(J${inicio + 1}:J${fin})` };
      t.getCell(10).numFmt = DOLARES;
      t.font = { bold: true };
      t.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_CLARO } }));
      h.autoFilter = { from: { row: inicio, column: 1 }, to: { row: inicio, column: 10 } };
    }

    if (e.documentos.some((d) => d.moneda === "PEN")) {
      h.addRow([]);
      h.addRow(["Las cifras en US$ suman las facturas en soles a su tipo de cambio."]).font = { italic: true, color: { argb: GRIS } };
    }

    if (e.pagos.length > 0) {
      h.addRow([]);
      const titulo = h.addRow(["PAGOS RECIBIDOS"]);
      titulo.font = { bold: true, color: { argb: AZUL } };
      const pc = h.addRow(["Fecha", "Factura", "Medio", "Operación", "", "", "Monto US$"]);
      cabeceraTabla(pc);
      for (const p of e.pagos) {
        const f = h.addRow([fecha(p.fecha), p.numero, ETIQUETA_MEDIO[p.medio] ?? p.medio, p.referencia ?? "", "", "", p.monto]);
        f.getCell(1).numFmt = "dd/mm/yyyy";
        f.getCell(7).numFmt = DOLARES;
      }
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
