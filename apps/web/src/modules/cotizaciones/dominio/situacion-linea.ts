/**
 * De dónde sale cada línea: del almacén o de una compra (04/11).
 *
 * Reunión con Willy del 04/11. El pedido PED-26-00002 seguía pidiendo comprar
 * 24 fajas que ya habían entrado al almacén: se analizó la compra cuando no
 * había stock, y el análisis mandaba aunque el stock llegara después. Luis:
 * *«si la cotización no está aprobada y ya hizo la orden de compra y
 * recepción, que automáticamente se actualice y tome el stock»*.
 *
 * La regla, en un solo sitio para la ficha, el editor y las órdenes:
 *
 *   · **Si el almacén alcanza, sale del almacén**, tenga o no análisis. El
 *     análisis se queda de referencia (lo que costaría reponerlo).
 *   · Salvo que se haya marcado **«Comprar igual»** (`comprar_igual`, 186).
 *     Willy: *«tengo 10 y me piden 10, pero tengo que comprar para seguir
 *     teniendo algo en stock»*. Eso es una decisión y se respeta.
 *   · Si no alcanza: con análisis, se compra; sin él, falta analizarlo.
 *
 * Puro: sin React y sin red.
 */

export type SituacionLinea =
  /** Línea libre o kit: ni stock propio ni compra por aquí. */
  | "no_aplica"
  /** El almacén alcanza y no hay análisis. */
  | "almacen"
  /** El almacén alcanza y hay un análisis de antes: queda de referencia. */
  | "almacen_con_analisis"
  /** Se compra: hay análisis y el almacén no alcanza, o se pidió comprar igual. */
  | "comprar"
  /** Hay algo en el almacén pero no alcanza, y no se analizó lo que falta. */
  | "parcial"
  /** Sin stock y sin análisis. */
  | "falta_analizar";

export interface LineaParaSituacion {
  productoId: string | null;
  esKit: boolean;
  /** Lo que todavía hay que entregar: lo cotizado, o lo confirmado menos lo atendido. */
  necesita: number;
  /** Lo que hay en el almacén (cantidad menos reservado). */
  stock: number;
  /** Si tiene al menos un proveedor con cantidad y precio. */
  analizada: boolean;
  /** «Comprar igual» (186). */
  comprarIgual: boolean;
}

/** ¿Sale del almacén? Es lo que decide si se propone una orden de compra. */
export function saleDelAlmacen(l: Omit<LineaParaSituacion, "analizada">): boolean {
  if (l.productoId === null || l.esKit || l.comprarIgual) return false;
  return l.necesita > 0 && l.stock >= l.necesita;
}

export function situacionDeLinea(l: LineaParaSituacion): SituacionLinea {
  if (l.productoId === null || l.esKit || !(l.necesita > 0)) return "no_aplica";
  if (saleDelAlmacen(l)) return l.analizada ? "almacen_con_analisis" : "almacen";
  if (l.analizada) return "comprar";
  return l.stock > 0 ? "parcial" : "falta_analizar";
}

/** Para el resumen de encima de la tabla: cuántas de cada cosa. */
export interface ResumenSituacion {
  almacen: number;
  comprar: number;
  faltaAnalizar: number;
}

export function resumirSituaciones(situaciones: readonly SituacionLinea[]): ResumenSituacion {
  let almacen = 0;
  let comprar = 0;
  let faltaAnalizar = 0;
  for (const s of situaciones) {
    if (s === "almacen" || s === "almacen_con_analisis") almacen++;
    else if (s === "comprar") comprar++;
    else if (s === "parcial" || s === "falta_analizar") faltaAnalizar++;
  }
  return { almacen, comprar, faltaAnalizar };
}
