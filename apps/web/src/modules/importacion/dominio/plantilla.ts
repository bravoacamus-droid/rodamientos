import type { FilaPlantilla, ProblemaArchivo } from "./tipos";

/**
 * Lectura de la plantilla: de una matriz de celdas a filas tipadas.
 *
 * Todo aquí es puro. Recibe `string[][]` —lo que salga de leer la hoja— y no
 * sabe nada de Excel, de Supabase ni de React. Así se prueban los casos raros
 * (la cabecera corrida, el número con coma, la columna renombrada) sin generar
 * un archivo.
 *
 * El principio de fondo: **la plantilla la llena una persona, no un sistema**.
 * Va a llegar con espacios de más, con "$ 3.26", con la cabecera dos filas más
 * abajo porque alguien insertó un título. Rechazar el archivo por eso sería
 * devolverle el problema al cliente; el trabajo es entenderlo.
 */

/** Columnas de la plantilla, con los nombres que el cliente ve. */
export const COLUMNAS = [
  { clave: "codigo", cabecera: "CODIGO", alias: ["CÓDIGO", "COD"] },
  { clave: "familia", cabecera: "FAMILIA", alias: [] },
  { clave: "subfamilia", cabecera: "SUB-FAMILIA", alias: ["SUBFAMILIA", "SUB FAMILIA"] },
  { clave: "tipo", cabecera: "DESCRIPCION", alias: ["DESCRIPCIÓN", "TIPO"] },
  { clave: "marca", cabecera: "MARCA", alias: [] },
  { clave: "stock", cabecera: "STOCK ACTUAL", alias: ["STOCK"] },
  { clave: "stock_minimo", cabecera: "STOCK MINIMO", alias: ["STOCK MÍNIMO", "MINIMO", "MÍNIMO"] },
  { clave: "precio_compra", cabecera: "P.C. $", alias: ["PC", "P.C.", "PRECIO COMPRA", "COSTO"] },
  { clave: "precio_venta", cabecera: "P.V. $", alias: ["PV", "P.V.", "PRECIO VENTA"] },
  { clave: "precio_minimo", cabecera: "P.M. $", alias: ["PM", "P.M.", "PRECIO MINIMO", "PRECIO MÍNIMO"] },
] as const;

export type ClaveColumna = (typeof COLUMNAS)[number]["clave"];

/** Columnas sin las cuales el archivo no es la plantilla. */
const OBLIGATORIAS: ClaveColumna[] = ["codigo", "familia", "subfamilia", "tipo"];

const COMBINANTES = new RegExp(
  "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]",
  "g",
);

/** Forma canónica de una cabecera: sin tildes, sin signos, sin espacios. */
export function normalizarCabecera(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINANTES, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Convierte una celda a número, aguantando lo que la gente escribe de verdad.
 *
 * Acepta "3.26", "3,26", "$ 3.26", "1,234.56" y "1.234,56". Con DOS
 * separadores distintos no hay duda: manda el último, porque el de miles nunca
 * va al final.
 *
 * Con UNO SOLO sí es ambiguo —"1.234" puede ser mil doscientos treinta y
 * cuatro— y se lee como decimal. Es la lectura segura para este catálogo:
 * todas las columnas de dinero llevan dos decimales, así que confundir 1.234
 * con 1234 sería un error de mil veces en el precio, mientras que al revés lo
 * peor que pasa es perder un separador de miles que casi nadie teclea.
 *
 * Devuelve null si no hay forma de leer un número; el llamador decide si eso
 * es un cero o un error.
 */
export function aNumero(valor: string): number | null {
  const limpio = valor.replace(/[^0-9,.-]/g, "").trim();
  if (limpio === "" || limpio === "-") return null;

  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");

  let normalizado: string;
  if (ultimaComa === -1 && ultimoPunto === -1) {
    normalizado = limpio;
  } else if (ultimaComa > ultimoPunto) {
    // La coma manda: los puntos eran separadores de miles.
    normalizado = limpio.replace(/\./g, "").replace(",", ".");
  } else {
    normalizado = limpio.replace(/,/g, "");
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export interface Cabecera {
  /** Índice (base 0) de la fila donde está la cabecera. */
  indice: number;
  /** Columna (base 0) de cada campo; ausente si la columna no está. */
  mapa: Partial<Record<ClaveColumna, number>>;
}

/**
 * Busca la fila de cabecera.
 *
 * No se asume que sea la primera: la plantilla la trae en la 1, pero basta que
 * alguien inserte un título arriba para que deje de estarlo. Se revisan las
 * primeras filas y gana la que reconozca más columnas.
 */
export function detectarCabecera(filas: string[][], maxFilas = 10): Cabecera | null {
  let mejor: Cabecera | null = null;
  let mejorPuntaje = 0;

  for (let i = 0; i < Math.min(filas.length, maxFilas); i += 1) {
    const celdas = filas[i] ?? [];
    const mapa: Partial<Record<ClaveColumna, number>> = {};

    for (const [col, celda] of celdas.entries()) {
      const norm = normalizarCabecera(celda ?? "");
      if (norm === "") continue;
      for (const def of COLUMNAS) {
        if (mapa[def.clave] !== undefined) continue;
        const candidatos = [def.cabecera, ...def.alias].map(normalizarCabecera);
        if (candidatos.includes(norm)) {
          mapa[def.clave] = col;
          break;
        }
      }
    }

    const puntaje = Object.keys(mapa).length;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = { indice: i, mapa };
    }
  }

  if (!mejor) return null;
  const faltan = OBLIGATORIAS.filter((c) => mejor?.mapa[c] === undefined);
  return faltan.length === 0 ? mejor : null;
}

/** Qué columnas obligatorias faltan, para poder decirlo con nombre y apellido. */
export function columnasQueFaltan(filas: string[][]): string[] {
  const parcial = { indice: 0, mapa: {} as Partial<Record<ClaveColumna, number>> };
  for (let i = 0; i < Math.min(filas.length, 10); i += 1) {
    for (const [col, celda] of (filas[i] ?? []).entries()) {
      const norm = normalizarCabecera(celda ?? "");
      for (const def of COLUMNAS) {
        if (parcial.mapa[def.clave] !== undefined) continue;
        if ([def.cabecera, ...def.alias].map(normalizarCabecera).includes(norm)) {
          parcial.mapa[def.clave] = col;
        }
      }
    }
  }
  return OBLIGATORIAS.filter((c) => parcial.mapa[c] === undefined).map(
    (c) => COLUMNAS.find((d) => d.clave === c)?.cabecera ?? c,
  );
}

export interface Lectura {
  filas: FilaPlantilla[];
  problemas: ProblemaArchivo[];
}

/**
 * Mapea las filas de datos.
 *
 * Las filas totalmente vacías se saltan en silencio: la plantilla trae 200
 * preparadas y nadie va a llenarlas todas. Una fila con datos pero sin código
 * sí se reporta, porque eso es un descuido, no un espacio en blanco.
 */
export function leerFilas(filas: string[][], cabecera: Cabecera): Lectura {
  const salida: FilaPlantilla[] = [];
  const problemas: ProblemaArchivo[] = [];
  const { mapa } = cabecera;

  const texto = (celdas: string[], clave: ClaveColumna): string => {
    const col = mapa[clave];
    if (col === undefined) return "";
    return (celdas[col] ?? "").trim().replace(/\s+/g, " ");
  };

  for (let i = cabecera.indice + 1; i < filas.length; i += 1) {
    const celdas = filas[i] ?? [];
    const numeroExcel = i + 1; // Excel numera desde 1.

    const crudos = {
      codigo: texto(celdas, "codigo"),
      familia: texto(celdas, "familia"),
      subfamilia: texto(celdas, "subfamilia"),
      tipo: texto(celdas, "tipo"),
      marca: texto(celdas, "marca"),
    };
    const numericos = {
      stock: texto(celdas, "stock"),
      stock_minimo: texto(celdas, "stock_minimo"),
      precio_compra: texto(celdas, "precio_compra"),
      precio_venta: texto(celdas, "precio_venta"),
      precio_minimo: texto(celdas, "precio_minimo"),
    };

    const vacia =
      Object.values(crudos).every((v) => v === "") &&
      Object.values(numericos).every((v) => v === "");
    if (vacia) continue;

    if (crudos.codigo === "") {
      problemas.push({
        fila: numeroExcel,
        mensaje: "La fila tiene datos pero no tiene CODIGO. Se omitió.",
      });
      continue;
    }

    // Un número ilegible NO se convierte en cero en silencio: un costo que se
    // vuelve 0 sin avisar es un margen falso en cada cotización futura.
    const convertido: Record<string, number> = {};
    let ilegible: string | null = null;
    for (const [clave, bruto] of Object.entries(numericos)) {
      if (bruto === "") {
        convertido[clave] = 0;
        continue;
      }
      const n = aNumero(bruto);
      if (n === null) {
        ilegible = `${COLUMNAS.find((c) => c.clave === clave)?.cabecera ?? clave} = "${bruto}"`;
        break;
      }
      convertido[clave] = n;
    }
    if (ilegible !== null) {
      problemas.push({
        fila: numeroExcel,
        mensaje: `No se entiende el número en ${ilegible}. Se omitió la fila.`,
      });
      continue;
    }

    salida.push({
      fila: numeroExcel,
      ...crudos,
      familia: crudos.familia.toUpperCase(),
      subfamilia: crudos.subfamilia.toUpperCase(),
      tipo: crudos.tipo.toUpperCase(),
      marca: crudos.marca.toUpperCase(),
      stock: convertido.stock ?? 0,
      stock_minimo: convertido.stock_minimo ?? 0,
      precio_compra: convertido.precio_compra ?? 0,
      precio_venta: convertido.precio_venta ?? 0,
      precio_minimo: convertido.precio_minimo ?? 0,
    });
  }

  return { filas: salida, problemas };
}
