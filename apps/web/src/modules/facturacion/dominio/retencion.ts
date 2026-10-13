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

export const LEYENDA_CON_RETENCION = "OPERACIÓN SUJETA SPOT, RETENCIÓN 3%";
export const LEYENDA_SIN_RETENCION = "OPERACIÓN NO SUJETA SPOT";

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

const ES_LEYENDA = /^\s*OPERACI[OÓ]N\s+(NO\s+)?SUJETA\s+(AL\s+)?SPOT[^\n]*$/i;

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
