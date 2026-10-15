import { z } from "zod";

/**
 * Lo que se escribe en el login, validado antes de molestar a Supabase
 * (revisión de producción del 15/10). Luis: *«que no acepte espacios, que
 * tenga validación»*.
 *
 * El correo se limpia (espacios de los bordes, mayúsculas) y no admite
 * espacios en medio. La contraseña NO se recorta: se compararía con otra
 * distinta de la que se guardó. Por eso se rechaza la que empieza o termina
 * con espacio, que casi siempre es un espacio pegado al copiarla.
 *
 * Pura y sin Next, para probarla.
 */
export const esquemaLogin = z.object({
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Escriba su correo.")
    .refine((v) => !/\s/.test(v), "El correo no puede tener espacios.")
    .pipe(z.string().email("Ese correo no es válido. Revise que esté bien escrito.")),
  clave: z
    .string()
    .refine((v) => v.trim().length > 0, "Escriba su contraseña.")
    .refine((v) => v === v.trim(), "La contraseña no puede empezar ni terminar con un espacio.")
    .refine((v) => v.length <= 72, "La contraseña es demasiado larga."),
});

/**
 * Solo una ruta interna, para que `destino` no sirva de trampolín a otro
 * dominio. `startsWith("/")` no basta: `/\evil.com` y `/<tab>/evil.com` el
 * navegador los convierte en `//evil.com`.
 */
export function destinoSeguro(valor: unknown): string {
  const ruta = typeof valor === "string" ? valor : "";
  if (!/^\/(?![/\\])/.test(ruta) || /[\s\\]/.test(ruta)) return "/dashboard";
  try {
    const u = new URL(ruta, "http://interno");
    return u.origin === "http://interno" ? u.pathname + u.search : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

/** Las reglas de una contraseña NUEVA (perfil y primer día). Null si vale. */
export function problemaContrasenaNueva(nueva: unknown, minimo: number): string | null {
  if (typeof nueva !== "string") return "Datos no válidos.";
  if (nueva !== nueva.trim()) return "La contraseña no puede empezar ni terminar con un espacio.";
  if (!/\S/.test(nueva) || nueva.length < minimo) return `La contraseña nueva necesita al menos ${minimo} caracteres.`;
  if (nueva.length > 72) return "La contraseña nueva puede tener como máximo 72 caracteres.";
  return null;
}
