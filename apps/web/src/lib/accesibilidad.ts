/**
 * Preferencias de accesibilidad (27/11).
 *
 * Willy no ve bien, y eso ya obligó a subir la base a 17 px, a poner un suelo
 * de 14 px a lo que hay que leer y a rehacer pantallas enteras. Pero 17 px es
 * un número para todos, y él no es todos: la propuesta de Luis fue que cada
 * uno pueda subir la letra, el contraste y quitar el movimiento a su gusto.
 *
 * Se guardan en una COOKIE y no en `localStorage` por una razón concreta: el
 * servidor la lee y pinta el `<html>` ya con el tamaño y el contraste puestos.
 * Con `localStorage` la página saldría primero a 17 px y daría un salto al
 * cargar, en cada pantalla. Es el mismo patrón que el menú recogido.
 *
 * Es por EQUIPO, no por persona: si Willy entra desde otra computadora, la
 * elige otra vez. Pasarlo a `perfiles` es una migración y una Server Action;
 * se hace el día que alguien lo eche en falta.
 *
 * El tema claro/oscuro NO va aquí: ya lo lleva `next-themes` en su propia
 * clave, y la pantalla de accesibilidad lo muestra junto al resto.
 *
 * Puro: sin cookies ni DOM. Quien escribe y quien lee la cookie están en
 * `app/layout.tsx` y en la pantalla.
 */

export const COOKIE_ACCESIBILIDAD = "rodatech.accesibilidad";

export const TAMANOS_LETRA = ["normal", "grande", "muy-grande", "enorme"] as const;
export type TamanoLetra = (typeof TAMANOS_LETRA)[number];

export interface Preferencias {
  letra: TamanoLetra;
  contrasteAlto: boolean;
  sinMovimiento: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  letra: "normal",
  contrasteAlto: false,
  sinMovimiento: false,
};

/** Cómo se llama cada tamaño en pantalla, y cuántos píxeles son de base. */
export const ETIQUETA_LETRA: Record<TamanoLetra, { nombre: string; px: number }> = {
  normal: { nombre: "Normal", px: 17 },
  grande: { nombre: "Grande", px: 19 },
  "muy-grande": { nombre: "Más grande", px: 21 },
  enorme: { nombre: "Muy grande", px: 24 },
};

/**
 * «letra:grande|contraste:alto|movimiento:no».
 *
 * Texto plano y no JSON: un valor de cookie no admite comas ni comillas sin
 * codificar, y así se lee a simple vista en las herramientas del navegador.
 * Solo se escribe lo que difiere de lo normal.
 */
export function serializar(p: Preferencias): string {
  const partes: string[] = [];
  if (p.letra !== "normal") partes.push(`letra:${p.letra}`);
  if (p.contrasteAlto) partes.push("contraste:alto");
  if (p.sinMovimiento) partes.push("movimiento:no");
  return partes.join("|");
}

/**
 * Lo contrario, y tolerante: una cookie vieja, recortada o escrita a mano no
 * puede romper el `<html>` de todas las pantallas. Lo que no se entiende se
 * ignora y queda lo normal.
 */
export function leerPreferencias(valor: string | null | undefined): Preferencias {
  const p = { ...PREFERENCIAS_POR_DEFECTO };
  if (!valor) return p;
  for (const parte of valor.split("|")) {
    const [clave, dato] = parte.split(":");
    if (clave === "letra" && (TAMANOS_LETRA as readonly string[]).includes(dato ?? "")) {
      p.letra = dato as TamanoLetra;
    } else if (clave === "contraste") {
      p.contrasteAlto = dato === "alto";
    } else if (clave === "movimiento") {
      p.sinMovimiento = dato === "no";
    }
  }
  return p;
}

/**
 * Los atributos que lleva el `<html>`. Solo los que no son lo normal: un
 * `data-letra="normal"` no hace nada y ensucia el HTML de cada pantalla.
 */
export function atributosHtml(p: Preferencias): Record<string, string | undefined> {
  return {
    "data-letra": p.letra === "normal" ? undefined : p.letra,
    "data-contraste": p.contrasteAlto ? "alto" : undefined,
    "data-movimiento": p.sinMovimiento ? "reducido" : undefined,
  };
}
