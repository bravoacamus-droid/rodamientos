/**
 * En qué va un pedido (130).
 *
 * Luis, 15/10: el pedido es cuando el cliente confirma, y desde ahí se
 * compra, se despacha, se factura y se cobra. La etapa dice el PRÓXIMO paso,
 * en palabras de Willy, no el estado técnico de cada documento.
 *
 * Puro: recibe lo que el pedido tiene colgado y devuelve una etapa.
 */

export type Etapa =
  | "por_registrar_compra"
  | "esperando_mercaderia"
  | "por_entregar"
  | "por_facturar"
  | "por_cobrar"
  | "cobrado";

export const ETAPAS: readonly Etapa[] = [
  "por_registrar_compra",
  "esperando_mercaderia",
  "por_entregar",
  "por_facturar",
  "por_cobrar",
  "cobrado",
];

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  por_registrar_compra: "Falta registrar la compra",
  esperando_mercaderia: "Esperando la mercadería",
  por_entregar: "Por entregar",
  por_facturar: "Entregado · por facturar",
  // «Al cliente»: Willy lo leyó como sus propias compras (16/10: «todos mis
  // compras son al contado»).
  por_cobrar: "Facturado · falta cobrar al cliente",
  cobrado: "Cobrado",
};

/** El tono de la etapa: lo que pide una acción, en ámbar; lo cerrado, en verde. */
export const TONO_ETAPA: Record<Etapa, "aviso" | "info" | "ok"> = {
  por_registrar_compra: "aviso",
  esperando_mercaderia: "info",
  por_entregar: "aviso",
  por_facturar: "aviso",
  por_cobrar: "info",
  cobrado: "ok",
};

export interface ColgadoDelPedido {
  /** Las órdenes y compras del pedido, sin las anuladas. */
  compras: { estado: string; falta_factura: boolean }[];
  /** Guías EMITIDAS (un borrador no ha despachado nada). */
  guiasEmitidas: number;
  /** Facturas y boletas vigentes, con lo que queda por cobrar. */
  facturas: { saldo: number }[];
}

/**
 * La etapa, del final hacia atrás: lo que ya pasó manda sobre lo que falta
 * de antes. Un pedido facturado está «por cobrar» aunque una de sus compras
 * siga sin registrar —eso se ve en su ficha, no en la lista—.
 */
export function etapaDe(c: ColgadoDelPedido): Etapa {
  if (c.facturas.length > 0) {
    return c.facturas.some((f) => f.saldo > 0.005) ? "por_cobrar" : "cobrado";
  }
  if (c.guiasEmitidas > 0) return "por_facturar";
  if (c.compras.some((k) => k.falta_factura && k.estado === "registrada")) return "por_registrar_compra";
  if (c.compras.some((k) => k.estado === "registrada" || k.estado === "recibida_parcial")) return "esperando_mercaderia";
  return "por_entregar";
}
