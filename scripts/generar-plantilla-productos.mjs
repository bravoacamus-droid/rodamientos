/**
 * Genera la plantilla de carga del maestro de productos.
 *
 * Parte de docs/taxonomia.json (que produce importar-estructura.mjs), así que
 * las listas SIEMPRE son el árbol real del cliente. Si él manda una versión
 * nueva de su Excel, se corre el importador y luego este, y la plantilla queda
 * al día sola.
 *
 * Decisiones de diseño, todas orientadas a que la llene el dueño y no un
 * capturista:
 *
 *   1. UNA FILA POR PRODUCTO. El archivo original de Willy mezcla el árbol de
 *      clasificación con los productos y usa celdas combinadas: para leerlo
 *      hay que arrastrar hacia abajo la familia y la subfamilia. Eso está muy
 *      bien para consultar y muy mal para capturar. Aquí cada fila se explica
 *      sola.
 *   2. LOS TRES NIVELES SON DESPLEGABLES EN CASCADA. Al elegir la familia, la
 *      subfamilia se limita a las suyas; al elegir la subfamilia, la
 *      descripción se limita a las de esa subfamilia. No se puede tipear mal
 *      un nivel, que es de donde salen los catálogos con 40 familias.
 *   3. EL P.V. SE CALCULA SOLO. En las 7 filas reales del cliente el precio de
 *      venta es exactamente el costo x 1.20. La columna trae la fórmula puesta:
 *      él tipea el costo y ya. Puede escribir encima cuando el producto sea la
 *      excepción.
 *   4. LOS CÓDIGOS REPETIDOS SE PINTAN SOLOS. Como el código es lo único que
 *      distingue dos productos de la misma descripción, duplicarlo es EL error
 *      caro. La columna se pinta de rojo en el momento.
 *
 *     node scripts/generar-plantilla-productos.mjs
 */

import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const ORIGEN = "docs/taxonomia.json";
const SALIDA = "docs/plantillas/Rodatech - Maestro de productos.xlsx";
const FILAS = 200; // capacidad de la plantilla; más de esto, se manda otra tanda

// Marcas del maestro (007_seed_maestros). La validación es de aviso, no de
// bloqueo: si aparece una marca nueva, que la escriba y el importador la crea.
const MARCAS = [
  "SKF", "FAG", "NTN", "NSK", "KOYO", "TIMKEN", "INA", "NACHI", "URB",
  "ASAHI", "NBR", "CRAFT", "DODGE", "REXNORD", "SIN MARCA",
];

const BRAND = "FF0E4C73"; // azul Rodatech
const ACENTO = "FFF2E307";
const GRIS = "FFF2F4F7";

/** Nombre válido para un rango con nombre de Excel. */
const aNombreRango = (s) =>
  s
    .normalize("NFD")
    .replace(new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g"), "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

/**
 * La validación en cascada resuelve el nombre del rango con
 * `INDIRECT(SUBSTITUTE(SUBSTITUTE(celda," ","_"),".","_"))`, o sea que Excel
 * solo sabe cambiar ESPACIOS y PUNTOS. `aNombreRango` en cambio cambia
 * cualquier símbolo. Mientras los nombres del cliente sean letras, espacios y
 * puntos las dos coinciden; el día que aparezca una subfamilia con guión o con
 * paréntesis dejarían de coincidir y el desplegable se quedaría vacío SIN
 * avisar. Por eso se comprueba aquí y revienta.
 */
function verificarNombresResolubles(familias) {
  const comoLoHaceExcel = (s) => s.toUpperCase().split(" ").join("_").split(".").join("_");
  const malos = [];
  const revisar = (nombre) => {
    if (comoLoHaceExcel(nombre) !== aNombreRango(nombre)) malos.push(nombre);
  };
  for (const f of familias) {
    revisar(f.nombre);
    for (const s of f.subfamilias) revisar(s.nombre);
  }
  if (malos.length > 0) {
    throw new Error(
      "Estos nombres traen símbolos que la fórmula de Excel no sabe convertir, " +
        "así que su desplegable saldría vacío:\n  - " +
        malos.join("\n  - ") +
        "\nO se limpian en el origen, o hay que ampliar el SUBSTITUTE de la validación.",
    );
  }
}

const main = async () => {
  const { familias, productos } = JSON.parse(readFileSync(ORIGEN, "utf8"));
  verificarNombresResolubles(familias);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date(2026, 7, 21);

  // =====================================================================
  // Hoja 1 · INSTRUCCIONES
  // =====================================================================
  const ins = wb.addWorksheet("Instrucciones", {
    properties: { tabColor: { argb: BRAND } },
  });
  ins.getColumn(1).width = 4;
  ins.getColumn(2).width = 104;

  const texto = [
    ["t", "Maestro de productos · Rodatech"],
    ["p", "Llene la hoja PRODUCTOS. Una fila por cada artículo que vende."],
    ["", ""],
    ["h", "Cómo llenar cada columna"],
    ["l", "CODIGO — el código del fabricante, tal cual viene en la caja. Es lo único que distingue dos productos que se llaman igual, así que no puede repetirse. Si repite uno, la celda se pinta de rojo sola."],
    ["l", "FAMILIA / SUB-FAMILIA / DESCRIPCION — se eligen de la lista, no se escriben. Al elegir la familia, la sub-familia solo le va a ofrecer las que corresponden, y lo mismo con la descripción."],
    ["l", "MARCA — elija de la lista. Si su marca no está, escríbala igual: el sistema la da de alta al importar."],
    ["l", "STOCK ACTUAL — cuántas unidades tiene hoy en almacén."],
    ["l", "STOCK MINIMO — desde cuántas unidades quiere que el sistema le avise que hay que reponer."],
    ["l", "P.C. $ — lo que a usted le cuesta, en dólares."],
    ["l", "P.V. $ — YA VIENE CALCULADO: es el P.C. por 1.20, que es como lo tiene armado hoy. Si un producto es la excepción, escriba el valor encima y listo."],
    ["l", "P.M. $ — el precio más bajo que acepta para ese producto. Es el piso: el sistema no va a dejar cotizar por debajo."],
    ["", ""],
    ["h", "Lo que NO tiene que hacer"],
    ["l", "No agregue ni quite columnas, ni cambie el orden."],
    ["l", "No combine celdas. En su archivo la familia estaba combinada hacia abajo; aquí cada fila se repite y está bien así."],
    ["l", "No borre la hoja LISTAS, que es de donde salen los desplegables."],
    ["", ""],
    ["h", "¿Se le acabaron las filas?"],
    ["p", `La plantilla trae ${FILAS} filas. Si necesita más, mándenos esta tanda y le pasamos otra: es mejor cargar de a poco y ver que todo entró bien.`],
    ["", ""],
    ["h", "Las 3 primeras filas ya están llenas"],
    ["p", "Son ejemplos con sus propios productos, para que vea el formato. Bórrelas cuando ya no las necesite."],
  ];

  let f = 2;
  for (const [tipo, linea] of texto) {
    const c = ins.getCell(`B${f}`);
    c.value = linea;
    if (tipo === "t") {
      c.font = { name: "Calibri", size: 18, bold: true, color: { argb: BRAND } };
      ins.getRow(f).height = 26;
    } else if (tipo === "h") {
      c.font = { name: "Calibri", size: 12, bold: true, color: { argb: BRAND } };
      ins.getRow(f).height = 22;
    } else if (tipo === "l") {
      c.value = "•   " + linea;
      c.alignment = { wrapText: true, vertical: "top" };
      ins.getRow(f).height = 30;
    } else {
      c.alignment = { wrapText: true, vertical: "top" };
    }
    f += 1;
  }

  // =====================================================================
  // Hoja 3 · LISTAS  (se crea antes para poder nombrar los rangos)
  // =====================================================================
  const listas = wb.addWorksheet("LISTAS");

  // Columna A: las familias.
  listas.getCell("A1").value = "FAMILIAS";
  familias.forEach((fam, i) => {
    listas.getCell(`A${i + 2}`).value = fam.nombre;
  });
  wb.definedNames.add(`LISTAS!$A$2:$A$${familias.length + 1}`, "FAMILIAS");

  // A partir de la columna C, una columna por cada nodo con hijos. El rango de
  // cada nodo se llama como el nodo, para que la validación del hijo sea un
  // INDIRECT sobre la celda del padre.
  let col = 3;
  const columnaDe = (n) => listas.getColumn(n).letter;

  for (const fam of familias) {
    const letra = columnaDe(col);
    listas.getCell(`${letra}1`).value = fam.nombre;
    fam.subfamilias.forEach((s, i) => {
      listas.getCell(`${letra}${i + 2}`).value = s.nombre;
    });
    wb.definedNames.add(
      `LISTAS!$${letra}$2:$${letra}$${fam.subfamilias.length + 1}`,
      aNombreRango(fam.nombre),
    );
    col += 1;

    for (const sub of fam.subfamilias) {
      const l2 = columnaDe(col);
      listas.getCell(`${l2}1`).value = sub.nombre;
      sub.tipos.forEach((t, i) => {
        listas.getCell(`${l2}${i + 2}`).value = t.nombre;
      });
      wb.definedNames.add(
        `LISTAS!$${l2}$2:$${l2}$${sub.tipos.length + 1}`,
        aNombreRango(sub.nombre),
      );
      col += 1;
    }
  }

  // Marcas.
  const lMarca = columnaDe(col);
  listas.getCell(`${lMarca}1`).value = "MARCAS";
  MARCAS.forEach((m, i) => {
    listas.getCell(`${lMarca}${i + 2}`).value = m;
  });
  wb.definedNames.add(
    `LISTAS!$${lMarca}$2:$${lMarca}$${MARCAS.length + 1}`,
    "MARCAS",
  );

  listas.getRow(1).font = { bold: true, size: 9 };
  listas.getRow(1).alignment = { textRotation: 45 };
  for (let i = 1; i <= col; i += 1) listas.getColumn(i).width = 14;
  listas.state = "veryHidden";

  // =====================================================================
  // Hoja 2 · PRODUCTOS
  // =====================================================================
  const ws = wb.addWorksheet("PRODUCTOS", {
    properties: { tabColor: { argb: ACENTO } },
    views: [{ state: "frozen", ySplit: 1, xSplit: 1 }],
  });

  const COLS = [
    { h: "CODIGO", w: 20 },
    { h: "FAMILIA", w: 16 },
    { h: "SUB-FAMILIA", w: 30 },
    { h: "DESCRIPCION", w: 46 },
    { h: "MARCA", w: 12 },
    { h: "STOCK ACTUAL", w: 14 },
    { h: "STOCK MINIMO", w: 14 },
    { h: "P.C. $", w: 11 },
    { h: "P.V. $", w: 11 },
    { h: "P.M. $", w: 11 },
  ];
  COLS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.w;
    const celda = ws.getCell(1, i + 1);
    celda.value = c.h;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    celda.alignment = { horizontal: "center", vertical: "middle" };
    celda.border = { bottom: { style: "medium", color: { argb: ACENTO } } };
  });
  ws.getRow(1).height = 24;

  // Índice de los ejemplos por código, para poder rellenarlos.
  const ejemplos = productos.slice(0, 3);

  for (let r = 2; r <= FILAS + 1; r += 1) {
    const fila = ws.getRow(r);
    const ej = ejemplos[r - 2];

    if (ej) {
      fila.getCell(1).value = ej.codigo;
      fila.getCell(2).value = ej.familia;
      fila.getCell(3).value = ej.subfamilia;
      fila.getCell(4).value = ej.tipo;
      fila.getCell(5).value = ej.marca;
      fila.getCell(6).value = ej.stock;
      fila.getCell(7).value = ej.stockMinimo;
      fila.getCell(8).value = ej.precioCompra;
      fila.getCell(10).value = ej.precioMinimo;
    }

    // P.V.
    //
    // En las filas vacías va la FÓRMULA, para que el precio aparezca solo en
    // cuanto se teclea el costo.
    //
    // En las filas de ejemplo va el VALOR LITERAL del cliente. La diferencia
    // importa: de sus 7 productos, 6 cumplen ROUND(costo x 1.20, 2) al
    // céntimo, pero el 6205-2RS1/C3 tiene 3.92 donde la fórmula da 3.91. Es un
    // precio que él puso a mano. Si aquí se dejara la fórmula, Excel
    // recalcularía al abrir el archivo y le cambiaría su propio precio sin
    // avisar. Los ejemplos además enseñan justo eso: que se puede escribir
    // encima cuando el producto es la excepción.
    if (ej) {
      fila.getCell(9).value = ej.precioVenta;
    } else {
      fila.getCell(9).value = { formula: `IF(H${r}="","",ROUND(H${r}*1.2,2))`, result: "" };
    }

    // Validaciones en cascada.
    fila.getCell(2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ["=FAMILIAS"],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Familia no válida",
      error: "Elija una de la lista.",
    };
    fila.getCell(3).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`=INDIRECT(SUBSTITUTE($B${r}," ","_"))`],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Sub-familia no válida",
      error: "Primero elija la FAMILIA; después esta lista se llena sola.",
    };
    fila.getCell(4).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`=INDIRECT(SUBSTITUTE(SUBSTITUTE($C${r}," ","_"),".","_"))`],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Descripción no válida",
      error: "Primero elija la SUB-FAMILIA; después esta lista se llena sola.",
    };
    // La marca AVISA pero no bloquea: si es nueva, el importador la da de alta.
    fila.getCell(5).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ["=MARCAS"],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Marca nueva",
      error: "No está en la lista. Si es una marca nueva, acepte y siga.",
    };

    for (const c of [6, 7]) {
      fila.getCell(c).numFmt = "#,##0";
      fila.getCell(c).alignment = { horizontal: "right" };
    }
    for (const c of [8, 9, 10]) {
      fila.getCell(c).numFmt = '"$"#,##0.00';
      fila.getCell(c).alignment = { horizontal: "right" };
    }
    // El P.V. calculado va en gris, para que se lea que no hay que tipearlo.
    fila.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    fila.getCell(9).font = { color: { argb: "FF667085" } };
  }

  // Códigos repetidos, en rojo. Es EL error caro de este maestro.
  ws.addConditionalFormatting({
    ref: `A2:A${FILAS + 1}`,
    rules: [
      {
        type: "expression",
        formulae: [`AND($A2<>"",COUNTIF($A$2:$A$${FILAS + 1},$A2)>1)`],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } },
          font: { color: { argb: "FF9C0006" }, bold: true },
        },
      },
    ],
  });

  // P.M. por encima del P.V.: el piso nunca puede superar la lista.
  ws.addConditionalFormatting({
    ref: `J2:J${FILAS + 1}`,
    rules: [
      {
        type: "expression",
        formulae: [`AND($J2<>"",$I2<>"",$J2>$I2)`],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFE7BA" } },
          font: { color: { argb: "FF9C5700" }, bold: true },
        },
      },
    ],
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };

  mkdirSync("docs/plantillas", { recursive: true });
  await wb.xlsx.writeFile(SALIDA);

  const nTipos = familias.reduce(
    (a, f) => a + f.subfamilias.reduce((b, s) => b + s.tipos.length, 0),
    0,
  );
  console.log(`escrito ${SALIDA}`);
  console.log(
    `  ${FILAS} filas · listas: ${familias.length} familias, ` +
      `${familias.reduce((a, f) => a + f.subfamilias.length, 0)} subfamilias, ${nTipos} tipos`,
  );
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
