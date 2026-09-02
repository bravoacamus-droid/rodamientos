/**
 * Qué le hace al negocio el costo con el que llega la mercadería.
 *
 * Es el paso 7 del plan de compras. Willy, 01/09: *«sería bueno poner el
 * último precio que compra, así con el precio anterior haiga historial y
 * mejorar los precios»*.
 *
 * El aviso que ya existía en `constructor.ts` responde a otra cosa: salta con
 * un salto del 50 % y sirve para cazar un decimal mal puesto. Esto responde a
 * la pregunta del negocio: **si el costo subió, ¿todavía gano lo mismo?**
 *
 * Todo puro. El margen se mide **sobre el costo**, igual que en cotizaciones
 * (`margenLinea`) y que `productos.margen_objetivo_pct`: dos definiciones de
 * margen en el mismo sistema serían dos respuestas distintas a la única
 * pregunta que importa.
 */

const dos = (n: number): number => Math.round(n * 100) / 100;

export interface EntradaImpacto {
  /** El costo al que llega ahora, ya en dólares. */
  costoUsd: number;
  /** Lo que costó la vez anterior, en dólares. Null si es la primera. */
  costoAnteriorUsd: number | null;
  /** A cuánto se vende hoy. */
  precioVenta: number;
  /** El piso que Willy fijó producto por producto. 0 = no lo puso. */
  precioMinimo: number;
}

export interface Impacto {
  /** Cuánto cambió el costo, en tanto por ciento. Null si no había anterior. */
  variacionPct: number | null;
  /** Lo que se ganaba con el costo viejo. Null si no había anterior. */
  margenAntes: number | null;
  /** Lo que se gana con el nuevo. Null si no hay precio de venta. */
  margenAhora: number | null;
  /**
   * El costo se comió el piso: vender al mínimo que Willy fijó ya no cubre lo
   * que cuesta traerlo. Es lo más grave que puede decir esta cuenta.
   */
  bajoPiso: boolean;
  /** Vender al precio de hoy da menos de lo que cuesta. */
  enPerdida: boolean;
  gravedad: "nada" | "atencion" | "grave";
}

/** Margen sobre el costo, en tanto por ciento. */
export function margen(precio: number, costo: number): number | null {
  if (costo <= 0 || precio <= 0) return null;
  return dos(((precio - costo) / costo) * 100);
}

/**
 * A partir de cuánto merece decirse.
 *
 * Un 5 % arriba o abajo es ruido del tipo de cambio y de los redondeos; avisar
 * de eso convierte el panel en algo que se ignora. Un 10 % ya es una subida
 * que conviene mirar antes de que se coma el margen sin que nadie lo note.
 */
export const UMBRAL_VARIACION = 10;

export function calcularImpacto(e: EntradaImpacto): Impacto {
  const variacionPct =
    e.costoAnteriorUsd !== null && e.costoAnteriorUsd > 0
      ? dos(((e.costoUsd - e.costoAnteriorUsd) / e.costoAnteriorUsd) * 100)
      : null;

  const margenAntes =
    e.costoAnteriorUsd !== null ? margen(e.precioVenta, e.costoAnteriorUsd) : null;
  const margenAhora = margen(e.precioVenta, e.costoUsd);

  // El piso solo dice algo si Willy lo puso. Un cero no es un piso de cero: es
  // que nadie lo fijó, y tratarlo como piso marcaría en rojo medio catálogo.
  const bajoPiso = e.precioMinimo > 0 && e.costoUsd >= e.precioMinimo;
  const enPerdida = e.precioVenta > 0 && e.costoUsd >= e.precioVenta;

  const gravedad: Impacto["gravedad"] =
    bajoPiso || enPerdida
      ? "grave"
      : variacionPct !== null && Math.abs(variacionPct) >= UMBRAL_VARIACION
        ? "atencion"
        : "nada";

  return { variacionPct, margenAntes, margenAhora, bajoPiso, enPerdida, gravedad };
}

/**
 * Lo que se lee en pantalla.
 *
 * Se escribe entero y en castellano porque lo que decide si esto sirve no es
 * el número: es que quien recibe la mercadería entienda, sin pensarlo, que hay
 * que subir el precio antes de vender otra vez.
 */
export function explicar(i: Impacto): string | null {
  if (i.gravedad === "nada") return null;

  if (i.bajoPiso) {
    return "Traerlo cuesta más que el precio mínimo que tienes fijado. Hay que subir el precio antes de volver a venderlo.";
  }
  if (i.enPerdida) {
    return "Traerlo cuesta más de lo que se vende. Cada venta a este precio pierde dinero.";
  }

  const sube = (i.variacionPct ?? 0) > 0;
  const cuanto = Math.abs(i.variacionPct ?? 0).toFixed(1);

  if (i.margenAntes !== null && i.margenAhora !== null) {
    return `El costo ${sube ? "subió" : "bajó"} un ${cuanto} %: el margen pasa de ${i.margenAntes.toFixed(1)} % a ${i.margenAhora.toFixed(1)} %.`;
  }
  return `El costo ${sube ? "subió" : "bajó"} un ${cuanto} % respecto a la vez anterior.`;
}
