/**
 * Un LISTADO en PDF: título, qué se filtró, unos totales y una tabla (19/11).
 *
 * Luis: *«lo que me traiga, o también dinámico con los filtros, pueda
 * exportarlo por Excel y PDF»*. `pdf-hoja` dibuja DOCUMENTOS —una factura, una
 * guía—, con membrete y recuadro del número; un kardex o una hoja de conteo
 * es otra cosa: muchas filas, apaisado, y la cabecera de la tabla repetida
 * en cada página.
 *
 * Sin `server-only` ni nada del navegador: el kardex lo arma en el servidor
 * (una ruta que devuelve el archivo) y la hoja de conteo en el navegador, con
 * lo que hay en pantalla.
 */

import type { jsPDF } from "jspdf";

import { textoPdf } from "@/lib/pdf-hoja";

const AZUL: [number, number, number] = [14, 76, 115];
const AZUL_CLARO: [number, number, number] = [227, 238, 246];
const GRIS: [number, number, number] = [90, 90, 90];
const MARGEN = 10;

export interface ColumnaListado {
  titulo: string;
  /** Ancho en milímetros; sin él, autotable reparte. */
  ancho?: number;
  derecha?: boolean;
}

export interface ListadoPdf {
  titulo: string;
  /** La empresa, arriba a la derecha. */
  empresa?: string;
  /** Qué se filtró, en palabras. */
  subtitulo?: string;
  /** Totales en una franja: «Entradas: 120 und». */
  resumen?: { etiqueta: string; valor: string }[];
  columnas: ColumnaListado[];
  filas: string[][];
  /** Una fila de totales al pie de la tabla. */
  pie?: string[];
  /** Una nota al final: «Se cortó en 10.000 filas…». */
  nota?: string;
  /**
   * Más tablas debajo de la primera, cada una con su título (26/11): un
   * reporte lleva «por cliente» y «por producto» en el mismo papel.
   */
  secciones?: { titulo: string; columnas: ColumnaListado[]; filas: string[][]; pie?: string[] }[];
  orientacion?: "landscape" | "portrait";
}

/** «19/11/2026 15:42», en hora de Lima. */
function ahoraLima(): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export async function armarListadoPdf(l: ListadoPdf): Promise<jsPDF> {
  const [{ jsPDF: JsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new JsPDF({ unit: "mm", format: "a4", orientation: l.orientacion ?? "landscape" });
  doc.setProperties({ title: textoPdf(l.titulo), author: l.empresa ?? "", creator: "Rodatech ERP" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  let y = MARGEN + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...AZUL);
  doc.text(textoPdf(l.titulo), MARGEN, y);
  if (l.empresa) {
    doc.setFontSize(9);
    doc.text(textoPdf(l.empresa), ancho - MARGEN, y, { align: "right" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  y += 5.5;
  const sub = [l.subtitulo, `Generado el ${ahoraLima()}`].filter(Boolean).join(" · ");
  const renglones = doc.splitTextToSize(textoPdf(sub), ancho - MARGEN * 2) as string[];
  doc.text(renglones, MARGEN, y);
  y += renglones.length * 4 + 1;

  if (l.resumen && l.resumen.length > 0) {
    // Una franja azul clara con los totales, como el pie del Excel.
    const alturaFranja = 9;
    doc.setFillColor(...AZUL_CLARO);
    doc.rect(MARGEN, y, ancho - MARGEN * 2, alturaFranja, "F");
    const paso = (ancho - MARGEN * 2) / l.resumen.length;
    l.resumen.forEach((r, i) => {
      const x = MARGEN + 3 + i * paso;
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS);
      doc.text(textoPdf(r.etiqueta), x, y + 3.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(17, 17, 17);
      doc.text(textoPdf(r.valor), x, y + 7.5);
      doc.setFont("helvetica", "normal");
    });
    y += alturaFranja + 3;
  }

  const tabla = (columnas: ColumnaListado[], filas: string[][], pie: string[] | undefined, desdeY: number) => {
    const estilosColumna: Record<number, { cellWidth?: number; halign?: "right" | "left" }> = {};
    columnas.forEach((c, i) => {
      estilosColumna[i] = { ...(c.ancho ? { cellWidth: c.ancho } : {}), ...(c.derecha ? { halign: "right" } : {}) };
    });
    autoTable(doc, {
      startY: desdeY,
      margin: { left: MARGEN, right: MARGEN, bottom: 12 },
      head: [columnas.map((c) => textoPdf(c.titulo))],
      body: filas.map((f) => f.map((c) => textoPdf(c))),
      foot: pie ? [pie.map((c) => textoPdf(c))] : undefined,
      showFoot: "lastPage",
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.4, lineColor: [210, 210, 210], lineWidth: 0.1, textColor: [17, 17, 17] },
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fillColor: AZUL_CLARO, textColor: [17, 17, 17], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: estilosColumna,
      didParseCell: (d) => {
        // El pie también se alinea a la derecha donde las cifras.
        if (d.section !== "body" && columnas[d.column.index]?.derecha) d.cell.styles.halign = "right";
      },
    });
  };
  const finDeTabla = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  tabla(l.columnas, l.filas, l.pie, y);

  for (const sec of l.secciones ?? []) {
    let ys = finDeTabla() + 8;
    // El título no se queda solo al pie de una hoja.
    if (ys > alto - 30) {
      doc.addPage();
      ys = MARGEN + 5;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...AZUL);
    doc.text(textoPdf(sec.titulo), MARGEN, ys);
    doc.setFont("helvetica", "normal");
    tabla(sec.columnas, sec.filas.length > 0 ? sec.filas : [sec.columnas.map((_, i) => (i === 0 ? "Nada en este periodo." : ""))], sec.pie, ys + 3);
  }

  if (l.nota) {
    let yn = finDeTabla() + 5;
    if (yn > alto - 15) {
      doc.addPage();
      yn = MARGEN + 5;
    }
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(doc.splitTextToSize(textoPdf(l.nota), ancho - MARGEN * 2) as string[], MARGEN, yn);
  }

  // «Página 2 de 7» en cada hoja: un listado impreso se desordena.
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(textoPdf(l.titulo), MARGEN, alto - 5);
    doc.text(`Página ${i} de ${paginas}`, ancho - MARGEN, alto - 5, { align: "right" });
  }
  return doc;
}

/** En el navegador: arma el listado y lo baja como archivo. */
export async function descargarListadoPdf(l: ListadoPdf, nombre: string): Promise<void> {
  const doc = await armarListadoPdf(l);
  doc.save(nombre);
}
