import { IGV } from "@rodatech/config";
import { montoEnLetras } from "@rodatech/sunat";

import { textoEntrega, type Disponibilidad } from "./disponibilidad";
import { importeLinea, redondear2 } from "./totales";

/**
 * La cotización lista para el papel.
 *
 * Existe aparte de `armarCotizacionImpresa` de `@rodatech/sunat` —que vino de
 * itech y se dejó tal cual— porque el formato de Rodatech ES el cambio. Aquel
 * modelo tiene líneas de `{descripcion, cantidad, unitario, importe}`: sin
 * marca, sin código y sin descuento, justo las tres columnas que Willy pidió
 * corregir. Adaptarlo habría sido reescribirlo.
 *
 * Las seis correcciones (13:25, 14:18, 14:54, 15:52) viven aquí, y por eso
 * están probadas:
 *
 *   C1  Solo VALOR unitario. No existe la columna «precio unitario»
 *       (valor x 1.18). Es la que le costó ventas: el cliente comparaba el
 *       precio con IGV contra el valor de la competencia y lo veía caro.
 *   C2  La marca en columna propia, no dentro de la descripción.
 *   C3  El código NO se repite dentro de la descripción.
 *   C4  Código · Marca · Descripción · Cantidad · U.M. · Valor unitario ·
 *       [Descuento] · Importe
 *   C5  El descuento es una casilla habilitable: si no se activó, la columna
 *       ni aparece.
 *   C6  Dólares siempre.
 */

export interface EmisorImpreso {
  razonSocial: string;
  nombreComercial: string | null;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  web: string | null;
  logoUrl: string | null;
}

export interface LineaCruda {
  codigo: string;
  marca: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valorUnitario: number;
  descuentoPct: number;
  /** 040. Sin valor se asume inmediata, que es lo que era antes de existir. */
  disponibilidad?: Disponibilidad;
  /** Plazo propio de la línea. Null = el habitual de su tipo. */
  diasEntrega?: number | null;
}

export interface DatosImpresion {
  emisor: EmisorImpreso;
  numero: string;
  /** AAAA-MM-DD: una columna `date` es un día, no un instante. */
  fecha: string;
  validezDias: number;
  cliente: {
    razonSocial: string;
    documento: string | null;
    tipoDocumento: string | null;
    direccion: string | null;
    contacto: string | null;
  };
  vendedor: string | null;
  tiempoEntrega: string | null;
  condiciones: string | null;
  observaciones: string | null;
  ordenCompraCliente: string | null;
  mostrarDescuento: boolean;
  /** C7 (01/09, 8:38): la columna de entrega también es opcional. */
  mostrarDisponibilidad?: boolean;
  lineas: LineaCruda[];
}

export interface LineaImpresa {
  n: number;
  codigo: string;
  marca: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valorUnitario: number;
  descuentoPct: number;
  importe: number;
  /** Ya resuelto a texto: «Inmediata», «15 días · exterior». */
  entrega: string;
}

export interface CotizacionImpresa {
  emisor: EmisorImpreso;
  numero: string;
  fecha: string;
  validaHasta: string;
  validezDias: number;
  cliente: DatosImpresion["cliente"];
  vendedor: string | null;
  tiempoEntrega: string | null;
  condiciones: string | null;
  observaciones: string | null;
  ordenCompraCliente: string | null;
  /** C6: siempre dólares. */
  moneda: "USD";
  simbolo: "$";
  /** C5: si es false, la columna de descuento no se dibuja. */
  mostrarDescuento: boolean;
  /** C7: igual, para la columna de entrega. */
  mostrarDisponibilidad: boolean;
  /** C4, en este orden. */
  columnas: string[];
  lineas: LineaImpresa[];
  subtotal: number;
  descuento: number;
  opGravada: number;
  igv: number;
  tasaIgv: number;
  total: number;
  enLetras: string;
}

/** Nombre legible de la unidad de medida. */
const UNIDADES: Record<string, string> = {
  NIU: "UND",
  MTR: "MTR",
  BX: "CAJA",
  SET: "JUEGO",
  ZZ: "SERV",
};

/**
 * Suma días a una fecha AAAA-MM-DD.
 *
 * Se opera al mediodía de Lima para que ni el UTC ni el cambio de horario
 * muevan el resultado en un día: una cotización que dice «válida hasta el 5»
 * y vence el 4 es una discusión con el cliente.
 */
export function sumarDias(fecha: string, dias: number): string {
  const base = Date.parse(`${fecha}T12:00:00-05:00`);
  if (Number.isNaN(base)) return fecha;
  const d = new Date(base + dias * 86_400_000);
  const enLima = new Date(d.getTime() - 5 * 3_600_000);
  return enLima.toISOString().slice(0, 10);
}

/**
 * Limpia la descripción de lo que C2 y C3 sacaron a su propia columna.
 *
 * El maestro viejo traía cosas como «SKF 6205-2RS1/C3 RODAMIENTO RIGIDO…»,
 * con la marca y el código embebidos. Si se imprimieran tal cual, la marca
 * saldría dos veces y el código también, que es exactamente lo que Willy
 * quiere dejar de ver.
 */
export function limpiarDescripcion(
  descripcion: string,
  codigo: string,
  marca: string | null,
): string {
  let out = descripcion.trim();

  const quitar = (aguja: string) => {
    if (!aguja) return;
    // Se compara sin distinguir mayúsculas y solo como palabra suelta, para no
    // mutilar una descripción que contenga el texto por casualidad.
    const escapado = aguja.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|\\s)${escapado}(?=\\s|$)`, "gi"), "$1").trim();
  };

  quitar(codigo);
  if (marca) quitar(marca);

  return out.replace(/\s{2,}/g, " ").replace(/^[-–·,\s]+|[-–·,\s]+$/g, "").trim();
}

export function armarCotizacionImpresa(d: DatosImpresion): CotizacionImpresa {
  const lineas: LineaImpresa[] = d.lineas.map((l, i) => ({
    n: i + 1,
    codigo: l.codigo,
    // C2: columna propia. Sin marca se pone una raya, no vacío: una celda en
    // blanco en un papel se lee como un olvido.
    marca: l.marca?.trim() || "—",
    // C3: fuera el código (y la marca) de la descripción.
    descripcion: limpiarDescripcion(l.descripcion, l.codigo, l.marca),
    cantidad: l.cantidad,
    unidad: UNIDADES[l.unidad] ?? l.unidad,
    valorUnitario: l.valorUnitario,
    descuentoPct: l.descuentoPct,
    importe: importeLinea({
      cantidad: l.cantidad,
      valorUnitario: l.valorUnitario,
      descuentoPct: l.descuentoPct,
    }),
    // Resuelto aquí y no en la plantilla: el texto que lee el cliente sale de
    // una sola función, y así el PDF y lo que se manda por WhatsApp dicen lo
    // mismo sin que nadie tenga que acordarse.
    entrega: textoEntrega(l.disponibilidad ?? "inmediata", l.diasEntrega ?? null),
  }));

  // Se suman importes YA redondeados, igual que la columna generada de la base
  // y que `calcularTotales`. Si aquí se sumara con todos los decimales, el
  // total del papel no cuadraría con la suma de la columna que el cliente ve.
  const subtotal = redondear2(lineas.reduce((a, l) => a + l.importe, 0));
  const bruto = redondear2(
    lineas.reduce((a, l) => a + redondear2(l.cantidad * l.valorUnitario), 0),
  );
  const descuento = redondear2(bruto - subtotal);
  const igv = redondear2(subtotal * IGV);
  const total = redondear2(subtotal + igv);

  // C5: la columna de descuento solo se dibuja si se activó Y hay algo que
  // mostrar. Activarla y que salga una columna de ceros es peor que no tenerla.
  const conDescuento = d.mostrarDescuento && descuento > 0;

  // Misma regla que el descuento y por el mismo motivo: activarla y que salga
  // «Inmediata» en las seis líneas es peor que no tenerla. Si TODO es
  // inmediato no hay nada que comunicar — la promesa general ya va en el pie
  // del documento, en «tiempo de entrega».
  const conEntrega =
    (d.mostrarDisponibilidad ?? false) &&
    d.lineas.some((l) => (l.disponibilidad ?? "inmediata") !== "inmediata");

  return {
    emisor: d.emisor,
    numero: d.numero,
    fecha: d.fecha,
    validaHasta: sumarDias(d.fecha, d.validezDias),
    validezDias: d.validezDias,
    cliente: d.cliente,
    vendedor: d.vendedor,
    tiempoEntrega: d.tiempoEntrega,
    condiciones: d.condiciones,
    observaciones: d.observaciones,
    ordenCompraCliente: d.ordenCompraCliente,
    moneda: "USD",
    simbolo: "$",
    mostrarDescuento: conDescuento,
    mostrarDisponibilidad: conEntrega,
    // C4, en este orden exacto. La entrega se cuela entre U.M. y el valor:
    // cierra el bloque de «qué y cuándo» antes de empezar el de «cuánto».
    columnas: [
      "Código",
      "Marca",
      "Descripción",
      "Cant.",
      "U.M.",
      ...(conEntrega ? ["Entrega"] : []),
      "Valor unit.",
      ...(conDescuento ? ["Dscto."] : []),
      "Importe",
    ],
    lineas,
    subtotal,
    descuento,
    opGravada: subtotal,
    igv,
    tasaIgv: IGV,
    total,
    // El segundo parámetro es la etiqueta literal que se pega al final, no un
    // código: pasar "USD" imprimía «SESENTA CON 60/100 USD». En un documento
    // peruano la leyenda va con el nombre de la moneda.
    enLetras: montoEnLetras(total, "DÓLARES AMERICANOS"),
  };
}
