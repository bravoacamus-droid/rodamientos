import "server-only";

import { armarListadoPdf } from "@/lib/pdf-listado";

import { describirFiltros, etiquetaOrigen } from "../dominio/filtros-kardex";
import { ETIQUETA_MOVIMIENTO, type FilaKardex, type FiltrosKardex, type ResumenKardex } from "../dominio/tipos";
import { kardexParaExportar, nombresDeFiltrosKardex, resumenKardex, TOPE_EXPORTAR } from "./consultas";

/**
 * El kardex en Excel y en PDF, con los filtros de la pantalla (19/11).
 *
 * Luis: *«que lo que me traiga, o también dinámico con los filtros, pueda
 * exportarlo por Excel y PDF»*. Se lee en el MISMO orden que un libro: del
 * movimiento más antiguo al más reciente, con el saldo corriendo hacia
 * abajo. La pantalla va al revés (lo último arriba) porque ahí se busca lo
 * que acaba de pasar.
 */

const EMPRESA = "Inversiones Rodatech E.I.R.L.";

const fechaLima = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
const horaLima = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

// Null en las filas del sistema anterior (203): sin saldo, y la venta sin
// costo. Una celda vacía, no un 0 que no es.
const cant = (n: number | null) =>
  n === null ? "" : Number(n).toLocaleString("es-PE", { maximumFractionDigits: 2 });
const usd = (n: number | null) =>
  n === null ? "" : `$ ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numOVacio = (n: number | null) => (n === null ? "" : Number(n));
/** El precio como lo dice el papel, en su moneda. */
const precioPapel = (f: FilaKardex) =>
  f.precio_unitario === null
    ? ""
    : `${f.moneda === "PEN" ? "S/" : "$"} ${Number(f.precio_unitario).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Datos {
  filas: FilaKardex[];
  truncado: boolean;
  resumen: ResumenKardex | null;
  descripcion: string;
  /** Para el nombre del archivo: el código del producto, la familia… */
  quien: string;
}

async function reunir(filtros: FiltrosKardex): Promise<Datos> {
  const [lista, resumen, nombres] = await Promise.all([
    kardexParaExportar(filtros),
    resumenKardex(filtros),
    nombresDeFiltrosKardex(filtros),
  ]);
  if (!lista.ok) throw new Error(lista.error);
  const quien = [nombres.producto?.split(" ")[0], nombres.familia, nombres.subfamilia, nombres.marca]
    .filter(Boolean)
    .join(" ")
    .replace(/[^\p{L}\p{N} .-]/gu, "")
    .slice(0, 50);
  return {
    filas: lista.datos.filas,
    truncado: lista.datos.truncado,
    resumen: resumen.ok ? resumen.datos : null,
    descripcion: describirFiltros(filtros, nombres),
    quien,
  };
}

function nombreArchivo(quien: string, ext: "xlsx" | "pdf"): string {
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  return `Kardex${quien ? ` ${quien}` : ""} ${hoy}.${ext}`;
}

/** Los totales en palabras: lo mismo en la franja del PDF y arriba del Excel. */
function lineasResumen(r: ResumenKardex | null): { etiqueta: string; valor: string }[] {
  if (!r) return [];
  const partes = [
    { etiqueta: "Movimientos", valor: cant(r.movimientos) },
    { etiqueta: "Productos", valor: cant(r.productos) },
  ];
  if (r.saldoInicial !== null) partes.push({ etiqueta: "Saldo inicial", valor: cant(r.saldoInicial) });
  partes.push(
    { etiqueta: "Entradas", valor: `${cant(r.entradas)} · ${usd(r.valorEntradas)}` },
    { etiqueta: "Salidas", valor: `${cant(r.salidas)} · ${usd(r.valorSalidas)}` },
  );
  if (r.saldoFinal !== null) partes.push({ etiqueta: "Saldo final", valor: cant(r.saldoFinal) });
  if (r.anteriores > 0) {
    partes.push({
      etiqueta: "Sistema anterior",
      valor: `${cant(r.anteriores)} líneas · salió ${cant(r.anterioresSalidas)} · entró ${cant(r.anterioresEntradas)}`,
    });
  }
  return partes;
}

// ------------------------------------------------------------------ Excel --

const DINERO = '"$ "#,##0.00;[Red]-"$ "#,##0.00';
const CANTIDAD = "#,##0.##;[Red]-#,##0.##";
const AZUL = "FF0E4C73";
const AZUL_CLARO = "FFE3EEF6";
const GRIS = "FF66717F";
const BLANCO = "FFFFFFFF";

export async function excelKardex(filtros: FiltrosKardex): Promise<{ libro: Buffer; archivo: string }> {
  const d = await reunir(filtros);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();

  type Col = { titulo: string; ancho: number; valor: (f: FilaKardex) => unknown; formato?: string; suma?: boolean };
  const columnas: Col[] = [
    { titulo: "Fecha", ancho: 11, valor: (f) => fechaLima(f.fecha) },
    { titulo: "Hora", ancho: 7, valor: (f) => horaLima(f.fecha) },
    { titulo: "Código", ancho: 18, valor: (f) => f.codigo },
    { titulo: "Código de fábrica", ancho: 16, valor: (f) => f.codigo_fabricante ?? "" },
    { titulo: "Descripción", ancho: 44, valor: (f) => f.descripcion },
    { titulo: "Marca", ancho: 14, valor: (f) => f.marca ?? "" },
    { titulo: "Familia", ancho: 16, valor: (f) => f.familia ?? "" },
    { titulo: "Subfamilia", ancho: 20, valor: (f) => f.subfamilia ?? "" },
    { titulo: "Unidad", ancho: 8, valor: (f) => f.unidad_codigo ?? "" },
    { titulo: "Movimiento", ancho: 16, valor: (f) => ETIQUETA_MOVIMIENTO[f.tipo] ?? f.tipo },
    { titulo: "Entrada", ancho: 10, valor: (f) => (Number(f.entrada) > 0 ? Number(f.entrada) : ""), formato: CANTIDAD, suma: true },
    { titulo: "Salida", ancho: 10, valor: (f) => (Number(f.salida) > 0 ? Number(f.salida) : ""), formato: CANTIDAD, suma: true },
    { titulo: "Costo unitario", ancho: 13, valor: (f) => numOVacio(f.costo_unitario), formato: DINERO },
    { titulo: "Saldo", ancho: 10, valor: (f) => numOVacio(f.saldo_cantidad), formato: CANTIDAD },
    { titulo: "Costo promedio", ancho: 13, valor: (f) => numOVacio(f.costo_promedio), formato: DINERO },
    { titulo: "Saldo valorizado", ancho: 14, valor: (f) => numOVacio(f.saldo_valorizado), formato: DINERO },
    { titulo: "Origen", ancho: 24, valor: (f) => etiquetaOrigen(f.referencia_tipo) },
    { titulo: "Documento", ancho: 16, valor: (f) => f.referencia_numero ?? "" },
    // 203: a quién y a cuánto.
    { titulo: "Cliente / proveedor", ancho: 32, valor: (f) => f.tercero ?? "" },
    { titulo: "Precio del documento", ancho: 16, valor: (f) => precioPapel(f) },
    { titulo: "Motivo", ancho: 30, valor: (f) => f.motivo ?? "" },
    { titulo: "Usuario", ancho: 18, valor: (f) => f.usuario ?? "" },
  ];

  const resumen = lineasResumen(d.resumen);
  const FILA_TITULOS = resumen.length > 0 ? 6 : 4;
  const hoja = wb.addWorksheet("Kardex", {
    views: [{ state: "frozen", ySplit: FILA_TITULOS, xSplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  hoja.columns = columnas.map((c) => ({ width: c.ancho }));

  hoja.getCell("A1").value = `Kardex · ${EMPRESA}`;
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: AZUL } };
  hoja.getCell("A2").value = `${d.descripcion} · costos en dólares, sin IGV`;
  hoja.getCell("A2").font = { size: 12, color: { argb: GRIS } };
  if (resumen.length > 0) {
    // Los totales en una fila, etiqueta y cifra, como la franja del PDF.
    const fila = hoja.getRow(4);
    resumen.forEach((r, i) => {
      const celda = fila.getCell(1 + i * 3);
      celda.value = `${r.etiqueta}: ${r.valor}`;
      celda.font = { bold: true };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_CLARO } };
    });
  }

  const cabecera = hoja.getRow(FILA_TITULOS);
  columnas.forEach((c, i) => {
    const celda = cabecera.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: BLANCO } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    celda.alignment = { vertical: "middle", wrapText: true };
  });
  cabecera.height = 30;

  d.filas.forEach((f, i) => {
    const fila = hoja.getRow(FILA_TITULOS + 1 + i);
    columnas.forEach((c, j) => {
      const celda = fila.getCell(j + 1);
      celda.value = c.valor(f) as never;
      if (c.formato) celda.numFmt = c.formato;
    });
  });

  const ultima = FILA_TITULOS + d.filas.length;
  if (d.filas.length > 0) {
    hoja.autoFilter = { from: { row: FILA_TITULOS, column: 1 }, to: { row: ultima, column: columnas.length } };
    // SUBTOTAL(109, …): suma solo lo que queda visible con el filtro de Excel.
    const total = hoja.getRow(ultima + 2);
    total.getCell(1).value = "Total de lo filtrado";
    total.getCell(1).font = { bold: true };
    columnas.forEach((c, j) => {
      if (!c.suma) return;
      const letra = hoja.getColumn(j + 1).letter;
      const celda = total.getCell(j + 1);
      celda.value = { formula: `SUBTOTAL(109,${letra}${FILA_TITULOS + 1}:${letra}${ultima})` };
      celda.numFmt = c.formato ?? "";
      celda.font = { bold: true };
      celda.border = { top: { style: "thin" } };
    });
    if (d.truncado) {
      hoja.getCell(`A${ultima + 4}`).value =
        `Se cortó en ${TOPE_EXPORTAR.toLocaleString("es-PE")} movimientos. Filtra por fechas o por familia para bajar el resto.`;
    }
  } else {
    hoja.getCell(`A${FILA_TITULOS + 1}`).value = "Ningún movimiento con estos filtros.";
  }

  const datos = await wb.xlsx.writeBuffer();
  return { libro: Buffer.from(datos as ArrayBuffer), archivo: nombreArchivo(d.quien, "xlsx") };
}

// -------------------------------------------------------------------- PDF --

export async function pdfKardex(filtros: FiltrosKardex): Promise<{ pdf: ArrayBuffer; archivo: string }> {
  const d = await reunir(filtros);
  // Con UN producto, sobran las columnas del producto: se gana sitio para el
  // documento y el motivo, que es lo que se mira en su kardex.
  const unSolo = Boolean(filtros.producto);
  const columnas = unSolo
    ? [
        { titulo: "Fecha", ancho: 24 },
        { titulo: "Movimiento", ancho: 30 },
        { titulo: "Origen", ancho: 32 },
        { titulo: "Documento", ancho: 28 },
        { titulo: "Entrada", ancho: 18, derecha: true },
        { titulo: "Salida", ancho: 18, derecha: true },
        { titulo: "Saldo", ancho: 18, derecha: true },
        { titulo: "Costo unit.", ancho: 22, derecha: true },
        { titulo: "Costo prom.", ancho: 22, derecha: true },
        { titulo: "Cliente / proveedor · precio" },
      ]
    : [
        { titulo: "Fecha", ancho: 24 },
        { titulo: "Código", ancho: 28 },
        { titulo: "Descripción" },
        { titulo: "Movimiento", ancho: 26 },
        { titulo: "Documento", ancho: 46 },
        { titulo: "Entrada", ancho: 16, derecha: true },
        { titulo: "Salida", ancho: 16, derecha: true },
        { titulo: "Saldo", ancho: 16, derecha: true },
        { titulo: "Costo unit.", ancho: 20, derecha: true },
      ];

  const fecha = (f: FilaKardex) => `${fechaLima(f.fecha)} ${horaLima(f.fecha)}`;
  const ent = (f: FilaKardex) => (Number(f.entrada) > 0 ? cant(f.entrada) : "");
  const sal = (f: FilaKardex) => (Number(f.salida) > 0 ? cant(f.salida) : "");
  const doc = (f: FilaKardex) =>
    [f.referencia_numero ?? etiquetaOrigen(f.referencia_tipo), f.tercero, precioPapel(f)].filter(Boolean).join(" · ");
  const filas = d.filas.map((f) =>
    unSolo
      ? [
          fecha(f),
          ETIQUETA_MOVIMIENTO[f.tipo] ?? f.tipo,
          etiquetaOrigen(f.referencia_tipo),
          f.referencia_numero ?? "",
          ent(f),
          sal(f),
          cant(f.saldo_cantidad),
          usd(f.costo_unitario),
          usd(f.costo_promedio),
          [f.tercero, precioPapel(f), f.motivo, f.usuario].filter(Boolean).join(" · "),
        ]
      : [
          fecha(f),
          f.codigo,
          f.descripcion,
          ETIQUETA_MOVIMIENTO[f.tipo] ?? f.tipo,
          doc(f),
          ent(f),
          sal(f),
          cant(f.saldo_cantidad),
          usd(f.costo_unitario),
        ],
  );
  const totEnt = d.filas.reduce((a, f) => a + Number(f.entrada), 0);
  const totSal = d.filas.reduce((a, f) => a + Number(f.salida), 0);
  const pie = unSolo
    ? ["Total", "", "", "", cant(totEnt), cant(totSal), "", "", "", ""]
    : ["Total", "", "", "", "", cant(totEnt), cant(totSal), "", ""];

  const pdf = await armarListadoPdf({
    titulo: "Kardex",
    empresa: EMPRESA,
    subtitulo: `${d.descripcion} · costos en dólares, sin IGV`,
    resumen: lineasResumen(d.resumen),
    columnas,
    filas,
    pie: filas.length > 0 ? pie : undefined,
    nota:
      filas.length === 0
        ? "Ningún movimiento con estos filtros."
        : d.truncado
          ? `Se cortó en ${TOPE_EXPORTAR.toLocaleString("es-PE")} movimientos. Filtra por fechas o por familia para bajar el resto.`
          : undefined,
  });
  return { pdf: pdf.output("arraybuffer"), archivo: nombreArchivo(d.quien, "pdf") };
}

