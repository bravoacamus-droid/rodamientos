import "server-only";

import { armarListadoPdf } from "@/lib/pdf-listado";

import { describirFiltrosClientes } from "../dominio/filtros";
import type { FiltrosClientes } from "../dominio/tipos";
import {
  clientesParaExportar,
  directorioParaExportar,
  nombresDeFiltrosClientes,
  TOPE_CLIENTES,
  type ContactoDirectorio,
} from "./consultas";

/**
 * La cartera de clientes en Excel y en PDF, con los filtros de la lista
 * (26/11). Luis: *«no se puede exportar ni por PDF ni por Excel todos los
 * clientes que tengo… tiene que ser siempre dinámico»*: se baja lo que se ve
 * filtrado —distrito, zona, rubro, condición, búsqueda—, entero y no solo la
 * página.
 *
 * Y con una segunda hoja, DIRECTORIO (26/11): una fila por PERSONA, como el
 * Excel que lleva Willy —EMPRESA · DISTRITO · ZONA · CONTACTO · CARGO ·
 * TELÉFONO · FIJO · CORREO—. Luis: *«ahí abajo, otra ventana… más desglosado,
 * sobre todo los contactos de la empresa del cliente, así bonito con los
 * datos»*.
 */

const EMPRESA = "Inversiones Rodatech E.I.R.L.";
const NOTA_TOPE = `Se cortó en ${TOPE_CLIENTES.toLocaleString("es-PE")} clientes. Filtra por distrito o rubro para bajar el resto.`;

const condicion = (c: string, dias: number) => (c === "credito" ? `Crédito ${dias} días` : "Contado");
const documento = (tipo: string, numero: string | null) => (numero ? `${tipo} ${numero}` : tipo === "SIN_DOC" ? "Sin documento" : tipo);

async function reunir(filtros: FiltrosClientes) {
  const [lista, nombres, directorio] = await Promise.all([
    clientesParaExportar(filtros),
    nombresDeFiltrosClientes(filtros),
    directorioParaExportar(filtros),
  ]);
  if (!lista.ok) throw new Error(lista.error);
  if (!directorio.ok) throw new Error(directorio.error);
  const quien = [nombres.zona, nombres.subzona, nombres.rubro]
    .filter(Boolean)
    .join(" ")
    .replace(/[^\p{L}\p{N} .-]/gu, "")
    .slice(0, 50);
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  return {
    ...lista.datos,
    directorio: directorio.datos,
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
    "Correo", "Dirección", "Departamento · provincia · distrito", "Distrito", "Zona", "Rubro", "Condición de pago",
    "Línea de crédito (US$)", "Agente de retención", "Vendedor", "Estado",
  ];
  hoja.columns = [10, 38, 24, 16, 24, 14, 14, 26, 36, 30, 18, 16, 18, 16, 14, 12, 18, 12].map((width) => ({ width }));
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
      f.subzona_nombre ?? "",
      f.rubro_nombre ?? "",
      condicion(f.condicion_pago, f.dias_credito),
      Number(f.linea_credito ?? 0),
      f.agente_retencion ? "Sí" : "No",
      f.vendedor_nombre ?? "",
      !f.activo ? "Desactivado" : f.bloqueado ? "Bloqueado" : "Activo",
    ];
    r.getCell(15).numFmt = "#,##0.00";
    if (!f.activo || f.bloqueado) r.font = { italic: true, color: { argb: GRIS } };
  });
  if (d.filas.length > 0) {
    hoja.autoFilter = { from: { row: FILA, column: 1 }, to: { row: FILA + d.filas.length, column: titulos.length } };
  } else {
    hoja.getCell(`A${FILA + 1}`).value = "Ningún cliente con estos filtros.";
  }
  if (d.truncado) hoja.getCell(`A${FILA + d.filas.length + 2}`).value = NOTA_TOPE;

  hojaDirectorio(wb, d.directorio, d.descripcion, d.filas.length);

  const datos = await wb.xlsx.writeBuffer();
  return { libro: Buffer.from(datos as ArrayBuffer), archivo: d.archivo("xlsx") };
}

/**
 * La hoja DIRECTORIO: una persona por fila, agrupada por empresa.
 *
 * Las columnas, en el orden del Excel de Willy, con lo que el ERP sabe además
 * (área, WhatsApp, rubro, documento) al final para no estorbar. Las empresas
 * se alternan en fondo blanco y gris claro: con cuatro personas de MODIPSA
 * seguidas, es lo que deja ver dónde empieza la siguiente. El correo es un
 * enlace: un clic y abre el correo nuevo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hojaDirectorio(wb: any, gente: ContactoDirectorio[], descripcion: string, clientes: number) {
  const AZUL = "FF0E4C73";
  const GRIS = "FF66717F";
  const BLANCO = "FFFFFFFF";
  const BANDA = "FFEEF3F8";
  const LINEA = "FFD5DCE4";
  const FILA = 5;

  const hoja = wb.addWorksheet("Directorio", {
    views: [{ state: "frozen", ySplit: FILA, xSplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    properties: { tabColor: { argb: AZUL } },
  });
  const titulos = [
    "Empresa", "Distrito", "Zona", "Contacto", "Cargo", "Celular", "Fijo", "Correo",
    "Área", "WhatsApp", "Principal", "Rubro", "Documento",
  ];
  hoja.columns = [34, 18, 16, 28, 24, 14, 18, 32, 16, 14, 10, 18, 16].map((width: number) => ({ width }));

  const empresas = new Set(gente.map((g) => g.empresa)).size;
  hoja.getCell("A1").value = `Directorio de contactos · ${EMPRESA}`;
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: AZUL } };
  hoja.getCell("A2").value = descripcion;
  hoja.getCell("A2").font = { size: 12, color: { argb: GRIS } };
  const sinGente = clientes - empresas;
  hoja.getCell("A3").value =
    `${gente.length.toLocaleString("es-PE")} ${gente.length === 1 ? "contacto" : "contactos"} de ` +
    `${empresas.toLocaleString("es-PE")} ${empresas === 1 ? "empresa" : "empresas"}` +
    (sinGente > 0 ? ` · ${sinGente.toLocaleString("es-PE")} sin contactos todavía` : "");
  hoja.getCell("A3").font = { bold: true };

  const cab = hoja.getRow(FILA);
  titulos.forEach((t, i) => {
    const c = cab.getCell(i + 1);
    c.value = t.toUpperCase();
    c.font = { bold: true, color: { argb: BLANCO } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  cab.height = 26;

  let banda = false;
  let anterior = "";
  gente.forEach((g, i) => {
    if (g.empresa !== anterior) {
      banda = !banda;
      anterior = g.empresa;
    }
    const r = hoja.getRow(FILA + 1 + i);
    r.values = [
      g.empresa,
      g.distrito ?? "",
      g.zona ?? "",
      g.nombre,
      g.cargo ?? "",
      g.celular ?? "",
      g.fijo ?? "",
      g.correo ?? "",
      g.area ?? "",
      g.whatsapp ?? "",
      g.principal ? "Sí" : "",
      g.rubro ?? "",
      g.documento ?? "",
    ];
    r.eachCell({ includeEmpty: true }, (c: { fill: unknown; border: unknown }, col: number) => {
      if (col > titulos.length) return;
      if (!banda) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDA } };
      c.border = { bottom: { style: "hair", color: { argb: LINEA } } };
    });
    r.getCell(1).font = { bold: true };
    // Los teléfonos como texto: «4595152 - 207» no es un número, y un celular
    // como número pierde el formato al copiarlo.
    r.getCell(6).numFmt = "@";
    r.getCell(7).numFmt = "@";
    if (g.correo) {
      r.getCell(8).value = { text: g.correo, hyperlink: `mailto:${g.correo}` };
      r.getCell(8).font = { color: { argb: "FF1D5FA8" }, underline: true };
    }
  });

  if (gente.length > 0) {
    hoja.autoFilter = { from: { row: FILA, column: 1 }, to: { row: FILA + gente.length, column: titulos.length } };
  } else {
    hoja.getCell(`A${FILA + 1}`).value = "Ningún contacto en los clientes de este filtro.";
  }
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
      { titulo: "Distrito y zona", ancho: 34 },
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
      [f.zona_nombre, f.subzona_nombre].filter(Boolean).join(" · "),
      f.rubro_nombre ?? "",
      condicion(f.condicion_pago, f.dias_credito),
    ]),
    // El directorio también en el PDF, debajo: una persona por fila.
    secciones: [
      {
        titulo: `Directorio de contactos (${d.directorio.length.toLocaleString("es-PE")})`,
        columnas: [
          { titulo: "Empresa" },
          { titulo: "Distrito", ancho: 26 },
          { titulo: "Zona", ancho: 24 },
          { titulo: "Contacto", ancho: 38 },
          { titulo: "Cargo", ancho: 32 },
          { titulo: "Celular", ancho: 22 },
          { titulo: "Fijo", ancho: 26 },
          { titulo: "Correo", ancho: 46 },
        ],
        filas: d.directorio.map((g) => [
          g.empresa,
          g.distrito ?? "",
          g.zona ?? "",
          g.principal ? `${g.nombre} (principal)` : g.nombre,
          g.cargo ?? "",
          g.celular ?? "",
          g.fijo ?? "",
          g.correo ?? "",
        ]),
      },
    ],
    nota: d.filas.length === 0 ? "Ningún cliente con estos filtros." : d.truncado ? NOTA_TOPE : undefined,
  });
  return { pdf: doc.output("arraybuffer"), archivo: d.archivo("pdf") };
}
