import { z } from "zod";

/**
 * El nombre de usuario con el que también se entra (171).
 *
 * Luis, 29/10: *«aparte de ingresar por correo también pueda ingresar por
 * usuario»*. Las mismas reglas que la base (`perfiles_usuario_formato`):
 * de 3 a 30 caracteres, solo `a-z 0-9 . _ -`, en minúsculas y sin «@».
 *
 * Sin «@» no es un capricho: es lo que deja al login saber qué le escribieron
 * —con «@» es un correo, sin «@» es un usuario— y lo que impide ponerse como
 * usuario el correo de otro.
 *
 * Los mensajes van en este orden a propósito: lo primero que se dice es lo
 * más probable (un espacio, una tilde), no la regla entera.
 *
 * Pura y sin Next, para probarla. La usan el login, «Mi perfil» y Usuarios,
 * en el navegador y en el servidor, así que los mensajes son los mismos.
 */

export const USUARIO_MINIMO = 3;
export const USUARIO_MAXIMO = 30;

export const MENSAJE_USUARIO_REPETIDO = "Ese usuario ya lo tiene otra persona.";

/** Null si vale; si no, lo que hay que corregir. Recibe el texto ya normalizado. */
export function problemaUsuario(usuario: string): string | null {
  if (usuario.includes("@")) return "El usuario no lleva «@». Eso es un correo.";
  if (/\s/.test(usuario)) return "El usuario no puede tener espacios.";
  if (!/^[a-z0-9._-]*$/.test(usuario)) {
    return "El usuario solo puede tener letras sin tilde ni «ñ», números, punto, guion y guion bajo.";
  }
  if (usuario.length < USUARIO_MINIMO || usuario.length > USUARIO_MAXIMO) {
    return `El usuario tiene que tener de ${USUARIO_MINIMO} a ${USUARIO_MAXIMO} caracteres.`;
  }
  return null;
}

/** «  WFernandez » → «wfernandez». Lo mismo que hace el disparador de la 171. */
export function normalizarUsuario(texto: string): string {
  return texto.trim().toLowerCase();
}

/**
 * Un usuario opcional: vacío es «no tengo» y se guarda como null.
 */
export const esquemaUsuarioOpcional = z
  .string()
  .max(200)
  .transform(normalizarUsuario)
  .superRefine((v, ctx) => {
    if (v === "") return;
    const p = problemaUsuario(v);
    if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p });
  })
  .transform((v) => (v === "" ? null : v));

/** ¿Lo que se escribió en el login es un correo? Si no, es un usuario. */
export function esCorreo(identificador: string): boolean {
  return identificador.includes("@");
}

/**
 * ¿Este error de la base es el del usuario repetido? Por el código de
 * Postgres (23505) y el nombre del índice, no por el texto, que cambia.
 */
export function esUsuarioRepetido(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown };
  const texto = `${String(e.message ?? "")} ${String(e.details ?? "")}`;
  return e.code === "23505" && /ux_perfiles_usuario/.test(texto);
}
