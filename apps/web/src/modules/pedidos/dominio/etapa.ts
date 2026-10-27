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
  | "despacho_parcial"
  | "por_facturar"
  | "por_cobrar"
  | "cobrado";

export const ETAPAS: readonly Etapa[] = [
  "por_registrar_compra",
  "esperando_mercaderia",
  "por_entregar",
  "despacho_parcial",
  "por_facturar",
  "por_cobrar",
  "cobrado",
];

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  // Lo que falta, con su nombre (UI2-02): la orden ya está pedida, falta la
  // factura del proveedor. Con «registrar la compra» la insignia del pedido
  // y la fila de su orden parecían dos pendientes distintos.
  por_registrar_compra: "Falta la factura del proveedor",
  esperando_mercaderia: "Esperando la mercadería",
  por_entregar: "Por entregar",
  // 161: con UNA guía el pedido pasaba a «por facturar» aunque solo hubiera
  // salido una parte. Donde caben, las cifras van al lado (`textoEtapa`).
  despacho_parcial: "Salió una parte",
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
  despacho_parcial: "aviso",
  por_facturar: "aviso",
  por_cobrar: "info",
  cobrado: "ok",
};

/**
 * Cuánto salió y cuánto se facturó del pedido, en unidades (161, vista
 * `v_pedido_avance`). Cada línea va topada en lo confirmado: lo que sobre de
 * un producto no tapa lo que falta de otro.
 */
export interface DespachoDelPedido {
  confirmado: number;
  despachado: number;
  facturado: number;
}

export interface ColgadoDelPedido {
  /** Las órdenes y compras del pedido, sin las anuladas. */
  compras: { estado: string; falta_factura: boolean }[];
  /** Guías EMITIDAS (un borrador no ha despachado nada). */
  guiasEmitidas: number;
  /** Facturas y boletas vigentes, con lo que queda por cobrar. */
  facturas: { saldo: number }[];
  /** Sin él (no se pudo leer), la etapa se decide como antes de la 161. */
  despacho?: DespachoDelPedido | null;
}

const TOLERANCIA = 0.005;

/** Salió algo, pero no todo lo confirmado. */
export function despachoAMedias(d: DespachoDelPedido | null | undefined): boolean {
  return !!d && d.despachado > TOLERANCIA && d.despachado < d.confirmado - TOLERANCIA;
}

/**
 * La etapa, del final hacia atrás: lo que ya pasó manda sobre lo que falta
 * de antes. Un pedido facturado está «por cobrar» aunque una de sus compras
 * siga sin registrar —eso se ve en su ficha, no en la lista—.
 *
 * Con una excepción (161): si salió solo una parte, el pedido está «Salió una
 * parte» aunque lo despachado ya esté facturado y hasta cobrado. Lo que falta
 * entregar es lo que el cliente está esperando, y era lo que se perdía: con
 * la primera guía el pedido pasaba a «por facturar» y, facturada esa, a
 * «cobrado», con la mitad todavía en el almacén.
 */
export function etapaDe(c: ColgadoDelPedido): Etapa {
  if (despachoAMedias(c.despacho)) return "despacho_parcial";
  if (c.facturas.length > 0) {
    return c.facturas.some((f) => f.saldo > 0.005) ? "por_cobrar" : "cobrado";
  }
  if (c.guiasEmitidas > 0) return "por_facturar";
  if (c.compras.some((k) => k.falta_factura && k.estado === "registrada")) return "por_registrar_compra";
  if (c.compras.some((k) => k.estado === "registrada" || k.estado === "recibida_parcial")) return "esperando_mercaderia";
  return "por_entregar";
}

/** «4», «2.5»: sin ceros de relleno, como las cantidades del pedido. */
export function cantidadLegible(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * La etapa en palabras, con las cifras cuando las hay: «Salió una parte:
 * faltan 4 de 10». Es lo que pidió Luis (27/10) y lo que la insignia pinta
 * en la lista y en la ficha.
 */
export function textoEtapa(etapa: Etapa, despacho?: DespachoDelPedido | null): string {
  if (etapa === "despacho_parcial" && despacho) {
    return `${ETIQUETA_ETAPA.despacho_parcial}: faltan ${cantidadLegible(
      despacho.confirmado - despacho.despachado,
    )} de ${cantidadLegible(despacho.confirmado)}`;
  }
  return ETIQUETA_ETAPA[etapa];
}
