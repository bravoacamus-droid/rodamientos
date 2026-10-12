/**
 * El borrador de un formulario a medio llenar, guardado en el navegador
 * (13/10). La regla de la cotización (§BI), para todos los formularios.
 *
 * Luis: *«cuando también esté creando un usuario o rellenando algo, que me
 * salga seguir o comenzar desde cero; seguro se me salió o se cerró, y lo
 * que estaba llenando se borró. Nada de eso: quiero volver donde me quedé»*.
 *
 * Puro: sin `localStorage` ni reloj. El hook de la pantalla lee y escribe.
 */

export const VERSION_BORRADOR_FORMULARIO = 1;
/** Más viejo que esto ya no se ofrece. */
export const DIAS_DE_VIDA_FORMULARIO = 14;

export interface BorradorFormulario<T> {
  version: number;
  guardado: string;
  datos: T;
}

export function clave(formulario: string, id: string | null = null): string {
  return id ? `rodatech:${formulario}:editar:${id}` : `rodatech:${formulario}:nuevo`;
}

export function armar<T>(datos: T, ahora: Date): BorradorFormulario<T> {
  return { version: VERSION_BORRADOR_FORMULARIO, guardado: ahora.toISOString(), datos };
}

/** Lo leído, o null si no sirve: roto, de otra versión o viejo. */
export function leer<T>(crudo: string | null, ahora: Date): BorradorFormulario<T> | null {
  if (!crudo) return null;
  let b: Partial<BorradorFormulario<T>>;
  try {
    b = JSON.parse(crudo) as Partial<BorradorFormulario<T>>;
  } catch {
    return null;
  }
  if (!b || b.version !== VERSION_BORRADOR_FORMULARIO || b.datos === undefined || b.datos === null) return null;
  const guardado = new Date(String(b.guardado));
  if (Number.isNaN(guardado.getTime())) return null;
  if (ahora.getTime() - guardado.getTime() > DIAS_DE_VIDA_FORMULARIO * 86_400_000) return null;
  return { version: VERSION_BORRADOR_FORMULARIO, guardado: guardado.toISOString(), datos: b.datos as T };
}

/** ¿Dice algo distinto de lo que hay en pantalla? */
export function distinto<T>(a: T, b: T): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
