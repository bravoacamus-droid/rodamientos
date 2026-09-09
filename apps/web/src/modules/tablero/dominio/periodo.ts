import type { Grano } from "@/modules/reportes";

/**
 * ¿El último punto de la serie cubre un periodo que todavía no ha terminado?
 *
 * ---------------------------------------------------------------------------
 * El engaño que esto evita
 * ---------------------------------------------------------------------------
 * El 09/09, mirando los últimos doce meses, el tablero dibujaba una curva que
 * subía todo el año y se desplomaba a cero en el último punto. Cualquiera que
 * lo mire concluye que las ventas se hundieron en septiembre.
 *
 * No se hundieron: septiembre llevaba **nueve días**. Se estaba comparando un
 * mes a medias contra once meses enteros, y en un gráfico eso no se ve — se
 * ve una caída.
 *
 * Es el fallo clásico de toda serie temporal, y pasa SIEMPRE que el rango
 * llega hasta hoy, que en un tablero es el caso normal y no la excepción. Por
 * eso no basta con dibujarlo bien: hay que decir que ese punto va a medias.
 *
 * ---------------------------------------------------------------------------
 * Solo compara etiquetas de calendario
 * ---------------------------------------------------------------------------
 * Nada de `new Date()`: las fechas llegan como `yyyy-mm-dd` y compararlas como
 * texto es exacto y no depende de zonas horarias. Convertirlas a `Date` las
 * interpretaría como medianoche UTC, y en Lima —cinco horas por detrás— el
 * último día del mes caería en el mes siguiente.
 */
export function periodoEnCurso(
  /** Inicio del periodo del último punto, `yyyy-mm-dd`. */
  periodo: string,
  grano: Grano,
  /** Hoy en Lima, `yyyy-mm-dd`. */
  hoy: string,
): boolean {
  if (!periodo || !hoy) return false;

  switch (grano) {
    /*
      Un día está en curso si es HOY: a las nueve de la mañana llevas una hora
      de ventas y el gráfico ya lo pinta contra días enteros.
    */
    case "dia":
      return periodo.slice(0, 10) === hoy;

    case "mes":
      return periodo.slice(0, 7) === hoy.slice(0, 7);

    case "anio":
      return periodo.slice(0, 4) === hoy.slice(0, 4);

    /*
      La semana es la única que no se puede resolver comparando prefijos, y
      tampoco hace falta: la serie la agrupa por su día de inicio, así que la
      semana en curso es la que empezó hace menos de siete días. Se cuenta con
      aritmética de días sobre las dos fechas, sin `Date`.
    */
    case "semana": {
      const dias = diasEntre(periodo.slice(0, 10), hoy);
      return dias >= 0 && dias < 7;
    }

    default:
      return false;
  }
}

/** Días de `a` a `b`, las dos en `yyyy-mm-dd`. Negativo si `b` es anterior. */
function diasEntre(a: string, b: string): number {
  return Math.round((juliano(b) - juliano(a)));
}

/**
 * Día juliano de una fecha ISO, sin `Date`.
 *
 * Es el algoritmo de Fliegel–Van Flandern: aritmética entera pura, sin zonas
 * horarias ni horario de verano. Se usa solo para restar dos fechas.
 */
function juliano(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return 0;
  const x = Math.floor((14 - m) / 12);
  const y = a + 4800 - x;
  const z = m + 12 * x - 3;
  return d + Math.floor((153 * z + 2) / 5) + 365 * y + Math.floor(y / 4)
    - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}
