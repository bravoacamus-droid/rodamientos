/**
 * Eliminar una cotización (164): lo que el diálogo dice antes de confirmar.
 *
 * Luis, 27/10: *«ponte que elimino la COT-010, la cotización que voy a crear
 * tiene que ser la 010, no la 11»*. Eso solo pasa si es la ÚLTIMA de su
 * serie; si hay otra detrás, bajar el contador haría chocar a la siguiente
 * con la que existe, así que su número se pierde. Las dos cosas se dicen
 * ANTES de pulsar, no después: es lo que decide si conviene eliminarla o
 * anularla.
 */

/** Lo que devuelve `previa_eliminar_cotizacion`. */
export interface PreviaEliminar {
  numero: string;
  /** Por qué no se puede, en castellano; null si se puede. */
  motivo: string | null;
  /** Es la última de su serie: el número vuelve. */
  ultima: boolean;
  /** El número que saldrá en la próxima, si es la última. */
  siguiente: string | null;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Lee lo que contesta la RPC sin fiarse de su forma. */
export function leerPrevia(data: unknown): PreviaEliminar | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const numero = texto(d.numero);
  if (!numero) return null;
  const ultima = d.ultima === true;
  return {
    numero,
    motivo: texto(d.motivo),
    ultima,
    siguiente: ultima ? texto(d.siguiente) : null,
  };
}

/** La frase sobre el número, la que va en grande en el diálogo. */
export function avisoDelNumero(p: PreviaEliminar): string {
  if (p.ultima && p.siguiente) return `La próxima cotización volverá a ser la ${p.siguiente}.`;
  return `El número ${p.numero} no se volverá a usar: hay cotizaciones creadas después de ella.`;
}

/** El aviso al terminar, ya en la lista. */
export function avisoEliminada(r: { numero: string; ultima: boolean; siguiente: string | null }): string {
  return r.ultima && r.siguiente
    ? `La próxima cotización será la ${r.siguiente}.`
    : `El número ${r.numero} queda sin usar.`;
}
