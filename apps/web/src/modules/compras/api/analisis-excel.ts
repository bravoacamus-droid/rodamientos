import "server-only";

import type { LineaAnalisis } from "../dominio/analisis";

/**
 * El análisis de importación, de vuelta a SU hoja de Excel.
 *
 * Luis, 02/10: *«también podemos ponerlo aparte que se guarda puede exportar
 * en excel»*. Sale con sus columnas A–R, sus títulos y su bloque de abajo,
 * y con FÓRMULAS, no con números pegados: si Willy cambia una cantidad en el
 * Excel, se recalcula igual que en el ERP. Es la hoja que él ya sabe usar.
 *
 * Lo que se corrige respecto a la suya, a propósito:
 *
 *   · El $/kg no va escrito a mano en cada fila (`=+F2+10.15*H2`): las filas
 *     apuntan a UNA celda, que lo calcula como él —DHL ÷ peso, cortado a dos
 *     decimales (`ROUNDDOWN`)—. Cambia el DHL o un peso y cambia todo.
 *   · El $/kg lleva el DHL Y el desaduanaje (Willy, 02/10: *«DHL +
 *     desaduanaje ÷ peso total, cortado a 2 decimales»*), así que el PU LIMA
 *     y la K —TOT. PM ÷ costo total, el sentido de su F41— ya lo incluyen.
 *   · El W. REAL del pedido es ×1.1 (en la suya, F39 tenía `=101*F38`).
 *
 * Se arma en el servidor: ExcelJS pesa cerca de un mega y en el navegador lo
 * pagaría cualquiera que abra el ERP.
 */

export interface DatosExcelAnalisis {
  numero: string | null;
  proveedor: string | null;
  referencia: string;
  fecha: string;
  costoEnvio: number;
  desaduanajeSoles: number;
  tipoCambio: number;
  lineas: Pick<
    LineaAnalisis,
    | "cliente"
    | "frecuencia"
    | "codigo"
    | "marca"
    | "cantidadRef"
    | "precioFob"
    | "pesoKg"
    | "cantidadPedido"
    | "precioMercado"
    | "proveedorMercado"
  >[];
}

/** Sus títulos, literales (fila 1 de su hoja). */
export const TITULOS_HOJA = [
  "CLIENTE", "f", "CODIGO", "MARCA", "CANT.Ref", "Price FOB $", "PARC.$", "PESO U(Kg.)",
  "PESO PARC.", "CANT. PEDIDO", "$PARC", "PESO PED.(Kg)", "PU LIMA $", "TOT. $", "P.M",
  "TOT. PM", "PROV.", "%",
] as const;

// Los colores de su hoja: amarillo lo que pide, verde el mercado.
const AMARILLO = "FFFFF2CC";
const VERDE = "FFE2EFDA";
const AZUL = "FFDDEBF7";
const GRIS = "FFF2F2F2";

export async function libroAnalisis(d: DatosExcelAnalisis): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  const ws = wb.addWorksheet("Análisis", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });

  const n = d.lineas.length;
  const primera = 2;
  const ultima = primera + Math.max(n, 1) - 1;
  const filaTotal = ultima + 1;
  const rango = (col: string) => `${col}${primera}:${col}${ultima}`;

  // El bloque de abajo, como su D34–F41. Se fijan las filas antes de escribir
  // las de producto, porque el PU LIMA apunta a la celda del $/kg.
  const b = filaTotal + 3;
  const F = {
    cabecera: b,
    fob: b + 1,
    dhl: b + 2,
    desSoles: b + 3,
    tc: b + 4,
    des: b + 5,
    costo: b + 6,
    pm: b + 7,
    wTot: b + 8,
    wReal: b + 9,
    porKg: b + 10,
    k: b + 11,
  };
  // Fija ($E$n): se usa en todas las filas de producto.
  const porKg = "$E$" + F.porKg;

  // ---------------------------------------------------------------- títulos
  ws.addRow([...TITULOS_HOJA]);
  const titulos = ws.getRow(1);
  titulos.font = { bold: true };
  titulos.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  titulos.height = 30;

  // ------------------------------------------------------------ productos
  d.lineas.forEach((l, i) => {
    const r = primera + i;
    ws.getRow(r).values = [
      l.cliente || null,
      l.frecuencia,
      l.codigo,
      l.marca || null,
      l.cantidadRef,
      l.precioFob,
      { formula: `E${r}*F${r}` },
      l.pesoKg,
      { formula: `E${r}*H${r}` },
      l.cantidadPedido,
      { formula: `J${r}*F${r}` },
      { formula: `J${r}*H${r}` },
      // FOB + peso × $/kg, y el $/kg lleva DHL y desaduanaje (Willy, 02/10).
      { formula: `F${r}+${porKg}*H${r}` },
      { formula: `M${r}*J${r}` },
      l.precioMercado || null,
      { formula: `O${r}*J${r}` },
      l.proveedorMercado || null,
      // Su «%»: mercado ÷ PU Lima. Vacío sin precio de mercado.
      { formula: `IF(O${r}>0,O${r}/M${r},"")` },
    ];
  });

  // --------------------------------------------------- su fila de totales
  const tot = ws.getRow(filaTotal);
  tot.getCell("A").value = "TOTALES";
  for (const col of ["E", "G", "I", "J", "K", "L", "N", "P"]) {
    tot.getCell(col).value = { formula: `SUM(${rango(col)})` };
  }
  tot.font = { bold: true };

  // ------------------------------------------------------ el bloque de abajo
  const fila = (r: number, etiqueta: string, ref: unknown, ped: unknown, nota?: string) => {
    const x = ws.getRow(r);
    x.getCell("D").value = etiqueta;
    x.getCell("E").value = ref as never;
    x.getCell("F").value = ped as never;
    if (nota) x.getCell("G").value = nota;
    x.getCell("D").font = { bold: true };
  };
  fila(F.cabecera, "", "CANT. REF", "CANT. PEDIDO");
  ws.getRow(F.cabecera).font = { bold: true };
  fila(F.fob, "TOT. FOB $", { formula: `G${filaTotal}` }, { formula: `K${filaTotal}` });
  // Lo de lo pedido: su peso × $/kg, partido entre DHL y desaduanaje en la
  // proporción de la carga. Sin desaduanaje, el de su hoja (peso × 10.15).
  const reparto = `(E${F.dhl}+E${F.des})`;
  fila(
    F.dhl,
    "DHL $",
    d.costoEnvio,
    { formula: `IF(${reparto}>0,${porKg}*F${F.wTot}*E${F.dhl}/${reparto},0)` },
    "Lo que pides: su parte por peso",
  );
  fila(F.desSoles, "DESADUANAJE S/", d.desaduanajeSoles, { formula: `E${F.desSoles}` }, "Estimado, en soles");
  fila(F.tc, "TIPO DE CAMBIO", d.tipoCambio || null, { formula: `E${F.tc}` });
  fila(
    F.des,
    "DESADUANAJE $",
    { formula: `IF(E${F.tc}>0,E${F.desSoles}/E${F.tc},0)` },
    { formula: `IF(${reparto}>0,${porKg}*F${F.wTot}*E${F.des}/${reparto},0)` },
    "Soles ÷ tipo de cambio; lo que pides, su parte por peso",
  );
  fila(
    F.costo,
    "COSTO TOTAL $",
    { formula: `E${F.fob}+E${F.dhl}+E${F.des}` },
    // Los PU ya llevan DHL y desaduanaje: es la suma de los TOT. $.
    { formula: `N${filaTotal}` },
    "FOB + DHL + desaduanaje",
  );
  fila(F.pm, "TOT. PM $", { formula: `SUMPRODUCT(${rango("E")},${rango("O")})` }, { formula: `P${filaTotal}` });
  fila(F.wTot, "W. TOT (Kg)", { formula: `I${filaTotal}` }, { formula: `L${filaTotal}` });
  fila(F.wReal, "W. REAL (Kg)", { formula: `1.1*E${F.wTot}` }, { formula: `1.1*F${F.wTot}` }, "El peso más un 10 %");
  // Willy, 02/10: «DHL + desaduanaje ÷ peso total, cortado a 2 decimales».
  // Sin desaduanaje, su 10.15 (1039 ÷ 102.3054 = 10.1559).
  fila(
    F.porKg,
    "$/Kg.",
    { formula: `IF(E${F.wTot}>0,ROUNDDOWN(${reparto}/E${F.wTot},2),0)` },
    { formula: `E${F.porKg}` },
    "(DHL + desaduanaje) ÷ peso de lo cotizado, a dos decimales",
  );
  fila(
    F.k,
    "K",
    { formula: `IF(E${F.costo}>0,E${F.pm}/E${F.costo},"")` },
    { formula: `IF(F${F.costo}>0,F${F.pm}/F${F.costo},"")` },
    "TOT. PM ÷ costo total",
  );
  ws.getRow(F.k).font = { bold: true, size: 12 };

  // Quién y qué, debajo del bloque.
  const info = F.k + 2;
  ws.getCell(`D${info}`).value = "PROVEEDOR";
  ws.getCell(`E${info}`).value = d.proveedor ?? "";
  ws.getCell(`D${info + 1}`).value = "PROFORMA";
  ws.getCell(`E${info + 1}`).value = d.referencia || "";
  ws.getCell(`D${info + 2}`).value = "FECHA";
  ws.getCell(`E${info + 2}`).value = d.fecha.split("-").reverse().join("/");
  if (d.numero) {
    ws.getCell(`D${info + 3}`).value = "ANÁLISIS";
    ws.getCell(`E${info + 3}`).value = d.numero;
  }
  for (let r = info; r <= info + 3; r++) ws.getCell(`D${r}`).font = { bold: true };

  // ------------------------------------------------------------- formato
  const anchos = [14, 5, 18, 9, 9, 12, 11, 11, 11, 11, 11, 12, 11, 12, 10, 12, 14, 8];
  anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const formato: Record<string, string> = {
    // El FOB con cuatro decimales: en la suya, `$#,##0.00` escondía el 3.144.
    F: "#,##0.0000",
    G: "#,##0.00",
    H: "0.00000",
    I: "0.000",
    K: "#,##0.000",
    L: "0.000",
    M: "#,##0.00",
    N: "#,##0.00",
    O: "#,##0.00",
    P: "#,##0.00",
    R: "0.00",
  };
  for (let r = primera; r <= filaTotal; r++) {
    for (const [col, fmt] of Object.entries(formato)) ws.getCell(`${col}${r}`).numFmt = fmt;
  }
  for (let r = F.fob; r <= F.k; r++) {
    for (const col of ["E", "F"]) {
      ws.getCell(`${col}${r}`).numFmt =
        r === F.wTot || r === F.wReal || r === F.tc ? "0.000" : "#,##0.00";
    }
  }

  const pintar = (col: string, desde: number, hasta: number, color: string) => {
    for (let r = desde; r <= hasta; r++) {
      ws.getCell(`${col}${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    }
  };
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) pintar(col, 1, 1, GRIS);
  for (const col of ["J", "K", "L"]) pintar(col, 1, filaTotal, AMARILLO);
  for (const col of ["M", "N"]) pintar(col, 1, filaTotal, AZUL);
  for (const col of ["O", "P", "Q", "R"]) pintar(col, 1, filaTotal, VERDE);
  pintar("F", F.cabecera, F.k, AMARILLO);

  const borde = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
  for (let r = 1; r <= filaTotal; r++) {
    for (let c = 1; c <= 18; c++) {
      ws.getRow(r).getCell(c).border = { top: borde, left: borde, bottom: borde, right: borde };
    }
  }
  for (let r = F.cabecera; r <= F.k; r++) {
    for (const col of ["D", "E", "F"]) {
      ws.getCell(`${col}${r}`).border = { top: borde, left: borde, bottom: borde, right: borde };
    }
  }

  const datos = await wb.xlsx.writeBuffer();
  return Buffer.from(datos as ArrayBuffer);
}
