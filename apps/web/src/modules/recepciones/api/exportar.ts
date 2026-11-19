import "server-only";

import { armarListadoPdf } from "@/lib/pdf-listado";

import { describirFiltrosRecepciones } from "../dominio/filtros";
import type { FiltrosRecepciones, RecepcionLista } from "../dominio/tipos";
import {
  lineasDeRecepciones,
  nombresDeFiltrosRecepciones,
  recepcionesParaExportar,
  TOPE_RECEPCIONES,
} from "./consultas";

/**
 * Las recepciones en Excel y en PDF, con los filtros de la lista (19/11).
 *
 * Luis: *«en recepciones también faltan buenos filtros… igual que en el
 * inventario»*, que el mismo día había pedido bajar en Excel y PDF. De la
 * más antigua a la más reciente, como un libro. El Excel lleva además una
 * hoja «Detalle» con cada producto recibido, que es la que responde «¿a
 * cuánto me lo vendieron la última vez?».
 */

const EMPRESA = "Inversiones Rodatech E.I.R.L.";
const fechaPeru = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};
const dinero = (n: number, moneda: "USD" | "PEN") =>
  `${moneda === "PEN" ? "S/" : "$"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lo que suman las recepciones VIGENTES, por moneda: no se mezclan soles y dólares. */
export function totalesRecepciones(filas: readonly RecepcionLista[]) {
  const vigentes = filas.filter((f) => !f.anulada);
  const suma = (m: "USD" | "PEN") =>
    Math.round(vigentes.filter((f) => f.moneda === m).reduce((a, f) => a + f.valorizado, 0) * 100) / 100;
  return {
    recepciones: filas.length,
    anuladas: filas.length - vigentes.length,
    lineas: vigentes.reduce((a, f) => a + f.items, 0),
    usd: suma("USD"),
    pen: suma("PEN"),
  };
}

async function reunir(filtros: FiltrosRecepciones) {
  const [lista, nombres] = await Promise.all([recepcionesParaExportar(filtros), nombresDeFiltrosRecepciones(filtros)]);
  if (!lista.ok) throw new Error(lista.error);
  const quien = [nombres.proveedor, nombres.familia, nombres.marca]
    .filter(Boolean)
    .join(" ")
    .replace(/[^\p{L}\p{N} .-]/gu, "")
    .slice(0, 50);
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  return {
    ...lista.datos,
    descripcion: describirFiltrosRecepciones(filtros, nombres),
    archivo: (ext: string) => `Recepciones${quien ? ` ${quien}` : ""} ${hoy}.${ext}`,
  };
}

const NOTA_TOPE = `Se cortó en ${TOPE_RECEPCIONES.toLocaleString("es-PE")} recepciones. Filtra por fechas para bajar el resto.`;

export async function excelRecepciones(filtros: FiltrosRecepciones): Promise<{ libro: Buffer; archivo: string }> {
  const d = await reunir(filtros);
  const lineas = await lineasDeRecepciones(d.filas.map((f) => f.id));
  if (!lineas.ok) throw new Error(lineas.error);
  const t = totalesRecepciones(d.filas);

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();
  const AZUL = "FF0E4C73";
  const GRIS = "FF66717F";
  const BLANCO = "FFFFFFFF";
  const NUM = "#,##0.00";
  const CANT = "#,##0.##";

  const cabecera = (hoja: import("exceljs").Worksheet, fila: number, titulos: string[]) => {
    const r = hoja.getRow(fila);
    titulos.forEach((tt, i) => {
      const c = r.getCell(i + 1);
      c.value = tt;
      c.font = { bold: true, color: { argb: BLANCO } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      c.alignment = { vertical: "middle", wrapText: true };
    });
    r.height = 30;
  };

  // ------------------------------------------------------- Recepciones --
  const FILA = 5;
  const hoja = wb.addWorksheet("Recepciones", {
    views: [{ state: "frozen", ySplit: FILA, xSplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  hoja.columns = [12, 11, 34, 13, 18, 18, 8, 9, 14, 18, 10].map((width) => ({ width }));
  hoja.getCell("A1").value = `Recepciones · ${EMPRESA}`;
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: AZUL } };
  hoja.getCell("A2").value = d.descripcion;
  hoja.getCell("A2").font = { size: 12, color: { argb: GRIS } };
  hoja.getCell("A3").value =
    `${t.recepciones} recepciones${t.anuladas ? ` (${t.anuladas} anuladas, no suman)` : ""} · ${t.lineas} líneas · ` +
    `${dinero(t.usd, "USD")} en dólares · ${dinero(t.pen, "PEN")} en soles · sin IGV`;
  hoja.getCell("A3").font = { bold: true };
  cabecera(hoja, FILA, [
    "Número", "Fecha", "Proveedor", "Orden de compra", "Guía del proveedor", "Factura del proveedor",
    "Moneda", "Líneas", "Valor sin IGV", "Recibido por", "Estado",
  ]);
  d.filas.forEach((f, i) => {
    const r = hoja.getRow(FILA + 1 + i);
    r.values = [
      f.numero, fechaPeru(f.fecha), f.proveedor ?? "", f.compra_numero ?? "", f.guia_proveedor ?? "",
      f.factura_proveedor ?? "", f.moneda, f.items, f.valorizado, f.recibido_por ?? "", f.anulada ? "Anulada" : "Vigente",
    ];
    r.getCell(9).numFmt = NUM;
    if (f.anulada) r.font = { italic: true, color: { argb: GRIS } };
  });
  if (d.filas.length > 0) {
    hoja.autoFilter = { from: { row: FILA, column: 1 }, to: { row: FILA + d.filas.length, column: 11 } };
  } else {
    hoja.getCell(`A${FILA + 1}`).value = "Ninguna recepción con estos filtros.";
  }
  if (d.truncado) hoja.getCell(`A${FILA + d.filas.length + 2}`).value = NOTA_TOPE;

  // ------------------------------------------------------------ Detalle --
  const porId = new Map(d.filas.map((f) => [f.id, f]));
  const det = wb.addWorksheet("Detalle por producto", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  det.columns = [12, 11, 30, 18, 40, 14, 16, 18, 8, 10, 8, 13, 14, 10].map((width) => ({ width }));
  cabecera(det, 1, [
    "Recepción", "Fecha", "Proveedor", "Código", "Descripción", "Marca", "Familia", "Subfamilia",
    "Unidad", "Cantidad", "Moneda", "Costo unitario", "Importe", "Estado",
  ]);
  const ordenadas = [...lineas.datos].sort((a, b) => {
    const ra = porId.get(a.recepcion_id);
    const rb = porId.get(b.recepcion_id);
    return (ra?.fecha ?? "").localeCompare(rb?.fecha ?? "") || (ra?.numero ?? "").localeCompare(rb?.numero ?? "");
  });
  ordenadas.forEach((l, i) => {
    const rec = porId.get(l.recepcion_id);
    const n = i + 2;
    const r = det.getRow(n);
    r.values = [
      rec?.numero ?? "", rec ? fechaPeru(rec.fecha) : "", rec?.proveedor ?? "", l.codigo, l.descripcion, l.marca,
      l.familia, l.subfamilia, l.unidad, l.cantidad, rec?.moneda ?? "", l.costo_unitario,
    ];
    r.getCell(13).value = { formula: `J${n}*L${n}` };
    r.getCell(14).value = rec?.anulada ? "Anulada" : "Vigente";
    r.getCell(10).numFmt = CANT;
    r.getCell(12).numFmt = "#,##0.0000";
    r.getCell(13).numFmt = NUM;
  });
  if (ordenadas.length > 0) {
    det.autoFilter = { from: { row: 1, column: 1 }, to: { row: ordenadas.length + 1, column: 14 } };
  }

  const datos = await wb.xlsx.writeBuffer();
  return { libro: Buffer.from(datos as ArrayBuffer), archivo: d.archivo("xlsx") };
}

export async function pdfRecepciones(filtros: FiltrosRecepciones): Promise<{ pdf: ArrayBuffer; archivo: string }> {
  const d = await reunir(filtros);
  const t = totalesRecepciones(d.filas);
  const doc = await armarListadoPdf({
    titulo: "Recepciones",
    empresa: EMPRESA,
    subtitulo: `${d.descripcion} · valores sin IGV`,
    resumen: [
      { etiqueta: "Recepciones", valor: `${t.recepciones}${t.anuladas ? ` (${t.anuladas} anuladas)` : ""}` },
      { etiqueta: "Líneas", valor: String(t.lineas) },
      { etiqueta: "En dólares", valor: dinero(t.usd, "USD") },
      { etiqueta: "En soles", valor: dinero(t.pen, "PEN") },
    ],
    columnas: [
      { titulo: "Número", ancho: 26 },
      { titulo: "Fecha", ancho: 20 },
      { titulo: "Proveedor" },
      { titulo: "Orden", ancho: 24 },
      { titulo: "Guía prov.", ancho: 28 },
      { titulo: "Factura prov.", ancho: 28 },
      { titulo: "Líneas", ancho: 14, derecha: true },
      { titulo: "Valor", ancho: 28, derecha: true },
      { titulo: "Recibido por", ancho: 30 },
    ],
    filas: d.filas.map((f) => [
      f.anulada ? `${f.numero} (anulada)` : f.numero,
      fechaPeru(f.fecha),
      f.proveedor ?? "",
      f.compra_numero ?? "",
      f.guia_proveedor ?? "",
      f.factura_proveedor ?? "",
      String(f.items),
      dinero(f.valorizado, f.moneda),
      f.recibido_por ?? "",
    ]),
    nota: d.filas.length === 0 ? "Ninguna recepción con estos filtros." : d.truncado ? NOTA_TOPE : undefined,
  });
  return { pdf: doc.output("arraybuffer"), archivo: d.archivo("pdf") };
}
