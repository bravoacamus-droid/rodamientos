import "server-only";

import { armarListadoPdf } from "@/lib/pdf-listado";
import { describirRango, leerRango } from "@/modules/reportes";

import {
  ETIQUETA_COMPARACION,
  ETIQUETA_SEGMENTO,
  ORDEN_SEGMENTOS,
  leerComparacion,
  rangoComparado,
  segmentoDe,
  type Segmento,
} from "../dominio/ejecutivo";
import { datosClientes, datosVentas } from "./ejecutivo";

/**
 * «Ventas por cliente» en Excel y en PDF (26/11). Luis: *«en reporte,
 * dependiendo los filtros, también… tiene que ser siempre dinámico»*. Lee de
 * la URL lo mismo que la pantalla —periodo, comparación y el grupo elegido
 * («Dejaron de comprar», «Nuevos»…)— y baja la tabla ENTERA, no solo los
 * doce primeros que se ven antes de «Ver todos».
 */

const EMPRESA = "Inversiones Rodatech E.I.R.L.";

interface FilaExport {
  id: string;
  cliente: string;
  documento: string;
  segmento: Segmento;
  facturado: number;
  vendido: number;
  pedidos: number;
  margen: number | null;
  antes: number;
  cambio: number | null;
  facturas: number;
  ultima: string;
  diasSinComprar: number;
}

async function reunir(url: URL) {
  const p = (k: string) => url.searchParams.get(k) ?? undefined;
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const r = leerRango(
    { desde: p("desde"), hasta: p("hasta"), grano: p("grano"), atajo: p("atajo") ?? (p("desde") ? undefined : "12_meses") },
    hoy,
  );
  const comparar = leerComparacion(p("comparar"));
  const previo = rangoComparado(r, comparar);
  const hayComparacion = r.atajo !== "todo";
  const grupo = ORDEN_SEGMENTOS.find((s) => s === p("grupo")) ?? null;
  const rango = { desde: r.desde, hasta: r.hasta, grano: r.grano };

  const [res, ventas] = await Promise.all([datosClientes(rango, previo), datosVentas(rango)]);
  if (!res.ok) throw new Error(res.error);
  const vendidoDe = new Map((ventas.ok ? ventas.datos.porCliente : []).map((c) => [c.id, c]));

  const filas: FilaExport[] = res.datos.clientes
    .map((x) => {
      const v = vendidoDe.get(x.id);
      return {
        id: x.id,
        cliente: x.cliente,
        documento: x.documento ?? "",
        segmento: segmentoDe(x, r.desde, r.hasta),
        facturado: x.venta,
        vendido: v?.vendido ?? 0,
        pedidos: v?.ventas ?? 0,
        margen: v?.margen ?? null,
        antes: x.ventaPrev,
        cambio: x.ventaPrev > 0 ? ((x.venta - x.ventaPrev) / x.ventaPrev) * 100 : null,
        facturas: x.documentos,
        ultima: x.ultima,
        diasSinComprar: x.diasSinComprar,
      };
    })
    .filter((x) => !grupo || x.segmento === grupo)
    .sort((a, b) => b.facturado - a.facturado || b.antes - a.antes);

  const descripcion = [
    describirRango(r, hoy),
    hayComparacion ? `comparado con ${ETIQUETA_COMPARACION[comparar].toLowerCase()}` : null,
    grupo ? `solo «${ETIQUETA_SEGMENTO[grupo]}»` : "todos los clientes",
    "en dólares, sin IGV",
  ]
    .filter(Boolean)
    .join(" · ");
  const archivo = (ext: string) =>
    `Ventas por cliente${grupo ? ` ${ETIQUETA_SEGMENTO[grupo]}` : ""} ${r.desde} a ${r.hasta}.${ext}`;
  return { filas, descripcion, hayComparacion, archivo };
}

const fechaPeru = (iso: string) => {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};
const usd = (n: number) => `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cambioTexto = (f: FilaExport) =>
  f.cambio === null
    ? f.segmento === "nuevo"
      ? "nuevo"
      : f.facturado > 0
        ? "volvió"
        : ""
    : `${f.cambio > 0 ? "+" : ""}${f.cambio.toFixed(1)} %`;

export async function excelVentasPorCliente(url: URL): Promise<{ libro: Buffer; archivo: string }> {
  const d = await reunir(url);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();
  const AZUL = "FF0E4C73";
  const GRIS = "FF66717F";
  const DINERO = '"$" #,##0.00';

  const FILA = 5;
  const hoja = wb.addWorksheet("Ventas por cliente", {
    views: [{ state: "frozen", ySplit: FILA, xSplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const columnas: { titulo: string; ancho: number }[] = [
    { titulo: "Cliente", ancho: 40 },
    { titulo: "RUC / DNI", ancho: 14 },
    { titulo: "Grupo", ancho: 20 },
    { titulo: "Facturado", ancho: 15 },
    { titulo: "Vendido (pedidos)", ancho: 16 },
    { titulo: "Pedidos", ancho: 9 },
    { titulo: "Margen", ancho: 10 },
    ...(d.hayComparacion
      ? [
          { titulo: "Antes", ancho: 15 },
          { titulo: "Cambio", ancho: 10 },
        ]
      : []),
    { titulo: "Facturas", ancho: 10 },
    { titulo: "Última compra", ancho: 14 },
    { titulo: "Días sin comprar", ancho: 12 },
  ];
  hoja.columns = columnas.map((c) => ({ width: c.ancho }));
  hoja.getCell("A1").value = `Ventas por cliente · ${EMPRESA}`;
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: AZUL } };
  hoja.getCell("A2").value = d.descripcion;
  hoja.getCell("A2").font = { size: 12, color: { argb: GRIS } };
  hoja.getCell("A3").value =
    `${d.filas.length} ${d.filas.length === 1 ? "cliente" : "clientes"} · facturado ${usd(d.filas.reduce((a, f) => a + f.facturado, 0))}`;
  hoja.getCell("A3").font = { bold: true };
  const cab = hoja.getRow(FILA);
  columnas.forEach((c, i) => {
    const celda = cab.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    celda.alignment = { vertical: "middle", wrapText: true };
  });
  cab.height = 30;

  d.filas.forEach((f, i) => {
    const valores: (string | number)[] = [
      f.cliente,
      f.documento,
      ETIQUETA_SEGMENTO[f.segmento],
      f.facturado,
      f.vendido,
      f.pedidos,
      f.margen === null ? "" : f.margen / 100,
      ...(d.hayComparacion ? [f.antes, f.cambio === null ? cambioTexto(f) : f.cambio / 100] : []),
      f.facturas,
      fechaPeru(f.ultima),
      f.diasSinComprar,
    ];
    const r = hoja.getRow(FILA + 1 + i);
    r.values = valores;
    r.getCell(4).numFmt = DINERO;
    r.getCell(5).numFmt = DINERO;
    r.getCell(7).numFmt = "0.0%";
    if (d.hayComparacion) {
      r.getCell(8).numFmt = DINERO;
      r.getCell(9).numFmt = "+0.0%;-0.0%";
    }
  });
  if (d.filas.length > 0) {
    hoja.autoFilter = { from: { row: FILA, column: 1 }, to: { row: FILA + d.filas.length, column: columnas.length } };
  } else {
    hoja.getCell(`A${FILA + 1}`).value = "Ningún cliente con estos filtros.";
  }

  const datos = await wb.xlsx.writeBuffer();
  return { libro: Buffer.from(datos as ArrayBuffer), archivo: d.archivo("xlsx") };
}

export async function pdfVentasPorCliente(url: URL): Promise<{ pdf: ArrayBuffer; archivo: string }> {
  const d = await reunir(url);
  const facturado = d.filas.reduce((a, f) => a + f.facturado, 0);
  const antes = d.filas.reduce((a, f) => a + f.antes, 0);
  const doc = await armarListadoPdf({
    titulo: "Ventas por cliente",
    empresa: EMPRESA,
    subtitulo: d.descripcion,
    resumen: [
      { etiqueta: "Clientes", valor: String(d.filas.length) },
      { etiqueta: "Compraron en el periodo", valor: String(d.filas.filter((f) => f.facturado > 0).length) },
      { etiqueta: "Facturado", valor: usd(facturado) },
      ...(d.hayComparacion ? [{ etiqueta: "Antes", valor: usd(antes) }] : []),
    ],
    columnas: [
      { titulo: "Cliente" },
      { titulo: "Grupo", ancho: 30 },
      { titulo: "Facturado", ancho: 28, derecha: true },
      { titulo: "Vendido", ancho: 28, derecha: true },
      { titulo: "Margen", ancho: 16, derecha: true },
      ...(d.hayComparacion
        ? [
            { titulo: "Antes", ancho: 28, derecha: true },
            { titulo: "Cambio", ancho: 18, derecha: true },
          ]
        : []),
      { titulo: "Facturas", ancho: 16, derecha: true },
      { titulo: "Última compra", ancho: 22 },
    ],
    filas: d.filas.map((f) => [
      f.cliente,
      ETIQUETA_SEGMENTO[f.segmento],
      usd(f.facturado),
      usd(f.vendido),
      f.margen === null ? "—" : `${f.margen.toFixed(1)} %`,
      ...(d.hayComparacion ? [usd(f.antes), cambioTexto(f)] : []),
      String(f.facturas),
      fechaPeru(f.ultima),
    ]),
    nota: d.filas.length === 0 ? "Ningún cliente con estos filtros." : undefined,
  });
  return { pdf: doc.output("arraybuffer"), archivo: d.archivo("pdf") };
}
