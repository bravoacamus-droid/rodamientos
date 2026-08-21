import { describe, expect, it } from "vitest";

import {
  aNumero,
  columnasQueFaltan,
  detectarCabecera,
  leerFilas,
  normalizarCabecera,
} from "./plantilla";

const CABECERA = [
  "CODIGO", "FAMILIA", "SUB-FAMILIA", "DESCRIPCION", "MARCA",
  "STOCK ACTUAL", "STOCK MINIMO", "P.C. $", "P.V. $", "P.M. $",
];

// Fila real del archivo del cliente.
const FILA_6205 = [
  "6205-2RS1/C3", "RODAMIENTO", "RIGIDO DE BOLAS",
  "RODAMIENTO RIGIDO DE BOLAS 1 HIL.", "SKF", "35", "8", "3.26", "3.92", "3.86",
];

describe("aNumero", () => {
  it("lee el punto decimal", () => {
    expect(aNumero("3.26")).toBe(3.26);
  });

  it("lee la coma decimal, que es como se teclea en Perú", () => {
    expect(aNumero("3,26")).toBe(3.26);
  });

  it("ignora el símbolo de moneda y los espacios", () => {
    expect(aNumero("$ 3.26")).toBe(3.26);
    expect(aNumero(" 34.43 ")).toBe(34.43);
  });

  it("separador de miles con punto y decimal con coma", () => {
    expect(aNumero("1.234,56")).toBe(1234.56);
  });

  it("separador de miles con coma y decimal con punto", () => {
    expect(aNumero("1,234.56")).toBe(1234.56);
  });

  it("con UN solo separador lo lee como decimal, que es la lectura segura", () => {
    // "1.234" es ambiguo de verdad: puede ser mil doscientos treinta y cuatro
    // o uno coma dos tres cuatro. Se elige decimal porque en este catálogo
    // todas las columnas de dinero llevan dos decimales, y confundir 1.234
    // con 1234 es un error de mil veces en el precio. Al revés, como mucho se
    // pierde un separador de miles que casi nadie teclea.
    expect(aNumero("1.234")).toBe(1.234);
    expect(aNumero("1,234")).toBe(1.234);
  });

  it("con DOS separadores no hay ambigüedad: el último es el decimal", () => {
    expect(aNumero("1.234,56")).toBe(1234.56);
    expect(aNumero("1,234.56")).toBe(1234.56);
  });

  it("devuelve null cuando no hay número, en vez de inventar un cero", () => {
    expect(aNumero("")).toBeNull();
    expect(aNumero("por definir")).toBeNull();
    expect(aNumero("-")).toBeNull();
  });

  it("acepta el cero de verdad", () => {
    expect(aNumero("0")).toBe(0);
  });
});

describe("normalizarCabecera", () => {
  it("quita tildes, signos y espacios", () => {
    expect(normalizarCabecera("P.C. $")).toBe("PC");
    expect(normalizarCabecera("SUB-FAMILIA")).toBe("SUBFAMILIA");
    expect(normalizarCabecera(" Descripción ")).toBe("DESCRIPCION");
  });
});

describe("detectarCabecera", () => {
  it("encuentra la cabecera en la primera fila", () => {
    const c = detectarCabecera([CABECERA, FILA_6205]);
    expect(c?.indice).toBe(0);
    expect(c?.mapa.codigo).toBe(0);
    expect(c?.mapa.precio_minimo).toBe(9);
  });

  it("la encuentra aunque alguien haya metido un título encima", () => {
    const c = detectarCabecera([
      ["MAESTRO DE PRODUCTOS 2026"],
      [],
      CABECERA,
      FILA_6205,
    ]);
    expect(c?.indice).toBe(2);
    expect(c?.mapa.tipo).toBe(3);
  });

  it("reconoce los nombres alternativos", () => {
    const c = detectarCabecera([
      ["CÓDIGO", "FAMILIA", "SUBFAMILIA", "DESCRIPCIÓN", "MARCA",
       "STOCK", "MÍNIMO", "COSTO", "PRECIO VENTA", "PRECIO MÍNIMO"],
    ]);
    expect(c).not.toBeNull();
    expect(c?.mapa.precio_compra).toBe(7);
  });

  it("aguanta que las columnas estén en otro orden", () => {
    const c = detectarCabecera([
      ["MARCA", "CODIGO", "DESCRIPCION", "FAMILIA", "SUB-FAMILIA"],
    ]);
    expect(c?.mapa.codigo).toBe(1);
    expect(c?.mapa.marca).toBe(0);
  });

  it("devuelve null si falta una columna imprescindible", () => {
    expect(detectarCabecera([["FAMILIA", "SUB-FAMILIA", "DESCRIPCION"]])).toBeNull();
  });

  it("dice CUÁLES faltan, no solo que faltan", () => {
    expect(columnasQueFaltan([["CODIGO", "MARCA"]])).toEqual([
      "FAMILIA", "SUB-FAMILIA", "DESCRIPCION",
    ]);
  });
});

describe("leerFilas", () => {
  const cabecera = detectarCabecera([CABECERA])!;

  it("mapea una fila real del cliente", () => {
    const { filas } = leerFilas([CABECERA, FILA_6205], cabecera);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toEqual({
      fila: 2,
      codigo: "6205-2RS1/C3",
      familia: "RODAMIENTO",
      subfamilia: "RIGIDO DE BOLAS",
      tipo: "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
      marca: "SKF",
      stock: 35,
      stock_minimo: 8,
      precio_compra: 3.26,
      precio_venta: 3.92,
      precio_minimo: 3.86,
    });
  });

  it("conserva el espacio interior del código", () => {
    // "7210 BEP" es un código real; colapsarlo cambiaría lo que el cliente lee.
    const { filas } = leerFilas(
      [CABECERA, ["7210 BEP", "RODAMIENTO", "AXIALES", "X", "SKF", "", "", "", "", ""]],
      cabecera,
    );
    expect(filas[0]?.codigo).toBe("7210 BEP");
  });

  it("numera las filas como Excel, para que el error se pueda ubicar", () => {
    const { filas } = leerFilas([CABECERA, FILA_6205, FILA_6205], cabecera);
    expect(filas.map((f) => f.fila)).toEqual([2, 3]);
  });

  it("salta en silencio las filas vacías de la plantilla", () => {
    const { filas, problemas } = leerFilas(
      [CABECERA, FILA_6205, [], ["", "", "", ""], FILA_6205],
      cabecera,
    );
    expect(filas).toHaveLength(2);
    expect(problemas).toEqual([]);
  });

  it("avisa de la fila con datos pero sin código", () => {
    const { filas, problemas } = leerFilas(
      [CABECERA, ["", "RODAMIENTO", "RIGIDO DE BOLAS", "X", "SKF", "10"]],
      cabecera,
    );
    expect(filas).toHaveLength(0);
    expect(problemas[0]?.fila).toBe(2);
    expect(problemas[0]?.mensaje).toContain("CODIGO");
  });

  it("NO convierte en cero un número ilegible", () => {
    // Un costo que se vuelve 0 sin avisar es un margen falso en cada
    // cotización futura. Mejor omitir la fila y decirlo.
    const { filas, problemas } = leerFilas(
      [CABECERA, ["6205", "RODAMIENTO", "RIGIDO DE BOLAS", "X", "SKF", "", "", "por definir"]],
      cabecera,
    );
    expect(filas).toHaveLength(0);
    expect(problemas[0]?.mensaje).toContain("P.C. $");
    expect(problemas[0]?.mensaje).toContain("por definir");
  });

  it("una celda numérica vacía sí es cero", () => {
    const { filas, problemas } = leerFilas(
      [CABECERA, ["6205", "RODAMIENTO", "RIGIDO DE BOLAS", "X", "SKF", "", "", "", "", ""]],
      cabecera,
    );
    expect(problemas).toEqual([]);
    expect(filas[0]?.precio_compra).toBe(0);
  });

  it("pone en mayúsculas la jerarquía y la marca, pero no el código", () => {
    const { filas } = leerFilas(
      [CABECERA, ["6205-2rs1/c3", "rodamiento", "rigido de bolas", "algo", "skf"]],
      cabecera,
    );
    expect(filas[0]?.codigo).toBe("6205-2rs1/c3");
    expect(filas[0]?.familia).toBe("RODAMIENTO");
    expect(filas[0]?.marca).toBe("SKF");
  });

  it("colapsa los espacios de más que deja copiar y pegar", () => {
    const { filas } = leerFilas(
      [CABECERA, ["  6205-2RS1/C3  ", "RODAMIENTO", "RIGIDO   DE  BOLAS", "X", "SKF"]],
      cabecera,
    );
    expect(filas[0]?.codigo).toBe("6205-2RS1/C3");
    expect(filas[0]?.subfamilia).toBe("RIGIDO DE BOLAS");
  });
});
