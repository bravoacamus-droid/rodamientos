"use client";

/**
 * Generación de documentos PDF brandeados de Rodatech.
 * Cotizaciones, comprobantes (factura / boleta / nota de venta / nota de crédito)
 * y estados de cuenta, con la identidad visual de la empresa.
 */

import type jsPDFType from "jspdf";
import type { UserOptions } from "jspdf-autotable";

type jsPDF = jsPDFType;

/**
 * jsPDF y su plugin de tablas pesan ~350 kB. Se cargan de forma diferida al
 * generar el primer documento, para no penalizar la carga inicial del ERP.
 */
let motor: {
  jsPDF: typeof jsPDFType;
  autoTable: (doc: jsPDFType, opciones: UserOptions) => void;
} | null = null;

async function cargarMotor() {
  if (motor) return motor;
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  motor = { jsPDF, autoTable: autoTable as unknown as (d: jsPDFType, o: UserOptions) => void };
  return motor;
}

/* ------------------------------------------------------------ Constantes */

const AZUL: [number, number, number] = [14, 76, 115];      // #0E4C73
const AMARILLO: [number, number, number] = [242, 227, 7];  // #F2E307
const GRIS: [number, number, number] = [168, 168, 173];    // #A8A8AD
const GRIS_TXT: [number, number, number] = [92, 103, 115];
const NEGRO: [number, number, number] = [20, 24, 29];
const GRIS_FONDO: [number, number, number] = [245, 247, 249];

const MARGEN = 12;

export type EmpresaPdf = {
  razon_social: string;
  nombre_comercial: string;
  ruc: string;
  direccion: string | null;
  distrito: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  email_ventas: string | null;
  web: string | null;
  eslogan: string | null;
};

export type ItemPdf = {
  codigo: string;
  descripcion: string;
  marca?: string | null;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  descuento_pct?: number;
  costo_unitario?: number;
  subtotal: number;
};

/** Concepto ajeno a la mercadería: flete, embalaje, seguro, instalación. */
export type CargoPdf = {
  concepto: string;
  detalle?: string | null;
  monto: number;
  costo?: number;
};

const soles = (n: number, moneda = "PEN") =>
  `${moneda === "USD" ? "US$" : "S/"} ${Number(n ?? 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fechaTxt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/* --------------------------------------------------------------- Logotipo */

let logoCache: string | null = null;

async function cargarLogo(): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    const res = await fetch("/logo.png");
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return logoCache;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------ Cabecera y pie */

async function cabecera(
  doc: jsPDF,
  empresa: EmpresaPdf,
  caja: { titulo: string; numero: string; sub?: string }
) {
  const W = doc.internal.pageSize.getWidth();

  // Franja superior de marca
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 3.5, "F");
  doc.setFillColor(...AMARILLO);
  doc.rect(0, 3.5, W * 0.42, 1.6, "F");

  // Logotipo
  const logo = await cargarLogo();
  if (logo) {
    doc.addImage(logo, "PNG", MARGEN, 10, 46, 21, undefined, "FAST");
  } else {
    doc.setTextColor(...AZUL);
    doc.setFont("helvetica", "bold").setFontSize(17);
    doc.text("RODATECH", MARGEN, 22);
  }

  // Datos de la empresa
  doc.setTextColor(...NEGRO);
  doc.setFont("helvetica", "bold").setFontSize(8.6);
  doc.text(empresa.razon_social, MARGEN, 36);

  doc.setFont("helvetica", "normal").setFontSize(7.2);
  doc.setTextColor(...GRIS_TXT);
  const lineas = [
    `${empresa.direccion ?? ""}${empresa.distrito ? ` · ${empresa.distrito}` : ""}`,
    `Tel. ${empresa.telefono ?? ""}${empresa.celular ? ` · Cel. ${empresa.celular}` : ""}`,
    `${empresa.email_ventas ?? empresa.email ?? ""}${empresa.web ? ` · ${empresa.web}` : ""}`,
  ].filter((l) => l.trim());
  lineas.forEach((l, i) => doc.text(l, MARGEN, 40.5 + i * 3.8));

  // Caja del documento
  const cajaW = 66;
  const cajaX = W - MARGEN - cajaW;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.roundedRect(cajaX, 10, cajaW, 32, 2, 2, "S");

  doc.setFillColor(...AZUL);
  doc.roundedRect(cajaX, 10, cajaW, 11, 2, 2, "F");
  doc.rect(cajaX, 17, cajaW, 4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text(caja.titulo.toUpperCase(), cajaX + cajaW / 2, 17, { align: "center" });

  doc.setTextColor(...NEGRO);
  doc.setFontSize(7.4).setFont("helvetica", "normal");
  doc.text(`R.U.C. ${empresa.ruc}`, cajaX + cajaW / 2, 27, { align: "center" });

  doc.setFont("helvetica", "bold").setFontSize(12.5);
  doc.setTextColor(...AZUL);
  doc.text(caja.numero, cajaX + cajaW / 2, 34.5, { align: "center" });

  if (caja.sub) {
    doc.setFont("helvetica", "normal").setFontSize(6.6);
    doc.setTextColor(...GRIS_TXT);
    doc.text(caja.sub, cajaX + cajaW / 2, 39.5, { align: "center" });
  }

  return 50;
}

function pie(doc: jsPDF, empresa: EmpresaPdf, nota?: string) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const paginas = doc.getNumberOfPages();

  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);

    doc.setDrawColor(...GRIS);
    doc.setLineWidth(0.2);
    doc.line(MARGEN, H - 16, W - MARGEN, H - 16);

    doc.setFont("helvetica", "normal").setFontSize(6.4);
    doc.setTextColor(...GRIS_TXT);
    doc.text(
      nota ?? empresa.eslogan ?? "Su proveedor de soluciones en Rodamientos y más...",
      MARGEN,
      H - 11.5
    );
    doc.text(
      `${empresa.direccion ?? ""} · ${empresa.telefono ?? ""} · ${empresa.email_ventas ?? ""}`,
      MARGEN,
      H - 8
    );
    doc.text(`Página ${p} de ${paginas}`, W - MARGEN, H - 8, { align: "right" });

    doc.setFillColor(...AZUL);
    doc.rect(0, H - 4, W, 4, "F");
    doc.setFillColor(...AMARILLO);
    doc.rect(W * 0.58, H - 4, W * 0.42, 1.6, "F");
  }
}

/* ------------------------------------------------------------- Bloques */

function bloqueDatos(
  doc: jsPDF,
  y: number,
  izquierda: { titulo: string; filas: [string, string][] },
  derecha?: { titulo: string; filas: [string, string][] }
) {
  const W = doc.internal.pageSize.getWidth();
  const anchoTotal = W - MARGEN * 2;
  const ancho = derecha ? anchoTotal / 2 - 2 : anchoTotal;

  const dibujar = (x: number, blq: { titulo: string; filas: [string, string][] }) => {
    const alto = 8 + blq.filas.length * 4.6;
    doc.setFillColor(...GRIS_FONDO);
    doc.roundedRect(x, y, ancho, alto, 1.5, 1.5, "F");
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(1.2);
    doc.line(x, y + 1, x, y + alto - 1);

    doc.setFont("helvetica", "bold").setFontSize(6.6);
    doc.setTextColor(...AZUL);
    doc.text(blq.titulo.toUpperCase(), x + 3, y + 4.6);

    blq.filas.forEach(([k, v], i) => {
      const yy = y + 9.4 + i * 4.6;
      doc.setFont("helvetica", "normal").setFontSize(7);
      doc.setTextColor(...GRIS_TXT);
      doc.text(k, x + 3, yy);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NEGRO);
      doc.text(String(v ?? "—"), x + 26, yy, { maxWidth: ancho - 29 });
    });
    return alto;
  };

  const h1 = dibujar(MARGEN, izquierda);
  const h2 = derecha ? dibujar(MARGEN + ancho + 4, derecha) : 0;
  return y + Math.max(h1, h2) + 5;
}

/**
 * Detalle del documento.
 *
 * `cargos` son conceptos ajenos a la mercadería (flete, embalaje, seguro) y se
 * imprimen al final de la tabla con fondo distinto para que el cliente los
 * distinga de los ítems. `mostrarMargen` agrega costo y margen por línea: solo
 * para la copia interna.
 */
function tablaItems(
  doc: jsPDF,
  y: number,
  items: ItemPdf[],
  moneda: string,
  opciones?: { cargos?: CargoPdf[]; mostrarMargen?: boolean }
) {
  const cargos = opciones?.cargos ?? [];
  const conMargen = !!opciones?.mostrarMargen;

  const cabecera = ["#", "Código", "Descripción", "Cant.", "U.M.", "P. Unit.", "Dscto."];
  if (conMargen) cabecera.push("Costo", "Margen");
  cabecera.push("Importe");

  const filaItem = (it: ItemPdf, i: number) => {
    const neto = it.precio_unitario * (1 - (it.descuento_pct ?? 0) / 100);
    const margen = neto > 0 ? ((neto - (it.costo_unitario ?? 0)) / neto) * 100 : 0;
    const fila = [
      String(i + 1),
      it.codigo,
      it.marca ? `${it.descripcion}\n${it.marca}` : it.descripcion,
      Number(it.cantidad).toLocaleString("es-PE"),
      it.unidad,
      soles(it.precio_unitario, moneda),
      it.descuento_pct ? `${Number(it.descuento_pct).toFixed(1)}%` : "—",
    ];
    if (conMargen) {
      fila.push(soles(it.costo_unitario ?? 0, moneda), `${margen.toFixed(1)}%`);
    }
    fila.push(soles(it.subtotal, moneda));
    return fila;
  };

  const filaCargo = (c: CargoPdf, i: number) => {
    const fila = [
      String(items.length + i + 1),
      "—",
      c.detalle ? `${c.concepto}\n${c.detalle}` : c.concepto,
      "1",
      "SERV",
      soles(c.monto, moneda),
      "—",
    ];
    if (conMargen) {
      const margen = c.monto > 0 ? ((c.monto - (c.costo ?? 0)) / c.monto) * 100 : 0;
      fila.push(soles(c.costo ?? 0, moneda), `${margen.toFixed(1)}%`);
    }
    fila.push(soles(c.monto, moneda));
    return fila;
  };

  const ultimaCol = cabecera.length - 1;
  const columnStyles: Record<number, Record<string, unknown>> = {
    0: { cellWidth: 7, halign: "center", textColor: GRIS_TXT },
    1: { cellWidth: 24, fontStyle: "bold", fontSize: 6.8 },
    2: { cellWidth: "auto" },
    3: { cellWidth: 13, halign: "right" },
    4: { cellWidth: 12, halign: "center", textColor: GRIS_TXT },
    5: { cellWidth: 20, halign: "right" },
    6: { cellWidth: 13, halign: "right", textColor: GRIS_TXT },
  };
  if (conMargen) {
    columnStyles[7] = { cellWidth: 19, halign: "right", textColor: GRIS_TXT };
    columnStyles[8] = { cellWidth: 16, halign: "right", textColor: GRIS_TXT };
  }
  columnStyles[ultimaCol] = { cellWidth: 22, halign: "right", fontStyle: "bold" };

  motor!.autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    head: [cabecera],
    body: [...items.map(filaItem), ...cargos.map(filaCargo)],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
      lineColor: [225, 230, 236],
      lineWidth: 0.15,
      textColor: NEGRO,
    },
    headStyles: {
      fillColor: AZUL,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6.8,
      halign: "center",
      cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 },
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    columnStyles,
    didParseCell: (data) => {
      // Los cargos adicionales van sobre fondo ámbar tenue
      if (data.section === "body" && data.row.index >= items.length) {
        data.cell.styles.fillColor = [255, 250, 231];
        data.cell.styles.fontStyle = data.column.index === 2 ? "bold" : "normal";
      }
    },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
}

/** Marca de agua diagonal para las copias que exponen costo y margen. */
function marcaCopiaInterna(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const paginas = doc.getNumberOfPages();

  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.saveGraphicsState();
    // @ts-expect-error setGState existe en tiempo de ejecución
    doc.setGState(new doc.GState({ opacity: 0.09 }));
    doc.setTextColor(197, 49, 58);
    doc.setFont("helvetica", "bold").setFontSize(46);
    doc.text("COPIA INTERNA", W / 2, H / 2, { align: "center", angle: 32 });
    doc.restoreGraphicsState();

    doc.setFillColor(253, 236, 236);
    doc.rect(0, 5.1, W, 5, "F");
    doc.setTextColor(197, 49, 58);
    doc.setFont("helvetica", "bold").setFontSize(6.8);
    doc.text(
      "DOCUMENTO DE USO INTERNO · CONTIENE COSTOS Y MÁRGENES · NO ENVIAR AL CLIENTE",
      W / 2,
      8.6,
      { align: "center" }
    );
  }
}

function bloqueTotales(
  doc: jsPDF,
  y: number,
  totales: [string, string][],
  letras?: string,
  notaIzquierda?: { titulo: string; texto: string }
) {
  const W = doc.internal.pageSize.getWidth();
  const anchoCaja = 74;
  const x = W - MARGEN - anchoCaja;
  const alto = totales.length * 5.2 + 4;

  // Nota / condiciones a la izquierda
  if (notaIzquierda) {
    doc.setFont("helvetica", "bold").setFontSize(6.6);
    doc.setTextColor(...AZUL);
    doc.text(notaIzquierda.titulo.toUpperCase(), MARGEN, y + 4);
    doc.setFont("helvetica", "normal").setFontSize(6.8);
    doc.setTextColor(...GRIS_TXT);
    doc.text(notaIzquierda.texto, MARGEN, y + 8.4, { maxWidth: W - MARGEN * 2 - anchoCaja - 8 });
  }

  doc.setFillColor(...GRIS_FONDO);
  doc.roundedRect(x, y, anchoCaja, alto, 1.5, 1.5, "F");

  totales.forEach(([k, v], i) => {
    const yy = y + 5.2 + i * 5.2;
    const ultimo = i === totales.length - 1;
    if (ultimo) {
      doc.setFillColor(...AZUL);
      doc.roundedRect(x, yy - 4, anchoCaja, 6.6, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold").setFontSize(8.4);
    } else {
      doc.setTextColor(...GRIS_TXT);
      doc.setFont("helvetica", "normal").setFontSize(7.2);
    }
    doc.text(k, x + 3, yy);
    doc.setFont("helvetica", "bold");
    if (!ultimo) doc.setTextColor(...NEGRO);
    doc.text(v, x + anchoCaja - 3, yy, { align: "right" });
  });

  let fin = y + alto + 4;

  if (letras) {
    doc.setDrawColor(...GRIS);
    doc.setLineWidth(0.2);
    doc.line(MARGEN, fin, W - MARGEN, fin);
    doc.setFont("helvetica", "bold").setFontSize(6.6);
    doc.setTextColor(...AZUL);
    doc.text("SON:", MARGEN, fin + 4.4);
    doc.setFont("helvetica", "normal").setFontSize(7);
    doc.setTextColor(...NEGRO);
    doc.text(letras, MARGEN + 10, fin + 4.4, { maxWidth: W - MARGEN * 2 - 12 });
    fin += 9;
  }

  return fin;
}

/* =========================================================== COTIZACIÓN */

export async function pdfCotizacion(datos: {
  empresa: EmpresaPdf;
  numero: string;
  fecha: string;
  fecha_vencimiento: string;
  moneda: string;
  cliente: {
    razon_social: string;
    ruc: string | null;
    direccion: string | null;
    contacto: string | null;
    email: string | null;
    telefono: string | null;
  };
  vendedor: string;
  items: ItemPdf[];
  cargos?: CargoPdf[];
  subtotal: number;
  igv: number;
  total: number;
  condiciones: string | null;
  tiempo_entrega: string | null;
  observaciones: string | null;
  /** Si es falso, se imprime un total único sin desglosar el IGV. */
  mostrarIgv?: boolean;
  /** Si es verdadero, agrega costo y margen y marca el PDF como copia interna. */
  mostrarMargen?: boolean;
  descargar?: boolean;
}) {
  const { jsPDF } = await cargarMotor();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = await cabecera(doc, datos.empresa, {
    titulo: "Cotización",
    numero: datos.numero,
    sub: `Válida hasta el ${fechaTxt(datos.fecha_vencimiento)}`,
  });

  y = bloqueDatos(
    doc,
    y,
    {
      titulo: "Cliente",
      filas: [
        ["Razón social", datos.cliente.razon_social],
        ["RUC", datos.cliente.ruc ?? "—"],
        ["Dirección", datos.cliente.direccion ?? "—"],
        ["Contacto", datos.cliente.contacto ?? "—"],
      ],
    },
    {
      titulo: "Datos de la cotización",
      filas: [
        ["Fecha", fechaTxt(datos.fecha)],
        ["Validez", fechaTxt(datos.fecha_vencimiento)],
        ["Entrega", datos.tiempo_entrega ?? "Según stock"],
        ["Asesor", datos.vendedor],
      ],
    }
  );

  const cargos = datos.cargos ?? [];
  const mostrarIgv = datos.mostrarIgv ?? true;
  const mostrarMargen = datos.mostrarMargen ?? false;
  const totalCargos = cargos.reduce((s, c) => s + Number(c.monto ?? 0), 0);

  y = tablaItems(doc, y, datos.items, datos.moneda, { cargos, mostrarMargen });

  const totales: [string, string][] = [];
  if (mostrarIgv) {
    if (totalCargos > 0) {
      totales.push(["Mercadería", soles(datos.subtotal - totalCargos, datos.moneda)]);
      totales.push(["Cargos adicionales", soles(totalCargos, datos.moneda)]);
    }
    totales.push(["Subtotal", soles(datos.subtotal, datos.moneda)]);
    totales.push(["IGV (18%)", soles(datos.igv, datos.moneda)]);
  }
  if (mostrarMargen) {
    const costo = datos.items.reduce(
      (s, i) => s + Number(i.costo_unitario ?? 0) * Number(i.cantidad), 0
    ) + cargos.reduce((s, c) => s + Number(c.costo ?? 0), 0);
    const margen = datos.subtotal > 0 ? ((datos.subtotal - costo) / datos.subtotal) * 100 : 0;
    totales.push(["Costo total", soles(costo, datos.moneda)]);
    totales.push(["Margen bruto", `${margen.toFixed(1)} %`]);
  }
  totales.push(["TOTAL", soles(datos.total, datos.moneda)]);

  y = bloqueTotales(
    doc,
    y,
    totales,
    undefined,
    {
      titulo: "Condiciones comerciales",
      texto:
        (datos.condiciones ??
          "Sujeto a disponibilidad de stock al momento de la confirmación.") +
        (mostrarIgv
          ? " Los importes del detalle no incluyen IGV; el impuesto se muestra desglosado."
          : " Los precios indicados ya incluyen el IGV."),
    }
  );

  if (datos.observaciones) {
    doc.setFont("helvetica", "bold").setFontSize(6.6);
    doc.setTextColor(...AZUL);
    doc.text("OBSERVACIONES", MARGEN, y + 4);
    doc.setFont("helvetica", "normal").setFontSize(6.8);
    doc.setTextColor(...GRIS_TXT);
    doc.text(datos.observaciones, MARGEN, y + 8, {
      maxWidth: doc.internal.pageSize.getWidth() - MARGEN * 2,
    });
  }

  pie(
    doc,
    datos.empresa,
    mostrarMargen
      ? "Copia interna con costos y márgenes. No debe entregarse al cliente."
      : "Agradecemos la oportunidad de atenderlo. Quedamos atentos a su confirmación."
  );
  if (mostrarMargen) marcaCopiaInterna(doc);

  finalizar(
    doc,
    `Cotizacion-${datos.numero}${mostrarMargen ? "-INTERNA" : ""}.pdf`,
    datos.descargar
  );
}

/* ========================================================= COMPROBANTE */

export async function pdfComprobante(datos: {
  empresa: EmpresaPdf;
  tipo: string;
  tipoLabel: string;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  condicion_pago: string;
  moneda: string;
  cliente: {
    razon_social: string;
    ruc: string | null;
    direccion: string | null;
    distrito: string | null;
  };
  vendedor: string;
  guia_remision: string | null;
  orden_compra_cliente: string | null;
  referencia: string | null;
  motivo_nota: string | null;
  items: ItemPdf[];
  op_gravada: number;
  igv: number;
  total: number;
  total_letras: string | null;
  pagado?: number;
  saldo?: number;
  descargar?: boolean;
}) {
  const { jsPDF } = await cargarMotor();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = await cabecera(doc, datos.empresa, {
    titulo: datos.tipoLabel,
    numero: datos.numero,
    sub: datos.condicion_pago === "credito" ? "Venta al crédito" : "Venta al contado",
  });

  y = bloqueDatos(
    doc,
    y,
    {
      titulo: "Adquiriente",
      filas: [
        ["Señor(es)", datos.cliente.razon_social],
        ["RUC / DNI", datos.cliente.ruc ?? "—"],
        ["Dirección", `${datos.cliente.direccion ?? "—"}${datos.cliente.distrito ? ` · ${datos.cliente.distrito}` : ""}`],
        ["Guía remisión", datos.guia_remision ?? "—"],
      ],
    },
    {
      titulo: "Datos del comprobante",
      filas: [
        ["Emisión", fechaTxt(datos.fecha_emision)],
        ["Vencimiento", fechaTxt(datos.fecha_vencimiento)],
        ["Condición", datos.condicion_pago === "credito" ? "Crédito" : "Contado"],
        datos.referencia
          ? ["Doc. afectado", datos.referencia]
          : ["O/C cliente", datos.orden_compra_cliente ?? "—"],
      ],
    }
  );

  if (datos.motivo_nota) {
    doc.setFillColor(255, 249, 224);
    doc.roundedRect(MARGEN, y - 1, doc.internal.pageSize.getWidth() - MARGEN * 2, 8, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(6.6);
    doc.setTextColor(...AZUL);
    doc.text("MOTIVO DE LA NOTA:", MARGEN + 3, y + 4);
    doc.setFont("helvetica", "normal").setFontSize(7);
    doc.setTextColor(...NEGRO);
    doc.text(datos.motivo_nota, MARGEN + 36, y + 4);
    y += 11;
  }

  y = tablaItems(doc, y, datos.items, datos.moneda);

  const totales: [string, string][] = [
    ["Op. gravada", soles(datos.op_gravada, datos.moneda)],
    ["IGV (18%)", soles(datos.igv, datos.moneda)],
    ["IMPORTE TOTAL", soles(datos.total, datos.moneda)],
  ];

  y = bloqueTotales(doc, y, totales, datos.total_letras ?? undefined, {
    titulo: "Forma de pago",
    texto:
      datos.condicion_pago === "credito"
        ? `Crédito con vencimiento al ${fechaTxt(datos.fecha_vencimiento)}. Depositar a la cuenta corriente en soles de ${datos.empresa.razon_social}.`
        : "Pago al contado. Depositar a la cuenta corriente en soles de la empresa o cancelar en caja.",
  });

  if (datos.saldo !== undefined && datos.saldo > 0.01) {
    doc.setFillColor(253, 236, 236);
    doc.roundedRect(MARGEN, y, doc.internal.pageSize.getWidth() - MARGEN * 2, 8, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(7.2);
    doc.setTextColor(197, 49, 58);
    doc.text(
      `SALDO PENDIENTE: ${soles(datos.saldo, datos.moneda)}   ·   Pagado: ${soles(datos.pagado ?? 0, datos.moneda)}`,
      MARGEN + 3,
      y + 5.2
    );
  }

  pie(
    doc,
    datos.empresa,
    "Representación impresa del comprobante electrónico. Autorizado mediante resolución de SUNAT."
  );
  finalizar(doc, `${datos.tipoLabel.replace(/\s/g, "-")}-${datos.numero}.pdf`, datos.descargar);
}

/* ==================================================== ESTADO DE CUENTA */

export async function pdfEstadoCuenta(datos: {
  empresa: EmpresaPdf;
  cliente: {
    razon_social: string;
    ruc: string | null;
    direccion: string | null;
    contacto: string | null;
    linea_credito: number;
    dias_credito: number;
  };
  documentos: {
    numero: string;
    fecha_emision: string;
    fecha_vencimiento: string;
    total: number;
    pagado: number;
    saldo: number;
    dias_vencido: number;
  }[];
  descargar?: boolean;
}) {
  const { jsPDF } = await cargarMotor();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const hoy = new Date().toISOString().slice(0, 10);

  let y = await cabecera(doc, datos.empresa, {
    titulo: "Estado de cuenta",
    numero: fechaTxt(hoy),
    sub: "Documentos pendientes de pago",
  });

  const totalSaldo = datos.documentos.reduce((s, d) => s + d.saldo, 0);
  const vencido = datos.documentos.filter((d) => d.dias_vencido > 0).reduce((s, d) => s + d.saldo, 0);

  y = bloqueDatos(
    doc,
    y,
    {
      titulo: "Cliente",
      filas: [
        ["Razón social", datos.cliente.razon_social],
        ["RUC", datos.cliente.ruc ?? "—"],
        ["Contacto", datos.cliente.contacto ?? "—"],
      ],
    },
    {
      titulo: "Condiciones de crédito",
      filas: [
        ["Línea", soles(datos.cliente.linea_credito)],
        ["Plazo", `${datos.cliente.dias_credito} días`],
        ["Disponible", soles(Math.max(datos.cliente.linea_credito - totalSaldo, 0))],
      ],
    }
  );

  motor!.autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    head: [["Documento", "Emisión", "Vencimiento", "Días", "Total", "Pagado", "Saldo"]],
    body: datos.documentos.map((d) => [
      d.numero,
      fechaTxt(d.fecha_emision),
      fechaTxt(d.fecha_vencimiento),
      d.dias_vencido > 0 ? `${d.dias_vencido} venc.` : "vigente",
      soles(d.total),
      soles(d.pagado),
      soles(d.saldo),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: { top: 1.9, bottom: 1.9, left: 2, right: 2 },
      lineColor: [225, 230, 236],
      lineWidth: 0.15,
      textColor: NEGRO,
    },
    headStyles: {
      fillColor: AZUL,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6.8,
      halign: "center",
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: "bold" },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 24, halign: "center" },
      3: { cellWidth: 20, halign: "center" },
      4: { halign: "right" },
      5: { halign: "right", textColor: GRIS_TXT },
      6: { halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const fila = datos.documentos[data.row.index];
        if (fila?.dias_vencido > 0) data.cell.styles.textColor = [197, 49, 58];
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  y = bloqueTotales(
    doc,
    y,
    [
      ["Documentos", String(datos.documentos.length)],
      ["Vencido", soles(vencido)],
      ["SALDO TOTAL", soles(totalSaldo)],
    ],
    undefined,
    {
      titulo: "Nota",
      texto:
        "Le agradeceremos regularizar los documentos vencidos. Ante cualquier diferencia, comuníquese con nuestra área de cobranzas.",
    }
  );

  pie(datos.empresa ? doc : doc, datos.empresa, "Estado de cuenta emitido desde Rodatech ERP.");
  finalizar(
    doc,
    `EstadoCuenta-${datos.cliente.razon_social.slice(0, 18).replace(/\s/g, "-")}.pdf`,
    datos.descargar
  );
}

/* ------------------------------------------------------------ Salida */

function finalizar(doc: jsPDF, nombre: string, descargar?: boolean) {
  if (descargar) {
    doc.save(nombre);
  } else {
    const url = doc.output("bloburl");
    window.open(url, "_blank");
  }
}
