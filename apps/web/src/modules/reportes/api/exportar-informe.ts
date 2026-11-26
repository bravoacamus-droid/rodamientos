import "server-only";

import { armarListadoPdf } from "@/lib/pdf-listado";

import { describirRango, leerRango } from "../dominio/rango";
import {
  agingCartera,
  embudoComercial,
  resumen,
  serieCompras,
  serieVentas,
  topClientesRango,
  topProductosRango,
  valorizacionPorFamilia,
} from "./consultas";

/**
 * El Informe general en Excel y en PDF (26/11). Luis: *«en el módulo reporte
 * no están esos export… dependiendo los filtros… tiene que ser siempre
 * dinámico»*.
 *
 * Lee el periodo de la URL igual que la pantalla. Lo que depende del periodo
 * —ventas y compras por periodo, lo más vendido, quién más compra— sale del
 * rango elegido; lo que en la pantalla es «a hoy» —por cobrar, el almacén, el
 * embudo y los indicadores— sale a hoy también, y lo dice.
 */

const EMPRESA = "Inversiones Rodatech E.I.R.L.";
const TOPE = 200;

const usd = (n: number) => `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cant = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %`;
const fechaPeru = (iso: string | null) => {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

async function reunir(url: URL) {
  const p = (k: string) => url.searchParams.get(k) ?? undefined;
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  // Igual que `PaginaReportes`: sin atajo por defecto.
  const rango = leerRango({ desde: p("desde"), hasta: p("hasta"), grano: p("grano"), atajo: p("atajo") }, hoy);
  const [ventas, compras, productos, clientes, indicadores, aging, almacen, embudo] = await Promise.all([
    serieVentas(rango),
    serieCompras(rango),
    topProductosRango(rango, TOPE),
    topClientesRango(rango, TOPE),
    resumen(hoy),
    agingCartera(),
    valorizacionPorFamilia(),
    embudoComercial(),
  ]);
  const de = <T,>(r: { ok: true; datos: T } | { ok: false; error: string }, vacio: T): T => (r.ok ? r.datos : vacio);
  return {
    hoy,
    rango,
    descripcion: describirRango(rango, hoy),
    ventas: de(ventas, []),
    compras: de(compras, []),
    productos: de(productos, []),
    clientes: de(clientes, []),
    indicadores: indicadores.ok ? indicadores.datos : null,
    aging: de(aging, []),
    almacen: de(almacen, []),
    embudo: embudo.ok ? embudo.datos : null,
    archivo: (ext: string) => `Informe general ${rango.desde} a ${rango.hasta}.${ext}`,
  };
}

export async function excelInforme(url: URL): Promise<{ libro: Buffer; archivo: string }> {
  const d = await reunir(url);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();
  const AZUL = "FF0E4C73";
  const GRIS = "FF66717F";
  const DINERO = '"$" #,##0.00';
  const CANT = "#,##0.##";
  const PCT = '0.0"%"';

  const hoja = (
    nombre: string,
    subtitulo: string,
    columnas: { titulo: string; ancho: number; formato?: string }[],
    filas: (string | number)[][],
  ) => {
    const h = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 4 }] });
    h.columns = columnas.map((c) => ({ width: c.ancho }));
    h.getCell("A1").value = `${nombre} · ${EMPRESA}`;
    h.getCell("A1").font = { bold: true, size: 14, color: { argb: AZUL } };
    h.getCell("A2").value = subtitulo;
    h.getCell("A2").font = { color: { argb: GRIS } };
    const cab = h.getRow(4);
    columnas.forEach((c, i) => {
      const celda = cab.getCell(i + 1);
      celda.value = c.titulo;
      celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      celda.alignment = { vertical: "middle", wrapText: true };
    });
    cab.height = 28;
    filas.forEach((f, i) => {
      const r = h.getRow(5 + i);
      r.values = f;
      columnas.forEach((c, j) => {
        if (c.formato) r.getCell(j + 1).numFmt = c.formato;
      });
    });
    if (filas.length === 0) h.getCell("A5").value = "Nada en este periodo.";
    else h.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + filas.length, column: columnas.length } };
  };

  const periodo = `${d.descripcion} · en dólares, sin IGV`;
  const aHoy = `Al ${fechaPeru(d.hoy)} · en dólares`;

  // ------------------------------------------------------------ Resumen --
  const i = d.indicadores;
  const e = d.embudo;
  hoja(
    "Resumen",
    aHoy,
    [
      { titulo: "Indicador", ancho: 40 },
      { titulo: "Valor", ancho: 18 },
    ],
    [
      ...(i
        ? [
            ["Venta del mes", usd(i.ventaMes)],
            ["Venta del mes anterior", usd(i.ventaMesAnterior)],
            ["Margen del mes (sobre el costo)", i.costoMes > 0 ? pct(i.margenPct) : "Sin costo: no se sabe"],
            ["Por cobrar", usd(i.porCobrar)],
            ["De eso, vencido", usd(i.vencido)],
            ["Capital en el almacén (al costo)", usd(i.inventarioCosto)],
            ["Productos bajo el mínimo", String(i.skusBajoMinimo)],
          ]
        : []),
      ...(e
        ? [
            ["Cotizado", `${usd(e.cotizado)} (${e.cotizaciones} cotizaciones)`],
            ["Despachado", `${usd(e.despachado)} (${e.guias} guías)`],
            ["Facturado", `${usd(e.facturado)} (${e.comprobantes} comprobantes)`],
            ["Cobrado", usd(e.cobrado)],
            ["Por cobrar", usd(e.porCobrar)],
          ]
        : []),
    ],
  );

  hoja(
    "Ventas por periodo",
    periodo,
    [
      { titulo: "Periodo", ancho: 14 },
      { titulo: "Documentos", ancho: 12 },
      { titulo: "Unidades", ancho: 12, formato: CANT },
      { titulo: "Venta", ancho: 16, formato: DINERO },
      { titulo: "Costo", ancho: 16, formato: DINERO },
      { titulo: "Margen", ancho: 16, formato: DINERO },
      { titulo: "Margen %", ancho: 11, formato: PCT },
    ],
    d.ventas.map((v) => [v.etiqueta, v.documentos, v.unidades, v.venta, v.costo, v.margen, v.margenPct]),
  );

  hoja(
    "Compras por periodo",
    periodo,
    [
      { titulo: "Periodo", ancho: 14 },
      { titulo: "Órdenes", ancho: 10 },
      { titulo: "Proveedores", ancho: 12 },
      { titulo: "Subtotal", ancho: 16, formato: DINERO },
      { titulo: "Gastos de importación", ancho: 18, formato: DINERO },
      { titulo: "Costo total", ancho: 16, formato: DINERO },
    ],
    d.compras.map((c) => [c.etiqueta, c.ordenes, c.proveedores, c.subtotal, c.gastos, c.costoTotal]),
  );

  hoja(
    "Lo más vendido",
    `${periodo} · los ${TOPE} primeros`,
    [
      { titulo: "Código", ancho: 18 },
      { titulo: "Descripción", ancho: 44 },
      { titulo: "Marca", ancho: 14 },
      { titulo: "Unidades", ancho: 11, formato: CANT },
      { titulo: "Venta", ancho: 15, formato: DINERO },
      { titulo: "Margen", ancho: 15, formato: DINERO },
      { titulo: "Margen %", ancho: 10, formato: PCT },
      { titulo: "Clientes", ancho: 10 },
      { titulo: "Quién más se lleva", ancho: 34 },
      { titulo: "Su parte", ancho: 10, formato: PCT },
      { titulo: "Última venta", ancho: 13 },
    ],
    d.productos.map((x) => [
      x.codigo,
      x.descripcion,
      x.marca ?? "",
      x.unidades,
      x.venta,
      x.margen,
      x.margenPct,
      x.clientes,
      x.clientePrincipal ?? "",
      x.clientePrincipalPct,
      fechaPeru(x.ultimaVenta),
    ]),
  );

  hoja(
    "Quién más compra",
    `${periodo} · los ${TOPE} primeros`,
    [
      { titulo: "Cliente", ancho: 40 },
      { titulo: "RUC / DNI", ancho: 14 },
      { titulo: "Documentos", ancho: 12 },
      { titulo: "Venta", ancho: 15, formato: DINERO },
      { titulo: "Margen", ancho: 15, formato: DINERO },
      { titulo: "Margen %", ancho: 10, formato: PCT },
      { titulo: "Compra cada (días)", ancho: 14 },
      { titulo: "Última compra", ancho: 13 },
      { titulo: "Días sin comprar", ancho: 13 },
    ],
    d.clientes.map((x) => [
      x.cliente,
      x.documento ?? "",
      x.documentos,
      x.venta,
      x.margen,
      x.margenPct,
      x.diasEntreCompras ?? "",
      fechaPeru(x.ultimaCompra),
      x.diasSinComprar,
    ]),
  );

  hoja(
    "Por cobrar",
    aHoy,
    [
      { titulo: "Antigüedad", ancho: 24 },
      { titulo: "Documentos", ancho: 12 },
      { titulo: "Saldo", ancho: 16, formato: DINERO },
    ],
    d.aging.map((t) => [t.tramo, t.documentos, t.saldo]),
  );

  hoja(
    "Capital en el almacén",
    aHoy,
    [
      { titulo: "Familia", ancho: 28 },
      { titulo: "Productos", ancho: 11 },
      { titulo: "Unidades", ancho: 12, formato: CANT },
      { titulo: "Al costo", ancho: 16, formato: DINERO },
      { titulo: "A precio de venta", ancho: 16, formato: DINERO },
      { titulo: "Margen posible", ancho: 16, formato: DINERO },
    ],
    d.almacen.map((f) => [f.familia, f.skus, f.unidades, f.valorCosto, f.valorVenta, f.margenPotencial]),
  );

  const datos = await wb.xlsx.writeBuffer();
  return { libro: Buffer.from(datos as ArrayBuffer), archivo: d.archivo("xlsx") };
}

export async function pdfInforme(url: URL): Promise<{ pdf: ArrayBuffer; archivo: string }> {
  const d = await reunir(url);
  const venta = d.ventas.reduce((a, v) => a + v.venta, 0);
  const costo = d.ventas.reduce((a, v) => a + v.costo, 0);
  const comprado = d.compras.reduce((a, c) => a + c.costoTotal, 0);
  const TOPE_PDF = 50;
  const doc = await armarListadoPdf({
    titulo: "Informe general",
    empresa: EMPRESA,
    subtitulo: `${d.descripcion} · en dólares, sin IGV. Por cobrar y almacén, al ${fechaPeru(d.hoy)}`,
    resumen: [
      { etiqueta: "Vendido en el periodo", valor: usd(venta) },
      { etiqueta: "Margen", valor: costo > 0 ? pct(((venta - costo) / costo) * 100) : "—" },
      { etiqueta: "Comprado en el periodo", valor: usd(comprado) },
      ...(d.indicadores
        ? [
            { etiqueta: "Por cobrar hoy", valor: usd(d.indicadores.porCobrar) },
            { etiqueta: "Almacén al costo", valor: usd(d.indicadores.inventarioCosto) },
          ]
        : []),
    ],
    columnas: [
      { titulo: "Periodo", ancho: 26 },
      { titulo: "Documentos", ancho: 22, derecha: true },
      { titulo: "Unidades", ancho: 24, derecha: true },
      { titulo: "Venta", derecha: true },
      { titulo: "Costo", derecha: true },
      { titulo: "Margen", derecha: true },
      { titulo: "Margen %", ancho: 22, derecha: true },
    ],
    filas: d.ventas.map((v) => [v.etiqueta, String(v.documentos), cant(v.unidades), usd(v.venta), usd(v.costo), usd(v.margen), pct(v.margenPct)]),
    secciones: [
      {
        titulo: "Compras por periodo",
        columnas: [
          { titulo: "Periodo", ancho: 26 },
          { titulo: "Órdenes", ancho: 22, derecha: true },
          { titulo: "Proveedores", ancho: 24, derecha: true },
          { titulo: "Subtotal", derecha: true },
          { titulo: "Gastos de importación", derecha: true },
          { titulo: "Costo total", derecha: true },
        ],
        filas: d.compras.map((c) => [c.etiqueta, String(c.ordenes), String(c.proveedores), usd(c.subtotal), usd(c.gastos), usd(c.costoTotal)]),
      },
      {
        titulo: d.productos.length > TOPE_PDF ? `Lo más vendido (los ${TOPE_PDF} primeros; el resto en el Excel)` : "Lo más vendido",
        columnas: [
          { titulo: "Código", ancho: 32 },
          { titulo: "Descripción" },
          { titulo: "Unidades", ancho: 20, derecha: true },
          { titulo: "Venta", ancho: 28, derecha: true },
          { titulo: "Margen %", ancho: 18, derecha: true },
          { titulo: "Quién más se lleva", ancho: 56 },
        ],
        filas: d.productos.slice(0, TOPE_PDF).map((x) => [
          x.codigo,
          x.descripcion,
          cant(x.unidades),
          usd(x.venta),
          pct(x.margenPct),
          x.clientePrincipal ? `${x.clientePrincipal} (${pct(x.clientePrincipalPct)})` : "",
        ]),
      },
      {
        titulo: d.clientes.length > TOPE_PDF ? `Quién más compra (los ${TOPE_PDF} primeros; el resto en el Excel)` : "Quién más compra",
        columnas: [
          { titulo: "Cliente" },
          { titulo: "Documentos", ancho: 22, derecha: true },
          { titulo: "Venta", ancho: 28, derecha: true },
          { titulo: "Margen %", ancho: 18, derecha: true },
          { titulo: "Compra cada", ancho: 24, derecha: true },
          { titulo: "Última compra", ancho: 24 },
        ],
        filas: d.clientes.slice(0, TOPE_PDF).map((x) => [
          x.cliente,
          String(x.documentos),
          usd(x.venta),
          pct(x.margenPct),
          x.diasEntreCompras === null ? "—" : `${Math.round(x.diasEntreCompras)} días`,
          fechaPeru(x.ultimaCompra),
        ]),
      },
      {
        titulo: `Por cobrar, al ${fechaPeru(d.hoy)}`,
        columnas: [
          { titulo: "Antigüedad" },
          { titulo: "Documentos", ancho: 30, derecha: true },
          { titulo: "Saldo", ancho: 40, derecha: true },
        ],
        filas: d.aging.map((t) => [t.tramo, String(t.documentos), usd(t.saldo)]),
      },
      {
        titulo: `Capital en el almacén, al ${fechaPeru(d.hoy)}`,
        columnas: [
          { titulo: "Familia" },
          { titulo: "Productos", ancho: 22, derecha: true },
          { titulo: "Unidades", ancho: 24, derecha: true },
          { titulo: "Al costo", ancho: 32, derecha: true },
          { titulo: "A precio de venta", ancho: 32, derecha: true },
        ],
        filas: d.almacen.map((f) => [f.familia, String(f.skus), cant(f.unidades), usd(f.valorCosto), usd(f.valorVenta)]),
      },
    ],
    nota: d.ventas.length === 0 ? "No hay ventas en este periodo." : undefined,
  });
  return { pdf: doc.output("arraybuffer"), archivo: d.archivo("pdf") };
}
