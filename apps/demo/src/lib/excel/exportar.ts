"use client";

/**
 * Exportación a Excel con la identidad visual de Rodatech.
 *
 * ExcelJS pesa cerca de 900 kB, así que se carga solo cuando el usuario pide un
 * archivo. Las hojas llevan el logotipo, la franja de marca, la cabecera azul y
 * los formatos numéricos y de fecha propios del ERP, de modo que el archivo
 * pueda enviarse a un tercero tal como sale.
 */

import type ExcelJSType from "exceljs";

const AZUL = "FF0E4C73";
const AMARILLO = "FFF2E307";
const GRIS_BORDE = "FFE1E6EC";
const GRIS_FILA = "FFFAFBFC";
const GRIS_TXT = "FF5C6773";

let motor: typeof ExcelJSType | null = null;

async function cargarMotor() {
  if (motor) return motor;
  motor = (await import("exceljs")).default ?? (await import("exceljs"));
  return motor;
}

let logoCache: ArrayBuffer | null = null;

async function cargarLogo() {
  if (logoCache) return logoCache;
  try {
    const res = await fetch("/logo.png");
    logoCache = await res.arrayBuffer();
    return logoCache;
  } catch {
    return null;
  }
}

export type Columna = {
  titulo: string;
  clave: string;
  ancho?: number;
  formato?: "texto" | "numero" | "entero" | "moneda" | "porcentaje" | "fecha";
  total?: boolean;
};

export type Empresa = {
  razon_social: string;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  email_ventas: string | null;
  web: string | null;
};

const FORMATOS: Record<string, string> = {
  moneda: '"S/" #,##0.00',
  numero: "#,##0.00",
  entero: "#,##0",
  porcentaje: "0.0%",
  fecha: "dd/mm/yyyy",
};

/**
 * Construye un libro con una hoja de datos brandeada.
 *
 * `resumen` son pares etiqueta/valor que se imprimen bajo la cabecera para dar
 * contexto al documento (cliente, periodo, totales).
 */
export async function exportarExcel({
  empresa,
  titulo,
  subtitulo,
  nombreArchivo,
  hoja = "Datos",
  columnas,
  filas,
  resumen = [],
  nota,
}: {
  empresa: Empresa;
  titulo: string;
  subtitulo?: string;
  nombreArchivo: string;
  hoja?: string;
  columnas: Columna[];
  filas: Record<string, unknown>[];
  resumen?: [string, string][];
  nota?: string;
}) {
  const ExcelJS = await cargarMotor();
  const libro = new ExcelJS.Workbook();

  libro.creator = empresa.razon_social;
  libro.company = empresa.razon_social;
  libro.created = new Date();

  const ws = libro.addWorksheet(hoja, {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const nCols = columnas.length;
  const ultimaCol = String.fromCharCode(64 + Math.min(nCols, 26));

  /* ------------------------------------------------------- Cabecera */
  ws.mergeCells(`A1:${ultimaCol}1`);
  const franja = ws.getCell("A1");
  franja.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  ws.getRow(1).height = 6;

  ws.mergeCells(`A2:${ultimaCol}2`);
  const cTitulo = ws.getCell("A2");
  cTitulo.value = titulo;
  cTitulo.font = { name: "Calibri", size: 16, bold: true, color: { argb: AZUL } };
  cTitulo.alignment = { vertical: "middle", indent: 8 };
  ws.getRow(2).height = 26;

  ws.mergeCells(`A3:${ultimaCol}3`);
  const cSub = ws.getCell("A3");
  cSub.value = subtitulo ?? empresa.razon_social;
  cSub.font = { name: "Calibri", size: 9.5, color: { argb: GRIS_TXT } };
  cSub.alignment = { vertical: "middle", indent: 8 };
  ws.getRow(3).height = 15;

  ws.mergeCells(`A4:${ultimaCol}4`);
  const cEmpresa = ws.getCell("A4");
  cEmpresa.value =
    `RUC ${empresa.ruc}` +
    (empresa.direccion ? ` · ${empresa.direccion}` : "") +
    (empresa.telefono ? ` · ${empresa.telefono}` : "") +
    (empresa.email_ventas ? ` · ${empresa.email_ventas}` : "");
  cEmpresa.font = { name: "Calibri", size: 8, color: { argb: GRIS_TXT } };
  cEmpresa.alignment = { vertical: "middle", indent: 8 };
  ws.getRow(4).height = 14;

  const logo = await cargarLogo();
  if (logo) {
    const id = libro.addImage({ buffer: logo as never, extension: "png" });
    ws.addImage(id, { tl: { col: 0.15, row: 1.15 }, ext: { width: 108, height: 49 } });
  }

  let fila = 5;

  /* -------------------------------------------------------- Resumen */
  if (resumen.length) {
    fila += 1;
    for (const [k, v] of resumen) {
      const cK = ws.getCell(`A${fila}`);
      cK.value = k;
      cK.font = { name: "Calibri", size: 9, bold: true, color: { argb: GRIS_TXT } };
      const cV = ws.getCell(`B${fila}`);
      cV.value = v;
      cV.font = { name: "Calibri", size: 9, color: { argb: "FF14181D" } };
      fila += 1;
    }
    fila += 1;
  } else {
    fila += 1;
  }

  /* ------------------------------------------------- Cabecera de tabla */
  const filaCab = fila;
  columnas.forEach((c, i) => {
    const celda = ws.getCell(filaCab, i + 1);
    celda.value = c.titulo;
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    celda.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    celda.alignment = {
      vertical: "middle",
      horizontal: c.formato && c.formato !== "texto" ? "right" : "left",
      wrapText: true,
    };
    celda.border = {
      top: { style: "thin", color: { argb: AZUL } },
      bottom: { style: "thin", color: { argb: AZUL } },
    };
    ws.getColumn(i + 1).width = c.ancho ?? Math.max(c.titulo.length + 4, 14);
  });
  ws.getRow(filaCab).height = 22;

  /* -------------------------------------------------------- Datos */
  filas.forEach((f, idx) => {
    const r = filaCab + 1 + idx;
    columnas.forEach((c, i) => {
      const celda = ws.getCell(r, i + 1);
      const valor = f[c.clave];

      if (c.formato === "fecha" && valor) {
        celda.value = new Date(String(valor).length === 10 ? `${valor}T12:00:00` : String(valor));
      } else if (c.formato && c.formato !== "texto") {
        celda.value = valor === null || valor === undefined ? 0 : Number(valor);
      } else {
        celda.value = (valor ?? "") as string;
      }

      if (c.formato && FORMATOS[c.formato]) celda.numFmt = FORMATOS[c.formato];
      celda.font = { name: "Calibri", size: 9.5 };
      celda.alignment = {
        vertical: "middle",
        horizontal: c.formato && c.formato !== "texto" ? "right" : "left",
      };
      celda.border = { bottom: { style: "hair", color: { argb: GRIS_BORDE } } };
      if (idx % 2 === 1) {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_FILA } };
      }
    });
  });

  /* -------------------------------------------------------- Totales */
  const conTotal = columnas.some((c) => c.total);
  if (conTotal && filas.length) {
    const r = filaCab + 1 + filas.length;
    columnas.forEach((c, i) => {
      const celda = ws.getCell(r, i + 1);
      if (i === 0) celda.value = "TOTAL";
      else if (c.total) {
        celda.value = filas.reduce((s, f) => s + Number(f[c.clave] ?? 0), 0);
        if (c.formato && FORMATOS[c.formato]) celda.numFmt = FORMATOS[c.formato];
      }
      celda.font = { name: "Calibri", size: 10, bold: true, color: { argb: AZUL } };
      celda.alignment = {
        vertical: "middle",
        horizontal: c.formato && c.formato !== "texto" ? "right" : "left",
      };
      celda.border = { top: { style: "double", color: { argb: AZUL } } };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5F9" } };
    });
    ws.getRow(r).height = 20;
  }

  /* ---------------------------------------------------------- Pie */
  const rPie = filaCab + filas.length + (conTotal ? 3 : 2);
  ws.mergeCells(rPie, 1, rPie, Math.min(nCols, 26));
  const cPie = ws.getCell(rPie, 1);
  cPie.value =
    (nota ? `${nota}  ·  ` : "") +
    `Generado desde Rodatech ERP el ${new Date().toLocaleString("es-PE")}`;
  cPie.font = { name: "Calibri", size: 8, italic: true, color: { argb: GRIS_TXT } };

  ws.mergeCells(rPie + 1, 1, rPie + 1, Math.min(nCols, 26));
  const cFranja = ws.getCell(rPie + 1, 1);
  cFranja.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARILLO } };
  ws.getRow(rPie + 1).height = 5;

  // Fija la cabecera y habilita el filtro automático
  ws.views = [{ state: "frozen", ySplit: filaCab, showGridLines: false }];
  if (filas.length) {
    ws.autoFilter = {
      from: { row: filaCab, column: 1 },
      to: { row: filaCab + filas.length, column: nCols },
    };
  }

  const buffer = await libro.xlsx.writeBuffer();
  descargar(buffer, nombreArchivo);
}

function descargar(buffer: ArrayBuffer, nombre: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre.endsWith(".xlsx") ? nombre : `${nombre}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
