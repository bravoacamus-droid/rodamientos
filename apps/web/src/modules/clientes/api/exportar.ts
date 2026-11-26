import "server-only";

import { armarListadoPdf } from "@/lib/pdf-listado";

import { describirFiltrosClientes } from "../dominio/filtros";
import type { FiltrosClientes } from "../dominio/tipos";
import { clientesParaExportar, nombresDeFiltrosClientes, TOPE_CLIENTES } from "./consultas";

/**
 * La cartera de clientes en Excel y en PDF, con los filtros de la lista
 * (26/11). Luis: *«no se puede exportar ni por PDF ni por Excel todos los
 * clientes que tengo… tiene que ser siempre dinámico»*: se baja lo que se ve
 * filtrado —zona, rubro, condición, búsqueda—, entero y no solo la página.
 */

const EMPRESA = "Inversiones Rodatech E.I.R.L.";
const NOTA_TOPE = `Se cortó en ${TOPE_CLIENTES.toLocaleString("es-PE")} clientes. Filtra por zona o rubro para bajar el resto.`;

const condicion = (c: string, dias: number) => (c === "credito" ? `Crédito ${dias} días` : "Contado");
const documento = (tipo: string, numero: string | null) => (numero ? `${tipo} ${numero}` : tipo === "SIN_DOC" ? "Sin documento" : tipo);

async function reunir(filtros: FiltrosClientes) {
  const [lista, nombres] = await Promise.all([clientesParaExportar(filtros), nombresDeFiltrosClientes(filtros)]);
  if (!lista.ok) throw new Error(lista.error);
  const quien = [nombres.zona, nombres.rubro]
    .filter(Boolean)
    .join(" ")
    .replace(/[^\p{L}\p{N} .-]/gu, "")
    .slice(0, 50);
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  return {
    ...lista.datos,
    descripcion: describirFiltrosClientes(filtros, nombres),
    archivo: (ext: string) => `Clientes${quien ? ` ${quien}` : ""} ${hoy}.${ext}`,
  };
}

export async function excelClientes(filtros: FiltrosClientes): Promise<{ libro: Buffer; archivo: string }> {
  const d = await reunir(filtros);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();
  const AZUL = "FF0E4C73";
  const GRIS = "FF66717F";
  const BLANCO = "FFFFFFFF";

  const FILA = 5;
  const hoja = wb.addWorksheet("Clientes", {
    views: [{ state: "frozen", ySplit: FILA, xSplit: 2 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const titulos = [
    "Código", "Razón social", "Nombre comercial", "Documento", "Contacto principal", "Teléfono", "WhatsApp",
    "Correo", "Dirección", "Departamento · provincia · distrito", "Zona", "Rubro", "Condición de pago",
    "Línea de crédito (US$)", "Agente de retención", "Vendedor", "Estado",
  ];
  hoja.columns = [10, 38, 24, 16, 24, 14, 14, 26, 36, 30, 16, 18, 16, 14, 12, 18, 12].map((width) => ({ width }));
  hoja.getCell("A1").value = `Clientes · ${EMPRESA}`;
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: AZUL } };
  hoja.getCell("A2").value = d.descripcion;
  hoja.getCell("A2").font = { size: 12, color: { argb: GRIS } };
  hoja.getCell("A3").value = `${d.filas.length.toLocaleString("es-PE")} ${d.filas.length === 1 ? "cliente" : "clientes"}`;
  hoja.getCell("A3").font = { bold: true };

  const cab = hoja.getRow(FILA);
  titulos.forEach((t, i) => {
    const c = cab.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: BLANCO } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  cab.height = 30;

  d.filas.forEach((f, i) => {
    const r = hoja.getRow(FILA + 1 + i);
    r.values = [
      f.codigo,
      f.razon_social,
      f.nombre_comercial ?? "",
      documento(f.tipo_documento, f.numero_documento),
      f.contacto ?? "",
      f.telefono ?? f.contacto_telefono ?? "",
      f.whatsapp ?? "",
      f.email ?? f.contacto_email ?? "",
      f.direccion ?? "",
      f.ubigeo_nombre ?? "",
      f.zona_nombre ?? "",
      f.rubro_nombre ?? "",
      condicion(f.condicion_pago, f.dias_credito),
      Number(f.linea_credito ?? 0),
      f.agente_retencion ? "Sí" : "No",
      f.vendedor_nombre ?? "",
      !f.activo ? "Desactivado" : f.bloqueado ? "Bloqueado" : "Activo",
    ];
    r.getCell(14).numFmt = "#,##0.00";
    if (!f.activo || f.bloqueado) r.font = { italic: true, color: { argb: GRIS } };
  });
  if (d.filas.length > 0) {
    hoja.autoFilter = { from: { row: FILA, column: 1 }, to: { row: FILA + d.filas.length, column: titulos.length } };
  } else {
    hoja.getCell(`A${FILA + 1}`).value = "Ningún cliente con estos filtros.";
  }
  if (d.truncado) hoja.getCell(`A${FILA + d.filas.length + 2}`).value = NOTA_TOPE;

  const datos = await wb.xlsx.writeBuffer();
  return { libro: Buffer.from(datos as ArrayBuffer), archivo: d.archivo("xlsx") };
}

export async function pdfClientes(filtros: FiltrosClientes): Promise<{ pdf: ArrayBuffer; archivo: string }> {
  const d = await reunir(filtros);
  const credito = d.filas.filter((f) => f.condicion_pago === "credito").length;
  const doc = await armarListadoPdf({
    titulo: "Clientes",
    empresa: EMPRESA,
    subtitulo: d.descripcion,
    resumen: [
      { etiqueta: "Clientes", valor: d.filas.length.toLocaleString("es-PE") },
      { etiqueta: "A crédito", valor: String(credito) },
      { etiqueta: "Al contado", valor: String(d.filas.length - credito) },
    ],
    columnas: [
      { titulo: "Código", ancho: 18 },
      { titulo: "Razón social" },
      { titulo: "Documento", ancho: 30 },
      { titulo: "Contacto", ancho: 36 },
      { titulo: "Teléfono", ancho: 26 },
      { titulo: "Correo", ancho: 44 },
      { titulo: "Zona", ancho: 26 },
      { titulo: "Rubro", ancho: 28 },
      { titulo: "Condición", ancho: 26 },
    ],
    filas: d.filas.map((f) => [
      f.codigo,
      !f.activo ? `${f.razon_social} (desactivado)` : f.bloqueado ? `${f.razon_social} (bloqueado)` : f.razon_social,
      documento(f.tipo_documento, f.numero_documento),
      f.contacto ?? "",
      f.telefono ?? f.whatsapp ?? f.contacto_telefono ?? "",
      f.email ?? f.contacto_email ?? "",
      f.zona_nombre ?? "",
      f.rubro_nombre ?? "",
      condicion(f.condicion_pago, f.dias_credito),
    ]),
    nota: d.filas.length === 0 ? "Ningún cliente con estos filtros." : d.truncado ? NOTA_TOPE : undefined,
  });
  return { pdf: doc.output("arraybuffer"), archivo: d.archivo("pdf") };
}
