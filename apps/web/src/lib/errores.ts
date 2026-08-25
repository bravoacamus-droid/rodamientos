/**
 * Mensaje legible a partir de cualquier cosa que se pueda lanzar o devolver.
 *
 * Existe por un fallo concreto y caro: los siete módulos hacían
 *
 *     e instanceof Error ? e.message : String(e)
 *
 * y el error de PostgREST **no es un `Error`**, es un objeto plano
 * `{ message, details, hint, code }`. `String()` sobre él da `[object Object]`,
 * así que cada fallo de consulta se mostraba en pantalla exactamente así.
 *
 * El coste real no fue la fealdad: la ficha de producto llevaba días rota por
 * un `PGRST200` —una relación inexistente entre `productos` y `familias`— y el
 * mensaje que lo decía con nombre y apellidos se estaba tirando a la basura.
 * Sin él, desde la pantalla, «no abre nada».
 *
 * `details` y `hint` se conservan porque son justo la parte accionable:
 * PostgREST llega a sugerir la tabla correcta.
 */
export function mensajeDeError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;

  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const partes: string[] = [];

    if (typeof o.message === "string" && o.message) partes.push(o.message);
    if (typeof o.details === "string" && o.details) partes.push(o.details);
    if (typeof o.hint === "string" && o.hint) partes.push(o.hint);

    if (partes.length > 0) {
      // El código va al final entre paréntesis: es lo que se busca para
      // rastrear el fallo, pero no es lo que el operador tiene que leer.
      const codigo = typeof o.code === "string" && o.code ? ` (${o.code})` : "";
      return `${partes.join(" · ")}${codigo}`;
    }
  }

  return "Error desconocido.";
}

/** Envoltura para las funciones `fallo()` de cada módulo. */
export function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: mensajeDeError(e) };
}
