/**
 * Reglas puras de las series y correlativos.
 *
 * La pieza clave es `proximoCorrelativo`, que reproduce EXACTAMENTE lo que
 * hace `siguiente_correlativo()` en la base:
 *
 *     greatest(correlativo_actual + 1, correlativo_inicial)
 *
 * Se duplica a propósito, y es la única duplicación que este módulo se
 * permite. El motivo: la pantalla tiene que poder decir «el próximo será
 * F001-00001235» ANTES de guardar, y la única forma de saberlo sin emitir un
 * documento es calcularlo aquí. Está cubierta por pruebas contra los mismos
 * casos límite que la función de Postgres.
 */

import { TIPOS_FISCALES, type SerieDocumento, type TipoDocumento } from "./tipos";

/** El número que se llevará el próximo documento de esta serie. */
export function proximoCorrelativo(
  serie: Pick<SerieDocumento, "correlativo_actual" | "correlativo_inicial">,
): number {
  return Math.max(serie.correlativo_actual + 1, serie.correlativo_inicial);
}

/** «F001-00001235». El relleno con ceros lo fija `longitud`. */
export function formatearNumero(
  serie: Pick<SerieDocumento, "serie" | "longitud">,
  correlativo: number,
): string {
  return `${serie.serie}-${String(correlativo).padStart(serie.longitud, "0")}`;
}

/** El número completo del próximo documento. */
export function proximoNumero(
  serie: Pick<
    SerieDocumento,
    "serie" | "longitud" | "correlativo_actual" | "correlativo_inicial"
  >,
): string {
  return formatearNumero(serie, proximoCorrelativo(serie));
}

/**
 * Cuántos números se saltarían al fijar este inicial.
 *
 * Es la cifra que hay que enseñar antes de guardar. Poner el inicial en 1235
 * cuando la serie va por el 12 no «continúa la numeración»: deja 1222 huecos,
 * y en una serie fiscal cada hueco es algo que explicarle a SUNAT.
 */
export function huecosQueDeja(
  serie: Pick<SerieDocumento, "correlativo_actual">,
  nuevoInicial: number,
): number {
  return Math.max(0, nuevoInicial - serie.correlativo_actual - 1);
}

export type Aviso = { tono: "info" | "warning" | "danger"; texto: string };

/**
 * Qué avisar antes de guardar un correlativo inicial.
 *
 * Se avisa, no se prohíbe: saltar la numeración es EXACTAMENTE lo que hay que
 * hacer al migrar desde el sistema anterior, y una pantalla que lo impidiera
 * obligaría a hacerlo por SQL, que es de donde veníamos.
 */
export function avisosDelInicial(
  serie: Pick<SerieDocumento, "correlativo_actual" | "serie" | "longitud" | "tipo">,
  nuevoInicial: number,
): Aviso[] {
  const avisos: Aviso[] = [];

  if (!Number.isInteger(nuevoInicial) || nuevoInicial < 1) {
    return [{ tono: "danger", texto: "El correlativo inicial tiene que ser 1 o más." }];
  }

  const digitos = String(nuevoInicial).length;
  if (digitos > serie.longitud) {
    avisos.push({
      tono: "danger",
      texto: `${nuevoInicial} no cabe en ${serie.longitud} dígitos. Sube la longitud o baja el número.`,
    });
  }

  if (nuevoInicial <= serie.correlativo_actual) {
    // No es un error: `siguiente_correlativo()` toma el mayor de los dos, así
    // que la serie sigue como estaba. Pero quien lo teclea espera otra cosa.
    avisos.push({
      tono: "warning",
      texto: `Esta serie ya va por el ${serie.correlativo_actual}, así que no cambiará nada: el próximo seguirá siendo el ${serie.correlativo_actual + 1}. Los correlativos nunca retroceden.`,
    });
    return avisos;
  }

  const huecos = huecosQueDeja(serie, nuevoInicial);
  if (huecos > 0) {
    const fiscal = TIPOS_FISCALES.includes(serie.tipo);
    avisos.push({
      tono: fiscal ? "warning" : "info",
      texto: fiscal
        ? `Se saltan ${huecos} ${huecos === 1 ? "número" : "números"}. En una serie que ve SUNAT, cada hueco hay que poder explicarlo — está bien si es porque los usó el sistema anterior.`
        : `Se saltan ${huecos} ${huecos === 1 ? "número" : "números"}. Es un documento interno, así que no hay que explicárselo a nadie.`,
    });
  }

  avisos.push({
    tono: "info",
    texto: `El próximo documento será ${formatearNumero(serie, Math.max(nuevoInicial, serie.correlativo_actual + 1))}.`,
  });

  return avisos;
}

/**
 * ¿Es un nombre de serie válido?
 *
 * Repite `series_formato` de la base (`^[A-Z0-9]{2,6}$`) para poder decirlo
 * mientras se teclea, en vez de después de un error de restricción.
 */
export function serieValida(serie: string): boolean {
  return /^[A-Z0-9]{2,6}$/.test(serie);
}

/**
 * Ordena las series como se leen: primero las que SUNAT numera, y dentro de
 * cada tipo la predeterminada arriba.
 */
export function ordenarSeries(series: readonly SerieDocumento[]): SerieDocumento[] {
  const peso = (t: TipoDocumento) => {
    const i = TIPOS_FISCALES.indexOf(t);
    return i === -1 ? TIPOS_FISCALES.length : i;
  };

  return [...series].sort((a, b) => {
    const porTipo = peso(a.tipo) - peso(b.tipo);
    if (porTipo !== 0) return porTipo;
    if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
    if (a.predeterminada !== b.predeterminada) return a.predeterminada ? -1 : 1;
    return a.serie.localeCompare(b.serie);
  });
}
