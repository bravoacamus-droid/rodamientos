/**
 * Cómo está la copia de seguridad, dicho para quien no sabe qué es un
 * respaldo.
 *
 * Hasta el 23/10 la única constancia de una copia era una carpeta en el disco
 * de quien la corrió, y la última era del 07/10 con un tercio de la base
 * fuera. Ahora `scripts/respaldar.mjs` deja una fila en `respaldos` (147) y
 * esto decide qué se dice en pantalla.
 */

/** Una semana: lo que se pierde, como mucho, si hoy se rompe todo. */
export const DIAS_MAXIMOS_SIN_COPIA = 7;

export type Respaldo = { fecha: string; ok: boolean; tablas: number; filas: number; archivos: number };

export type EstadoRespaldo =
  | { nivel: "nunca" }
  | { nivel: "bien" | "atrasada"; ultimaBuena: Respaldo; dias: number; falloDespues: boolean };

/**
 * @param ultimaBuena la última copia que salió bien, si hay alguna.
 * @param ultima la última que se intentó, haya salido bien o no.
 */
export function estadoRespaldo(
  ultimaBuena: Respaldo | null,
  ultima: Respaldo | null,
  ahora: Date,
): EstadoRespaldo {
  if (!ultimaBuena) return { nivel: "nunca" };
  const dias = Math.max(
    0,
    Math.floor((ahora.getTime() - new Date(ultimaBuena.fecha).getTime()) / 86_400_000),
  );
  // Si después de la buena se intentó otra y falló, se dice: quien la corrió
  // puede creer que tiene una copia de hoy.
  const falloDespues =
    !!ultima && !ultima.ok && new Date(ultima.fecha).getTime() > new Date(ultimaBuena.fecha).getTime();
  return {
    nivel: dias > DIAS_MAXIMOS_SIN_COPIA ? "atrasada" : "bien",
    ultimaBuena,
    dias,
    falloDespues,
  };
}

/** «hoy», «ayer», «hace 9 días». */
export function haceCuanto(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
