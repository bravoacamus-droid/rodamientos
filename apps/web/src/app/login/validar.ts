import { z } from "zod";

import { esCorreo, problemaUsuario } from "@/lib/usuario";

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
  /*
    El campo se sigue llamando `correo`, pero desde la 171 acepta también el
    usuario (Luis, 29/10: «aparte de ingresar por correo también pueda
    ingresar por usuario»). Con «@» es un correo; sin «@», un usuario.
  */
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Escriba su correo o su usuario.")
    .refine((v) => !/\s/.test(v), "El correo o el usuario no puede tener espacios.")
    .superRefine((v, ctx) => {
      if (/\s/.test(v)) return; // ya lo dijo el refine de arriba
      const problema = esCorreo(v)
        ? z.string().email().safeParse(v).success
          ? null
          : "Ese correo no es válido. Revise que esté bien escrito."
        : problemaUsuario(v);
      if (problema) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problema });
    }),
  clave: z
    .string()
    .refine((v) => v.trim().length > 0, "Escriba su contraseña.")
    .refine((v) => v === v.trim(), "La contraseña no puede empezar ni terminar con un espacio.")
    .refine((v) => v.length <= 72, "La contraseña es demasiado larga."),
});

/**
 * El único mensaje para «no entra»: correo que no existe, usuario que no
 * existe o contraseña mala. Si fueran distintos, el login serviría para
 * averiguar qué cuentas hay (171).
 */
export const MENSAJE_CREDENCIALES = "Correo, usuario o contraseña incorrectos.";

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
