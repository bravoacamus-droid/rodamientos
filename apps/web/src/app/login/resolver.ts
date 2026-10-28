import { esCorreo } from "@/lib/usuario";

/**
 * A qué cuenta va un intento de entrar (171).
 *
 * Lo escrito puede ser un correo o un usuario. Supabase solo entiende el
 * correo, así que el usuario se traduce antes. Y de aquí salen dos cosas:
 *
 *   · `correo`: con qué se llama a `signInWithPassword`. Null si el usuario
 *     no existe — y entonces el login contesta EXACTAMENTE lo mismo que con
 *     una contraseña mala, para no decirle a nadie qué usuarios hay.
 *   · `claveLimite`: por qué se cuentan los fallos (136). Es la CUENTA a la
 *     que se resuelve, no lo que se escribió: si fuera lo escrito, cinco
 *     fallos con el correo y cinco con el usuario serían diez intentos contra
 *     la misma contraseña. Un usuario que no existe se cuenta aparte, con un
 *     prefijo que no puede chocar con ningún correo (lleva «:» y no «@»).
 *
 * Pura: la búsqueda se le pasa, para probarla sin base.
 */
export interface CuentaResuelta {
  correo: string | null;
  claveLimite: string;
}

export async function resolverCuenta(
  identificador: string,
  buscarCorreo: (usuario: string) => Promise<string | null>,
): Promise<CuentaResuelta> {
  const escrito = identificador.trim().toLowerCase();
  if (esCorreo(escrito)) return { correo: escrito, claveLimite: escrito };

  let correo: string | null = null;
  try {
    correo = (await buscarCorreo(escrito))?.trim().toLowerCase() || null;
  } catch {
    // Si la búsqueda falla, es como si no existiera: mensaje genérico.
    correo = null;
  }
  return correo ? { correo, claveLimite: correo } : { correo: null, claveLimite: `usuario:${escrito}` };
}
