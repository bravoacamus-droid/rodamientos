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
    return [{ tono: "danger", texto: "El próximo número tiene que ser 1 o más." }];
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
      texto: `No se puede bajar: ya se emitió el ${serie.correlativo_actual}, así que el próximo seguirá siendo el ${serie.correlativo_actual + 1}. Los correlativos nunca retroceden.`,
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
    // Aquí `nuevoInicial` ya es mayor que «Va por», así que es el próximo. Se
    // dice además cuál se da por usado: hasta el 28/10 la pantalla llamaba a
    // este número «en el que se quedó el sistema anterior», y quien lo
    // creyera teclearía 567 para seguir en la 568 y emitiría otra 567.
    texto:
      nuevoInicial > 1
        ? `El próximo documento será ${formatearNumero(serie, nuevoInicial)}. El ${nuevoInicial - 1} y los anteriores se dan por usados.`
        : `El próximo documento será ${formatearNumero(serie, nuevoInicial)}.`,
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

/*
  Los nombres y el orden, los de SIMPLE (02/11). Moisés, con su pantalla de
  series: *«documentos tiene que estar bien definido, porque tengo 2 notas de
  crédito, débito, y no sé cuál es cuál»*. La nota sobre factura y la nota
  sobre boleta son el mismo TIPO; lo que las separa es la primera letra de la
  serie (FC02 / BC02), que es como SUNAT las distingue.
*/

/** Una nota de boleta, o la boleta misma: Willy no emite boletas (14/10). */
function deBoleta(s: Pick<SerieDocumento, "tipo" | "serie">): boolean {
  if (s.tipo === "boleta") return true;
  return (s.tipo === "nota_credito" || s.tipo === "nota_debito") && s.serie.toUpperCase().startsWith("B");
}

/** Cómo se llama el documento que numera esta serie, como en SIMPLE. */
export function nombreDeSerie(s: Pick<SerieDocumento, "tipo" | "serie">): string {
  const a = deBoleta(s) ? "boleta" : "factura";
  switch (s.tipo) {
    case "factura":
      return "Factura de venta";
    case "boleta":
      return "Boleta de venta";
    case "nota_credito":
      return `Nota de crédito a ${a}`;
    case "nota_debito":
      return `Nota de débito a ${a}`;
    case "guia_remision":
      return "Guía de remisión remitente";
    case "cotizacion":
      return "Cotización";
    case "compra":
      return "Orden de compra";
    case "recepcion":
      return "Recepción de mercadería";
    case "ajuste_inventario":
      return "Ajuste de inventario";
  }
}

/**
 * ¿Se enseña sin pedirlo? Las reales activas que no son de boleta. Lo demás
 * —las de pruebas, las de boleta y las desactivadas— queda detrás de «Ver
 * también…»: *«solo déjame los importantes»*. Las de pruebas siguen activas
 * porque las usa sola la beta (179).
 */
export function esSerieImportante(s: Pick<SerieDocumento, "tipo" | "serie" | "activo" | "es_prueba">): boolean {
  return s.activo && !s.es_prueba && !deBoleta(s);
}

/** El orden de SIMPLE: factura, sus notas, guía, cotización, compras… */
function pesoSerie(s: Pick<SerieDocumento, "tipo" | "serie">): number {
  if (deBoleta(s)) return 20 + (s.tipo === "boleta" ? 0 : s.tipo === "nota_credito" ? 1 : 2);
  const orden: TipoDocumento[] = [
    "factura",
    "nota_credito",
    "nota_debito",
    "guia_remision",
    "cotizacion",
    "compra",
    "recepcion",
    "ajuste_inventario",
  ];
  const i = orden.indexOf(s.tipo);
  return i === -1 ? orden.length : i;
}

/**
 * Ordena las series como se leen: el orden de SIMPLE, y dentro de cada
 * documento la predeterminada arriba y las de pruebas al final.
 */
export function ordenarSeries(series: readonly SerieDocumento[]): SerieDocumento[] {
  return [...series].sort((a, b) => {
    const porTipo = pesoSerie(a) - pesoSerie(b);
    if (porTipo !== 0) return porTipo;
    if (a.predeterminada !== b.predeterminada) return a.predeterminada ? -1 : 1;
    if (a.es_prueba !== b.es_prueba) return a.es_prueba ? 1 : -1;
    return a.serie.localeCompare(b.serie);
  });
}
