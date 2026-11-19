"use server";

import { z } from "zod";
import { perfilActual } from "@rodatech/db/servidor";

/**
 * La hoja de conteo en Excel, tal como está en pantalla (19/11).
 *
 * Luis: *«al terminar, en ajustes de inventario, lo que me traiga, o también
 * dinámico con los filtros, pueda exportarlo por Excel y PDF»*. Lo que se
 * baja son las líneas QUE SE VEN —con el filtro de la hoja puesto—, con lo
 * contado hasta ese momento. Sin contar, sirve de hoja para imprimir y
 * llevar al almacén: la columna «Contado» sale en blanco.
 *
 * No lee la base: formatea lo que manda la pantalla, que es lo que hay en
 * ella. Aun así es un endpoint público, así que pide el mismo rol que el
 * cuadre y pone tope y forma a lo que recibe.
 */

const ROLES = ["gerencia", "admin"] as const;

const texto = (max: number) => z.string().max(max).catch("");
const numero = z.coerce.number().finite().catch(0);

const esquema = z.object({
  descripcion: texto(300),
  lineas: z
    .array(
      z.object({
        codigo: texto(80),
        descripcion: texto(300),
        marca: texto(80),
        subfamilia: texto(120),
        unidad: texto(10),
        cantidadSistema: numero,
        cantidadFisica: z.coerce.number().finite().nullable().catch(null),
        costoUnitario: numero,
      }),
    )
    .max(3000),
});

export async function excelDeLaHoja(
  entrada: unknown,
): Promise<{ ok: true; base64: string; archivo: string } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Sesión expirada." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "El cuadre de inventario está restringido a Gerencia." };
  }
  const datos = esquema.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "La hoja no se pudo leer. Recarga la página y vuelve a intentarlo." };
  const { lineas, descripcion } = datos.data;

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();

  const DINERO = '"$ "#,##0.00;[Red]-"$ "#,##0.00';
  const CANTIDAD = "#,##0.##;[Red]-#,##0.##";
  const AZUL = "FF0E4C73";
  const GRIS = "FF66717F";
  const BLANCO = "FFFFFFFF";

  const FILA = 4;
  const hoja = wb.addWorksheet("Hoja de conteo", {
    views: [{ state: "frozen", ySplit: FILA, xSplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const titulos = [
    ["Código", 18],
    ["Descripción", 46],
    ["Marca", 14],
    ["Subfamilia", 22],
    ["Unidad", 8],
    ["Sistema", 10],
    ["Contado", 10],
    ["Diferencia", 11],
    ["Costo unitario", 13],
    ["Impacto", 13],
  ] as const;
  hoja.columns = titulos.map(([, ancho]) => ({ width: ancho }));

  const hoy = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "long" }).format(new Date());
  hoja.getCell("A1").value = "Hoja de conteo · Inversiones Rodatech E.I.R.L.";
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: AZUL } };
  hoja.getCell("A2").value = `${descripcion ? `${descripcion} · ` : ""}${lineas.length} productos · al ${hoy} · costos en dólares, sin IGV`;
  hoja.getCell("A2").font = { size: 12, color: { argb: GRIS } };

  const cab = hoja.getRow(FILA);
  titulos.forEach(([t], i) => {
    const c = cab.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: BLANCO } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  });

  lineas.forEach((l, i) => {
    const n = FILA + 1 + i;
    const fila = hoja.getRow(n);
    fila.values = [
      l.codigo,
      l.descripcion,
      l.marca,
      l.subfamilia,
      l.unidad,
      l.cantidadSistema,
      l.cantidadFisica ?? "",
    ];
    // Diferencia e impacto como FÓRMULAS: si se imprime en blanco y se
    // rellena en Excel, se calculan solas.
    fila.getCell(8).value = { formula: `IF(G${n}="","",G${n}-F${n})` };
    fila.getCell(9).value = l.costoUnitario > 0 ? l.costoUnitario : "";
    fila.getCell(10).value = { formula: `IF(OR(H${n}="",I${n}=""),"",H${n}*I${n})` };
    for (const k of [6, 7, 8]) fila.getCell(k).numFmt = CANTIDAD;
    for (const k of [9, 10]) fila.getCell(k).numFmt = DINERO;
  });

  const ultima = FILA + lineas.length;
  if (lineas.length > 0) {
    hoja.autoFilter = { from: { row: FILA, column: 1 }, to: { row: ultima, column: titulos.length } };
    const total = hoja.getRow(ultima + 2);
    total.getCell(1).value = "Impacto neto de lo filtrado";
    total.getCell(1).font = { bold: true };
    total.getCell(10).value = { formula: `SUBTOTAL(109,J${FILA + 1}:J${ultima})` };
    total.getCell(10).numFmt = DINERO;
    total.getCell(10).font = { bold: true };
  }

  const buffer = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  const fecha = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  return { ok: true, base64: buffer.toString("base64"), archivo: `Hoja de conteo ${fecha}.xlsx` };
}
