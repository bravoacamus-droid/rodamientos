/**
 * La retención del IGV en la factura (14/10).
 *
 * Willy, reunión del 13/10: *«en el caso mío son solamente retenciones… el
 * cliente agente de retención me retiene el 3 %… pero ojo, que las
 * retenciones aplican, por ley, para montos mayores o iguales a 700 soles,
 * equivalente en dólares»*. Y en observaciones, siempre, una de dos frases:
 * *«operación sujeta spot, retención 3 %, así tal cual»* o *«operación no
 * sujeta spot»*.
 *
 * Puro: el tipo de cambio llega de fuera (SUNAT, el del día de la factura).
 */

export const RETENCION_PCT = 3;
/** Desde cuánto se retiene, en soles. */
export const UMBRAL_RETENCION_SOLES = 700;

/*
  Las frases, letra por letra como las imprime su sistema de hoy (F002-564 y
  F002-565, 12/10/2026, que Luis pasó el 14/10).
*/
export const LEYENDA_CON_RETENCION = "OPERACION SUJETA A SPOT: RETENCION (3%)";
export const LEYENDA_SIN_RETENCION = "OPERACION NO SUJETA A SPOT.";

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function montoRetencion(total: number): number {
  return redondear2((total * RETENCION_PCT) / 100);
}

/** Lo que el cliente paga de verdad: el total menos lo retenido. */
export function netoAPagar(total: number): number {
  return redondear2(total - montoRetencion(total));
}

/**
 * ¿Llega la factura al umbral? `null` si no se sabe (sin tipo de cambio):
 * entonces no se impide nada, se avisa.
 */
export function alcanzaUmbral(totalUsd: number, tipoCambio: number | null): boolean | null {
  if (!tipoCambio || !(tipoCambio > 0)) return null;
  return redondear2(totalUsd * tipoCambio) >= UMBRAL_RETENCION_SOLES;
}

const ES_LEYENDA = /^\s*OPERACI[OÓ]N\s+(NO\s+)?SUJETA\s+(AL?\s+)?SPOT[^\n]*$/i;

/**
 * Las observaciones con la frase que toca en el primer renglón.
 *
 * Cambiar de «con» a «sin» cambia la frase, no la duplica; y lo que escribió
 * la persona debajo se respeta. `null` = todavía no se eligió: sin frase.
 */
export function conLeyendaSpot(observaciones: string, retiene: boolean | null): string {
  const resto = observaciones
    .split("\n")
    .filter((l) => !ES_LEYENDA.test(l))
    .join("\n")
    .replace(/^\n+/, "");
  if (retiene === null) return resto;
  const leyenda = retiene ? LEYENDA_CON_RETENCION : LEYENDA_SIN_RETENCION;
  return resto ? `${leyenda}\n${resto}` : leyenda;
}

/**
 * Lo que dice cada cuota cuando hay retención: el PENDIENTE, no el total.
 *
 * Así lo imprime su F002-564 —«DETALLE CUOTAS PAGO PENDIENTE (USD 234.94)»,
 * total 242.21 menos 7.27 retenidos— y así lo exige SUNAT: con retención, el
 * monto pendiente y la suma de las cuotas son el total menos lo retenido. La
 * base guarda las cuotas sobre el total (la retención entra después como un
 * cobro «Retención»), así que esto se calcula al imprimir y al enviar.
 * Se reparte en proporción y el redondeo lo absorbe la última.
 */
export function cuotasNetas<T extends { monto: number }>(cuotas: readonly T[], retencion: number): T[] {
  if (!(retencion > 0) || cuotas.length === 0) return [...cuotas];
  const total = cuotas.reduce((a, q) => a + q.monto, 0);
  if (!(total > 0)) return [...cuotas];
  const neto = redondear2(total - retencion);
  let acumulado = 0;
  return cuotas.map((q, i) => {
    const monto = i === cuotas.length - 1 ? redondear2(neto - acumulado) : redondear2((q.monto * neto) / total);
    acumulado = redondear2(acumulado + monto);
    return { ...q, monto };
  });
}

/**
 * ¿Se retiene? El interruptor de la factura (14/10).
 *
 * Por debajo del umbral, nunca (la ley). Si la persona lo tocó, manda lo que
 * tocó. Si no, se enciende solo al llegar a S/ 700 Y si el cliente es agente
 * de retención (118, Luis 15/10: «solo es si el cliente es agente de
 * retención»). Sin tipo de cambio (`null`) queda apagado y la pantalla avisa.
 */
export function seRetiene(
  llegaAlUmbral: boolean | null,
  eleccion: "con" | "sin" | null,
  clienteEsAgente: boolean,
): boolean {
  if (llegaAlUmbral === false) return false;
  if (eleccion) return eleccion === "con";
  return llegaAlUmbral === true && clienteEsAgente;
}
