/**
 * Leer la hoja de Excel de Willy tal cual la tiene (100, §AQ).
 *
 * Luis, 02/10: *«estaba rellenando los datos como en su excel pero no me sale
 * el mismo resultado»*. Escribir 29 filas a mano en otra pantalla es donde se
 * cuela un error, y COPIAR Y PEGAR no sirve: Excel copia lo que se VE, y su
 * columna FOB está formateada `$#,##0.00` —el 3.144 de la G1105 se pega como
 * 3.14—. Por eso se sube el archivo: se leen los valores de verdad.
 *
 * Se busca la fila de títulos por los NOMBRES de su hoja (CLIENTE, f, CODIGO,
 * MARCA, CANT.Ref, Price FOB $, PESO U(Kg.), CANT. PEDIDO, P.M, PROV.), no por
 * la posición: si mañana mete una columna, sigue funcionando. Las columnas que
 * él calcula —PARC.$, PU LIMA, TOT.$, %— no se leen: las calcula el ERP.
 *
 * Puro: recibe la matriz de texto que saca `matrizDeArchivo` y no sabe nada
 * de ExcelJS ni del catálogo.
 */

export interface FilaHoja {
  /** Número de fila en Excel, para poder decir «la fila 7». */
  fila: number;
  cliente: string;
  frecuencia: number | null;
  codigo: string;
  marca: string;
  cantidadRef: number;
  precioFob: number;
  pesoKg: number;
  cantidadPedido: number;
  precioMercado: number;
  proveedorMercado: string;
}

export interface LecturaHoja {
  filas: FilaHoja[];
  /** El DHL de su bloque de abajo, si lo encontró. */
  costoEnvio: number | null;
  /** Lo que no encontró, dicho para Willy. */
  problemas: string[];
}

/** Sin tildes, sin espacios ni puntos, en mayúsculas: «Price FOB $» → «PRICEFOB$». */
const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[\s.()]/g, "");

type Campo = Exclude<keyof FilaHoja, "fila">;

/** Cómo se reconoce cada columna por su título. El orden importa: «CANT. PEDIDO» antes que «CANT.». */
const TITULOS: { campo: Campo; es: (t: string) => boolean }[] = [
  { campo: "cantidadPedido", es: (t) => t.startsWith("CANT") && t.includes("PED") },
  { campo: "cantidadRef", es: (t) => t.startsWith("CANT") && (t.includes("REF") || t.includes("COT")) },
  { campo: "precioFob", es: (t) => t.includes("FOB") },
  { campo: "pesoKg", es: (t) => t.startsWith("PESOU") || t === "PESO" || t === "PESOKG" },
  { campo: "precioMercado", es: (t) => t === "PM" || t.startsWith("PRECIOMERCADO") || t.startsWith("PRECIODEMERCADO") },
  { campo: "proveedorMercado", es: (t) => t.startsWith("PROV") },
  { campo: "codigo", es: (t) => t === "CODIGO" || t === "COD" },
  { campo: "marca", es: (t) => t === "MARCA" },
  { campo: "cliente", es: (t) => t === "CLIENTE" },
  { campo: "frecuencia", es: (t) => t === "F" || t.startsWith("FRECUENCIA") },
];

const IMPRESCINDIBLES: { campo: Campo; titulo: string }[] = [
  { campo: "codigo", titulo: "CODIGO" },
  { campo: "cantidadRef", titulo: "CANT.Ref" },
  { campo: "precioFob", titulo: "Price FOB $" },
  { campo: "pesoKg", titulo: "PESO U(Kg.)" },
];

/**
 * Un número como lo escribe una persona: «$ 1,039.00», «3.144», «0,005».
 * Con punto y coma, el último es el decimal; con solo coma, la coma es el
 * decimal (es como lo acepta `CampoNumero`).
 */
export function numeroDeTexto(t: string): number {
  let s = t.replace(/USD|US\$|\$|\s/gi, "");
  if (s === "") return 0;
  const punto = s.lastIndexOf(".");
  const coma = s.lastIndexOf(",");
  if (punto >= 0 && coma >= 0) {
    s = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (coma >= 0) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function leerHojaAnalisis(matriz: string[][]): LecturaHoja {
  // La fila de títulos: la primera donde estén CODIGO y algo de FOB.
  let filaTitulos = -1;
  const columnas = new Map<Campo, number>();
  for (let r = 0; r < Math.min(matriz.length, 30) && filaTitulos < 0; r++) {
    const titulos = (matriz[r] ?? []).map(normal);
    if (!titulos.some((t) => t === "CODIGO") || !titulos.some((t) => t.includes("FOB"))) continue;
    filaTitulos = r;
    titulos.forEach((t, c) => {
      if (t === "") return;
      const campo = TITULOS.find((x) => x.es(t))?.campo;
      if (campo && !columnas.has(campo)) columnas.set(campo, c);
    });
  }

  if (filaTitulos < 0) {
    return {
      filas: [],
      costoEnvio: null,
      problemas: ["No se encontró la fila de títulos: tiene que tener CODIGO y Price FOB $."],
    };
  }
  const faltan = IMPRESCINDIBLES.filter((x) => !columnas.has(x.campo)).map((x) => x.titulo);
  if (faltan.length > 0) {
    return {
      filas: [],
      costoEnvio: null,
      problemas: [`Faltan estas columnas: ${faltan.join(", ")}.`],
    };
  }

  const celda = (fila: string[], campo: Campo) => {
    const c = columnas.get(campo);
    return c === undefined ? "" : String(fila[c] ?? "").trim();
  };

  const filas: FilaHoja[] = [];
  let finTabla = matriz.length;
  for (let r = filaTitulos + 1; r < matriz.length; r++) {
    const fila = matriz[r] ?? [];
    const codigo = celda(fila, "codigo");
    // Sin código es la fila de totales o el bloque de abajo: ahí acaba.
    if (codigo === "") {
      if (filas.length > 0) {
        finTabla = r;
        break;
      }
      continue;
    }
    const cantidadRef = Math.round(numeroDeTexto(celda(fila, "cantidadRef")));
    const pedido = celda(fila, "cantidadPedido");
    const f = celda(fila, "frecuencia");
    filas.push({
      fila: r + 1,
      cliente: celda(fila, "cliente").slice(0, 120),
      frecuencia: f === "" ? null : numeroDeTexto(f),
      codigo: codigo.toUpperCase().slice(0, 80),
      marca: celda(fila, "marca").toUpperCase().slice(0, 60),
      cantidadRef,
      precioFob: numeroDeTexto(celda(fila, "precioFob")),
      pesoKg: numeroDeTexto(celda(fila, "pesoKg")),
      // Sin columna de pedido, se pide lo cotizado: es lo que él hace.
      cantidadPedido: pedido === "" ? cantidadRef : Math.round(numeroDeTexto(pedido)),
      precioMercado: numeroDeTexto(celda(fila, "precioMercado")),
      proveedorMercado: celda(fila, "proveedorMercado").slice(0, 120),
    });
  }

  // El DHL: en su bloque de abajo, «DHL $» y a la derecha el monto de la
  // carga cotizada. También vale «Flete», «Courier» o «Envío».
  let costoEnvio: number | null = null;
  for (let r = finTabla; r < matriz.length && costoEnvio === null; r++) {
    const fila = matriz[r] ?? [];
    for (let c = 0; c < fila.length; c++) {
      const t = normal(String(fila[c] ?? ""));
      if (!/^(DHL|FLETE|COURIER|ENVIO|FEDEX|UPS)/.test(t)) continue;
      const monto = fila.slice(c + 1).map((x) => numeroDeTexto(String(x ?? ""))).find((n) => n > 0);
      if (monto) costoEnvio = Math.round(monto * 100) / 100;
      break;
    }
  }

  const problemas: string[] = [];
  if (filas.length === 0) problemas.push("La hoja no tiene ninguna fila con código.");
  if (costoEnvio === null) problemas.push("No se encontró el costo de DHL: escríbelo arriba.");
  const sinPeso = filas.filter((f) => f.pesoKg === 0);
  if (sinPeso.length > 0) {
    problemas.push(
      `${sinPeso.length === 1 ? "Una fila no tiene" : `${sinPeso.length} filas no tienen`} peso: ${sinPeso
        .map((f) => f.codigo)
        .join(", ")}.`,
    );
  }
  return { filas, costoEnvio, problemas };
}
