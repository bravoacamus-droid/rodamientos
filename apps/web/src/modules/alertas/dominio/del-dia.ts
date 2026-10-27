/**
 * El recuadro «Lo que se está quedando atrás» del tablero (161).
 *
 * Luis, 27/10: *«que me avise que tengo cotizaciones sin cerrar o aprobar,
 * que no se haya sacado una guía… que el app sea interactivo y ayude al sr
 * Willy en su día a día»*. La bandeja ya tiene los avisos uno a uno; esto es
 * la cuenta, en una frase por cosa, para leerla de un vistazo por la mañana.
 *
 * Puro: recibe las alertas vivas de esos tipos y devuelve las filas.
 */

import { TIPOS_DEL_DIA_A_DIA, type TipoAlerta } from "./tipos";

export interface FilaDelDia {
  tipo: TipoAlerta;
  cuantas: number;
  /** «4 pedidos sin guía». */
  texto: string;
  /** A dónde lleva «Ver». */
  enlace: string;
}

/** Singular y plural de cada cosa, en palabras de Willy. */
const FRASE: Partial<Record<TipoAlerta, [string, string]>> = {
  cotizacion_borrador: ["cotización sin mandar al cliente", "cotizaciones sin mandar al cliente"],
  cotizacion_sin_respuesta: ["cotización sin respuesta del cliente", "cotizaciones sin respuesta del cliente"],
  cotizacion_por_vencer: ["cotización por vencer", "cotizaciones por vencer"],
  cotizaciones_sin_cerrar: ["cotización vencida sin respuesta", "cotizaciones vencidas sin respuesta"],
  compra_sin_recibir: ["compra que no llega", "compras que no llegan"],
  pedido_sin_guia: ["pedido sin guía", "pedidos sin guía"],
  pedido_por_despachar: ["pedido a medio despachar", "pedidos a medio despachar"],
  guia_sin_facturar: ["guía sin facturar", "guías sin facturar"],
};

/**
 * Una fila por tipo con algo pendiente, en el orden del flujo.
 *
 * `cotizaciones_sin_cerrar` es UN aviso que lleva la cuenta en `valor` (161):
 * se cuentan las cotizaciones, no el aviso, y «Ver» lleva a la lista de
 * cotizaciones enviadas, donde se cierran. Los demás llevan a la bandeja
 * filtrada por ese tipo, con el enlace de cada uno.
 */
export function resumirDelDia(alertas: readonly { tipo: string; valor: number | null }[]): FilaDelDia[] {
  const cuenta = new Map<string, number>();
  for (const a of alertas) {
    const suma = a.tipo === "cotizaciones_sin_cerrar" ? Math.max(0, Math.round(Number(a.valor ?? 0))) : 1;
    cuenta.set(a.tipo, (cuenta.get(a.tipo) ?? 0) + suma);
  }

  return TIPOS_DEL_DIA_A_DIA.flatMap((tipo) => {
    const n = cuenta.get(tipo) ?? 0;
    const frase = FRASE[tipo];
    if (n === 0 || !frase) return [];
    return [
      {
        tipo,
        cuantas: n,
        texto: `${n} ${n === 1 ? frase[0] : frase[1]}`,
        enlace: tipo === "cotizaciones_sin_cerrar" ? "/cotizaciones?estado=enviada" : `/alertas?tipo=${tipo}`,
      },
    ];
  });
}
