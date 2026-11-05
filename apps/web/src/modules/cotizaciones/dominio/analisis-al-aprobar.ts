/**
 * El análisis de compra, obligatorio al APROBAR (02/11).
 *
 * Willy, por Moisés: *«en cotización puedes poner precios de cada producto,
 * pero no es necesario el análisis de costo; puede mandar la cotización al
 * cliente, pero antes de aprobarla tiene que decirle que tiene que llenar su
 * análisis de costo para las compras»*.
 *
 * Al cotizar el costo puede esperar: el cliente todavía no dijo que sí. Al
 * aprobar ya hay que comprar, y de ese análisis salen las órdenes de compra
 * por proveedor (111). Lo que está en el anaquel no se compra, así que no se
 * pide; los kits tampoco, su costo es el de sus piezas.
 */

export interface LineaAlAprobar {
  codigo: string;
  /** Sin producto del catálogo (línea libre): no se compra por aquí. */
  productoId: string | null;
  esKit: boolean;
  /** Lo que el cliente confirmó de esta línea. */
  confirmada: number;
  /** Lo que hay en el almacén para ella (cantidad menos reservado). */
  disponible: number;
  /** Si tiene al menos un proveedor con cantidad y precio. */
  analizada: boolean;
}

/** Los códigos que hay que comprar y no tienen análisis, en su orden. */
export function faltaAnalizarAlAprobar(lineas: readonly LineaAlAprobar[]): string[] {
  return lineas
    .filter(
      (l) =>
        l.confirmada > 0 &&
        l.productoId !== null &&
        !l.esKit &&
        !l.analizada &&
        l.disponible < l.confirmada,
    )
    .map((l) => l.codigo);
}

/** La frase, con los códigos. */
export function mensajeFaltaAnalisis(codigos: readonly string[]): string {
  return codigos.length === 1
    ? `Antes de aprobar, llena el análisis de compra de ${codigos[0]}: hay que comprarlo y todavía no dice a quién ni a cuánto.`
    : `Antes de aprobar, llena el análisis de compra de estos ${codigos.length} productos: hay que comprarlos y todavía no dicen a quién ni a cuánto (${codigos.join(", ")}).`;
}

/**
 * Las líneas confirmadas que NO están en el catálogo (05/11).
 *
 * Willy clonó la CT02-1303, que vino de SIMPLE con dos productos que el ERP
 * no tenía, pulsó «Aprobar» sin querer y nació el PED-26-00005. Luis: *«no
 * debería dejarlo aprobar si los productos no están registrados… tiene que
 * hacer su análisis de costo»*. `faltaAnalizarAlAprobar` las dejaba pasar
 * —«sin producto no se compra por aquí»— y era el hueco: sin producto no hay
 * análisis, ni orden de compra, ni guía (`guia_items.producto_id` es NOT
 * NULL), ni factura. Se registran primero; la base lo exige también (193).
 */
export function sinRegistrarAlAprobar(lineas: readonly LineaAlAprobar[]): string[] {
  return lineas.filter((l) => l.confirmada > 0 && l.productoId === null).map((l) => l.codigo);
}

/** La frase, con los códigos. */
export function mensajeSinRegistrar(codigos: readonly string[]): string {
  return codigos.length === 1
    ? `Antes de aprobar, registra ${codigos[0]} en el catálogo: no está registrado, y sin eso no se puede hacer su análisis de compra, ni la orden, la guía ni la factura.`
    : `Antes de aprobar, registra estos ${codigos.length} productos en el catálogo: no están registrados, y sin eso no se puede hacer su análisis de compra, ni la orden, la guía ni la factura (${codigos.join(", ")}).`;
}
