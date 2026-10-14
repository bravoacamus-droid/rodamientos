/**
 * La hoja de un documento, como ARCHIVO PDF que se descarga (14/10).
 *
 * Willy, por Luis: *«quiere un botón para que se descargue directo en PDF, no
 * como la imagen que te pasé»* — la imagen era la ventana de imprimir de
 * Chrome con «Guardar como PDF». Funcionaba, pero eran cuatro pasos y una
 * ventana que no es del sistema; él quiere un botón y un archivo.
 *
 * Se arma en el NAVEGADOR con jsPDF, como los PDF de Kassara: sin Chromium en
 * el servidor (que en Vercel son 60 MB y un arranque en frío por documento) y
 * con texto de verdad, que se busca y se copia. Es el calco de
 * `HojaDocumento`: el mismo azul, el mismo orden, las mismas proporciones.
 * Los DATOS no se calculan aquí —llegan ya armados, de las mismas funciones
 * que alimentan el papel—, así que lo que puede separarse con el tiempo es el
 * dibujo, nunca una cifra.
 *
 * Ojo con la vista previa de Windows: desde la actualización de octubre de
 * 2025 no enseña los archivos descargados de internet hasta que se les marca
 * «Desbloquear» en Propiedades. Le pasa a cualquier PDF descargado, no a este.
 */

import type { jsPDF } from "jspdf";

import type { EmisorHoja } from "@/componentes/hoja-documento";

const AZUL: [number, number, number] = [14, 76, 115];
const GRIS: [number, number, number] = [68, 68, 68];
const NEGRO: [number, number, number] = [17, 17, 17];
const BORDE: [number, number, number] = [204, 204, 204];

/** Márgenes de una impresora cualquiera, en milímetros. */
const MARGEN = 14;
/** El cuerpo del papel. `text-xs` en pantalla; aquí, en puntos. */
const CUERPO = 8;
const CHICO = 7;

export interface CeldaPdf {
  texto: string;
  /** Renglones de debajo, más chicos: «Contiene: …», «Nota: …». */
  debajo?: string[];
}

/** Un trozo de párrafo, en negrita o no. */
export type TrozoPdf = { texto: string; negrita?: boolean };

export type BloquePiePdf =
  | { tipo: "parrafo"; trozos: TrozoPdf[] }
  | { tipo: "cuentas"; titulo: string; filas: [string, string, string, string][] }
  | { tipo: "firma"; izquierda: string; derecha: string }
  /** «Etiqueta: valor» en dos columnas (el transporte de la guía). */
  | { tipo: "campos"; campos: { etiqueta: string; valor: string }[] }
  /** Una tabla chica con título (las cuotas de la factura). */
  | { tipo: "tabla"; titulo: string; cabecera: string[]; filas: string[][]; derecha?: number[] }
  /** La raya para el sello y la firma del que recibe. */
  | { tipo: "sello"; texto: string }
  /**
   * El QR de la representación impresa (PNG en data URL) y el hash, a la
   * derecha, como en el formato de Willy (15/10).
   */
  | { tipo: "qr"; dato: string; hash: string | null };

export interface HojaPdf {
  emisor: EmisorHoja;
  titulo: string;
  numero: string;
  datos: ({ etiqueta: string; valor: string; ancho?: boolean } | null)[];
  columnas: { clave: string; titulo: string; alinear?: "izquierda" | "centro" | "derecha"; sinCortar?: boolean }[];
  filas: Record<string, string | CeldaPdf>[];
  totales?: { etiqueta: string; valor: string; destacado?: boolean }[];
  enLetras?: string | null;
  pie?: BloquePiePdf[];
}

/**
 * Lo que la fuente estándar del PDF no sabe escribir. Helvetica trae el
 * juego de Windows (tildes, ñ, «°», «×», «—»), pero no el signo menos de
 * verdad ni el espacio que no se parte, y en su lugar pinta basura.
 */
export function textoPdf(s: string): string {
  return s
    .replace(/−/g, "-")
    .replace(/[  ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

/** «COT1-000011 - GRUPO KLAUS S.A.C..pdf», sin lo que Windows no admite. */
export function nombreArchivo(...partes: (string | null | undefined)[]): string {
  const base = partes
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => p.trim())
    .join(" - ")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .slice(0, 120);
  return `${base || "documento"}.pdf`;
}

async function imagenComoDato(url: string): Promise<{ dato: string; ancho: number; alto: number } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    const dato = await new Promise<string>((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result));
      lector.onerror = () => mal(lector.error);
      lector.readAsDataURL(blob);
    });
    const img = new Image();
    await new Promise<void>((ok, mal) => {
      img.onload = () => ok();
      img.onerror = () => mal(new Error("logo"));
      img.src = dato;
    });
    return { dato, ancho: img.naturalWidth, alto: img.naturalHeight };
  } catch {
    // Sin logo el documento sigue valiendo: la razón social va al lado.
    return null;
  }
}

/** Escribe un párrafo con trozos en negrita, partiendo renglones a mano. */
function parrafo(doc: jsPDF, trozos: TrozoPdf[], x: number, y: number, ancho: number, tam: number): number {
  const alto = tam * 0.3528 * 1.35;
  let cx = x;
  let cy = y;
  for (const t of trozos) {
    doc.setFont("helvetica", t.negrita ? "bold" : "normal");
    const palabras = textoPdf(t.texto).split(/(\s+)/);
    for (const p of palabras) {
      if (!p) continue;
      if (/^\s+$/.test(p)) {
        // Un salto de línea escrito a mano se respeta, como en el papel
        // (`whitespace-pre-line`); cualquier otro hueco es un espacio.
        if (p.includes("\n")) {
          cx = x;
          cy += alto * (p.split("\n").length - 1);
        } else if (cx > x) {
          cx += doc.getTextWidth(" ");
        }
        continue;
      }
      const w = doc.getTextWidth(p);
      if (cx + w > x + ancho && cx > x) {
        cx = x;
        cy += alto;
      }
      doc.text(p, cx, cy);
      cx += w;
    }
  }
  doc.setFont("helvetica", "normal");
  return cy + alto;
}

export async function armarHojaPdf(h: HojaPdf): Promise<jsPDF> {
  const [{ jsPDF: JsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({ title: `${h.titulo} ${h.numero}`, author: h.emisor.razonSocial, creator: "Rodatech ERP" });

  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const util = anchoPagina - MARGEN * 2;
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const quedaSitio = (y: number, falta: number) => {
    if (y + falta <= altoPagina - MARGEN) return y;
    doc.addPage();
    return MARGEN;
  };

  /* ------------------------------------------------------------ Cabecera */
  const logo = h.emisor.logoUrl ? await imagenComoDato(h.emisor.logoUrl) : null;
  let x = MARGEN;
  const yCab = MARGEN;
  if (logo) {
    const alto = 16;
    const ancho = Math.min(36, (alto * logo.ancho) / logo.alto);
    doc.addImage(logo.dato, x, yCab, ancho, (ancho * logo.alto) / logo.ancho);
    x += ancho + 5;
  }

  // El recuadro del número, a la derecha.
  const anchoCaja = 46;
  const xCaja = anchoPagina - MARGEN - anchoCaja;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.roundedRect(xCaja, yCab, anchoCaja, 16, 1, 1, "S");
  doc.setTextColor(...AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(CHICO);
  doc.text(textoPdf(h.titulo.toUpperCase()), xCaja + anchoCaja / 2, yCab + 6, { align: "center" });
  doc.setTextColor(...NEGRO);
  doc.setFontSize(12);
  doc.text(textoPdf(h.numero), xCaja + anchoCaja / 2, yCab + 12, { align: "center" });

  // La razón social y debajo lo demás del emisor.
  const anchoEmisor = xCaja - 5 - x;
  doc.setTextColor(...AZUL);
  doc.setFontSize(11);
  doc.text(doc.splitTextToSize(textoPdf(h.emisor.razonSocial), anchoEmisor), x, yCab + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(CHICO);
  doc.setTextColor(...GRIS);
  let yEm = yCab + 9;
  const lineasEmisor = [
    `RUC ${h.emisor.ruc}`,
    h.emisor.direccion,
    [h.emisor.telefono, h.emisor.email, h.emisor.web].filter(Boolean).join(" · "),
  ].filter((l): l is string => Boolean(l));
  for (const l of lineasEmisor) {
    const partes = doc.splitTextToSize(textoPdf(l), anchoEmisor) as string[];
    doc.text(partes, x, yEm);
    yEm += partes.length * 3.2;
  }

  let y = Math.max(yEm, yCab + 18) + 1;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.line(MARGEN, y, anchoPagina - MARGEN, y);
  y += 5;

  /* --------------------------------------------------------------- Datos */
  doc.setFontSize(CUERPO - 0.5);
  const anchoEtiqueta = 24;
  const mitad = (util - 8) / 2;
  let columna = 0;
  let altoFila = 0;
  const pintarDato = (d: { etiqueta: string; valor: string }, xd: number, anchoTotal: number) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...AZUL);
    doc.text(textoPdf(d.etiqueta), xd, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...NEGRO);
    const partes = doc.splitTextToSize(textoPdf(d.valor), anchoTotal - anchoEtiqueta) as string[];
    doc.text(partes, xd + anchoEtiqueta, y);
    return partes.length * 3.4;
  };
  for (const d of h.datos) {
    if (d?.ancho) {
      if (columna === 1) {
        y += altoFila;
        columna = 0;
      }
      y += pintarDato(d, MARGEN, util);
      altoFila = 0;
      continue;
    }
    const xd = columna === 0 ? MARGEN : MARGEN + mitad + 8;
    const alto = d ? pintarDato(d, xd, mitad) : 3.4;
    altoFila = Math.max(altoFila, alto);
    if (columna === 1) {
      y += altoFila;
      altoFila = 0;
    }
    columna = 1 - columna;
  }
  if (columna === 1) y += altoFila;
  y += 3;

  /* -------------------------------------------------------------- Líneas */
  const alinear = (a?: string) => (a === "derecha" ? "right" : a === "centro" ? "center" : "left") as "right" | "center" | "left";
  const extras = new Map<string, string[]>();
  const apartados = new Map<unknown, string[]>();
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    head: [h.columnas.map((c) => ({ content: textoPdf(c.titulo), styles: { halign: alinear(c.alinear) } }))],
    body: h.filas.map((f, i) =>
      h.columnas.map((c) => {
        const v = f[c.clave] ?? "";
        if (typeof v === "string") return textoPdf(v);
        const debajo = (v.debajo ?? []).map(textoPdf);
        if (debajo.length) extras.set(`${i}|${c.clave}`, debajo);
        // Van DENTRO de la celda, para que la tabla les mida el alto y los
        // parta como a lo demás; `willDrawCell` los aparta y `didDrawCell`
        // los pinta en gris y cursiva.
        return [textoPdf(v.texto), ...debajo].join("\n");
      }),
    ),
    columnStyles: Object.fromEntries(
      h.columnas.map((c, i) => [
        i,
        {
          halign: alinear(c.alinear),
          ...(c.clave === "descripcion"
            ? { cellWidth: "auto" as const, valign: "top" as const }
            : { cellWidth: "wrap" as const }),
        },
      ]),
    ),
    styles: {
      font: "helvetica",
      fontSize: CUERPO - 0.5,
      textColor: NEGRO,
      lineColor: BORDE,
      lineWidth: 0.2,
      cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 },
      valign: "middle",
    },
    headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: "bold", lineColor: AZUL },
    theme: "grid",
    willDrawCell: (dato) => {
      if (dato.section !== "body") return;
      const clave = h.columnas[dato.column.index]?.clave;
      const lineas = clave ? extras.get(`${dato.row.index}|${clave}`) : undefined;
      if (!lineas) return;
      // Cuántos renglones ocupan, partidos al ancho de esta celda.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(CUERPO - 0.5);
      const ancho = dato.cell.width - dato.cell.padding("left") - dato.cell.padding("right");
      const cuantos = lineas.reduce((n, l) => n + (doc.splitTextToSize(l, ancho) as string[]).length, 0);
      const texto = dato.cell.text;
      apartados.set(dato.cell, texto.slice(texto.length - cuantos));
      dato.cell.text = texto.slice(0, texto.length - cuantos);
    },
    didDrawCell: (dato) => {
      const resto = apartados.get(dato.cell);
      if (!resto) return;
      // Debajo de la descripción, en gris y cursiva: es información de
      // segunda, como en el papel.
      const tam = CUERPO - 0.5;
      const alto = tam * 0.3528 * doc.getLineHeightFactor();
      let yl = dato.cell.y + dato.cell.padding("top") + alto * dato.cell.text.length + tam * 0.3528 * 0.85;
      doc.setFontSize(tam);
      doc.setTextColor(...GRIS);
      doc.setFont("helvetica", "italic");
      for (const l of resto) {
        doc.text(l, dato.cell.x + dato.cell.padding("left"), yl);
        yl += alto;
      }
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...NEGRO);
    },
  });
  y = finalY() + 3;

  /* ------------------------------------------------------------- Totales */
  if (h.totales?.length) {
    y = quedaSitio(y, h.totales.length * 6 + 4);
    const anchoTotales = 62;
    autoTable(doc, {
      startY: y,
      margin: { left: anchoPagina - MARGEN - anchoTotales, right: MARGEN },
      tableWidth: anchoTotales,
      body: h.totales.map((t) => [textoPdf(t.etiqueta), textoPdf(t.valor)]),
      theme: "grid",
      styles: {
        fontSize: CUERPO - 0.5,
        halign: "right",
        textColor: NEGRO,
        lineColor: BORDE,
        lineWidth: 0.2,
        cellPadding: { top: 1.2, bottom: 1.2, left: 3, right: 3 },
      },
      didParseCell: (dato) => {
        if (h.totales?.[dato.row.index]?.destacado) {
          dato.cell.styles.fillColor = AZUL;
          dato.cell.styles.textColor = [255, 255, 255];
          dato.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = finalY() + 4;
  }

  if (h.enLetras) {
    doc.setFontSize(CHICO);
    doc.setTextColor(...GRIS);
    doc.text(textoPdf(`SON: ${h.enLetras}`.toUpperCase()), anchoPagina - MARGEN, y, { align: "right" });
    y += 6;
  }

  /* ----------------------------------------------------------------- Pie */
  if (h.pie?.length) {
    y = quedaSitio(y, 30) + 2;
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.2);
    doc.line(MARGEN, y, anchoPagina - MARGEN, y);
    y += 5;
    doc.setFontSize(CHICO + 0.5);
    for (const b of h.pie) {
      doc.setTextColor(...GRIS);
      if (b.tipo === "parrafo") {
        y = quedaSitio(y, 8);
        y = parrafo(doc, b.trozos, MARGEN, y, util, CHICO + 0.5) + 1;
      } else if (b.tipo === "cuentas") {
        y = quedaSitio(y, 8 + b.filas.length * 5);
        doc.setDrawColor(...BORDE);
        doc.line(MARGEN, y - 2, anchoPagina - MARGEN, y - 2);
        y += 2;
        doc.setFont("helvetica", "bold");
        doc.text(textoPdf(b.titulo), MARGEN, y);
        doc.setFont("helvetica", "normal");
        autoTable(doc, {
          startY: y + 1.5,
          margin: { left: MARGEN, right: MARGEN },
          tableWidth: "wrap",
          head: [["BANCO", "MONEDA", "N.° DE CUENTA", "CCI CTA. INTERBANCARIA"]],
          body: b.filas.map((f) => f.map(textoPdf)),
          theme: "plain",
          styles: { fontSize: CHICO, textColor: NEGRO, cellPadding: { top: 0.6, bottom: 0.6, left: 3, right: 3 } },
          headStyles: { fontStyle: "bold", halign: "center" },
          columnStyles: { 0: { fontStyle: "bold", halign: "center" } },
          tableLineColor: [153, 153, 153],
          tableLineWidth: 0.2,
        });
        y = finalY() + 5;
      } else if (b.tipo === "campos") {
        // «Placa: AUE169» en dos columnas, como el pie de la guía.
        const filas = Math.ceil(b.campos.length / 2);
        y = quedaSitio(y, filas * 4.2 + 2);
        const mitadPie = util / 2;
        b.campos.forEach((c, i) => {
          const x = MARGEN + (i % 2) * mitadPie;
          const yc = y + Math.floor(i / 2) * 4.2;
          doc.setFont("helvetica", "bold");
          const etiqueta = `${textoPdf(c.etiqueta)}: `;
          // Se mide en negrita, que es como se escribe: medida en normal, el
          // valor se montaba encima («ConductorWILLY…»).
          const ancho = doc.getTextWidth(etiqueta);
          doc.text(etiqueta, x, yc);
          doc.setFont("helvetica", "normal");
          doc.text(textoPdf(c.valor), x + ancho, yc, { maxWidth: mitadPie - ancho - 2 });
        });
        y += filas * 4.2 + 1;
      } else if (b.tipo === "tabla") {
        y = quedaSitio(y, 8 + b.filas.length * 5);
        doc.setFont("helvetica", "bold");
        doc.text(textoPdf(b.titulo), MARGEN, y);
        doc.setFont("helvetica", "normal");
        autoTable(doc, {
          startY: y + 1.5,
          margin: { left: MARGEN, right: MARGEN },
          tableWidth: "wrap",
          head: [b.cabecera.map(textoPdf)],
          body: b.filas.map((f) => f.map(textoPdf)),
          theme: "plain",
          styles: { fontSize: CHICO, textColor: NEGRO, cellPadding: { top: 0.6, bottom: 0.6, left: 3, right: 3 } },
          headStyles: { fontStyle: "bold" },
          columnStyles: Object.fromEntries((b.derecha ?? []).map((i) => [i, { halign: "right" as const }])),
          tableLineColor: [153, 153, 153],
          tableLineWidth: 0.2,
        });
        y = finalY() + 4;
      } else if (b.tipo === "qr") {
        const lado = 28;
        y = quedaSitio(y + 3, lado + 6);
        const x0 = anchoPagina - MARGEN - lado;
        doc.addImage(b.dato, "PNG", x0, y, lado, lado);
        if (b.hash) {
          doc.setFont("helvetica", "bold");
          doc.text("Hash:", MARGEN, y + 4);
          doc.setFont("helvetica", "normal");
          doc.text(textoPdf(b.hash), MARGEN + 12, y + 4);
        }
        y += lado + 3;
      } else if (b.tipo === "sello") {
        // Sitio en blanco para el sello del que recibe, con su raya.
        y = quedaSitio(y + 14, 8);
        doc.setDrawColor(102, 102, 102);
        doc.setLineWidth(0.3);
        const x0 = MARGEN + util / 2;
        doc.line(x0, y, anchoPagina - MARGEN, y);
        doc.text(textoPdf(b.texto), x0 + util / 4, y + 4, { align: "center" });
        y += 8;
      } else {
        y = quedaSitio(y, 6) + 2;
        doc.text(textoPdf(b.izquierda), MARGEN, y);
        doc.text(textoPdf(b.derecha), anchoPagina - MARGEN, y, { align: "right" });
        y += 5;
      }
    }
  }

  // «1 de 2» solo si hay más de una: en una hoja sola sobra.
  const paginas = doc.getNumberOfPages();
  if (paginas > 1) {
    for (let i = 1; i <= paginas; i++) {
      doc.setPage(i);
      doc.setFontSize(CHICO);
      doc.setTextColor(...GRIS);
      doc.text(`${textoPdf(h.numero)} · ${i} de ${paginas}`, anchoPagina - MARGEN, altoPagina - 7, { align: "right" });
    }
  }
  return doc;
}

/** Arma la hoja y la baja como archivo, con su nombre. */
export async function descargarHojaPdf(h: HojaPdf, nombre: string): Promise<void> {
  const doc = await armarHojaPdf(h);
  doc.save(nombre);
}
