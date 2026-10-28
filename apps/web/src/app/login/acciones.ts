"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { clienteServidor } from "@rodatech/db/servidor";
import { clienteAdmin, hayClaveAdmin } from "@rodatech/db/admin";

import { apuntarIntento, esperaParaEntrar, minutosDeEspera } from "@/lib/limite-login";

import { resolverCuenta } from "./resolver";
import { destinoSeguro, esquemaLogin, MENSAJE_CREDENCIALES } from "./validar";

/**
 * El correo de quien tiene ese usuario, o null (171).
 *
 * Con la clave de servicio porque `correo_de_usuario` SOLO la ejecuta
 * `service_role`: abierta a `anon`, cualquiera con la clave pública del
 * navegador sacaría el correo de cada empleado probando nombres. Lo que
 * devuelve se queda en el servidor; al navegador no le llega nunca.
 *
 * Sin la clave (desarrollo) no se resuelve, y se entra solo con el correo.
 */
async function buscarCorreoDeUsuario(usuario: string): Promise<string | null> {
  if (!hayClaveAdmin()) return null;
  const { data, error } = await clienteAdmin().rpc("correo_de_usuario", { p_usuario: usuario });
  if (error) return null;
  return typeof data === "string" && data ? data : null;
}

export interface ResultadoLogin {
  error: string | null;
  /**
   * El correo que se escribió, para devolverlo al campo: React vacía el
   * formulario al terminar la acción y Willy tendría que reescribirlo tras
   * cada error.
   */
  correo?: string;
}

/**
 * Inicia sesión desde el servidor.
 *
 * Va por Server Action y no por el cliente del navegador a propósito: hacerlo
 * en el navegador metía `@supabase/supabase-js` en el bundle de la primera
 * pantalla que ve cualquiera, ~175 kB para tres campos de formulario. Aquí el
 * navegador solo envía el formulario.
 */
export async function iniciarSesion(
  _previo: ResultadoLogin,
  datos: FormData,
): Promise<ResultadoLogin> {
  const escrito = String(datos.get("correo") ?? "").slice(0, 200);
  const revision = esquemaLogin.safeParse({ correo: escrito, clave: String(datos.get("clave") ?? "") });
  if (!revision.success) {
    return { error: revision.error.issues[0]?.message ?? "Revise el correo o usuario y la contraseña.", correo: escrito.trim() };
  }
  // `correo` es lo que escribió —correo o usuario— y es lo que vuelve al
  // campo. Nunca el correo al que se resolvió su usuario: devolverlo sería
  // decirle a cualquiera de quién es.
  const { correo, clave } = revision.data;

  // Correo o usuario (171). El límite cuenta por la CUENTA resuelta, para que
  // alternar usuario y correo no dé el doble de intentos.
  const cuenta = await resolverCuenta(correo, buscarCorreoDeUsuario);

  // El límite propio (136): por cuenta y por IP, antes de llamar a Supabase.
  const espera = await esperaParaEntrar(cuenta.claveLimite);
  if (espera > 0) {
    return {
      // Puede ser por intentos de otra persona con este correo: se dice (21/10).
      error: `Por seguridad, esta cuenta está en pausa ${minutosDeEspera(espera)} porque se escribió mal la contraseña varias veces. Si no fue usted, avise a Gerencia.`,
      correo,
    };
  }

  const supabase = await clienteServidor();
  /*
    Un usuario que no existe también pasa por Supabase, con un correo al azar
    que no existe. No es para entrar —no puede—: es para que tarde lo mismo que
    un usuario que existe con la contraseña mala. Si contestara al instante,
    el reloj diría qué usuarios hay aunque el mensaje no lo diga.
  */
  const { error } = await supabase.auth.signInWithPassword({
    email: cuenta.correo ?? `${randomUUID()}@usuario.invalid`,
    password: clave,
  });

  if (error || !cuenta.correo) {
    // El mensaje no revela si el correo o el usuario existen. Por código y no
    // por el texto en inglés, que Supabase puede cambiar.
    if (error && (error.status === 429 || error.code === "over_request_rate_limit")) {
      return { error: "Demasiados intentos. Espere unos minutos y vuelva a probar.", correo };
    }
    // Imposible con un correo al azar, pero si Supabase hubiera abierto
    // sesión con él, se cierra: nadie entra por un usuario que no existe.
    if (!error) await supabase.auth.signOut();
    await apuntarIntento(cuenta.claveLimite, false);
    return {
      error:
        !error || error.code === "invalid_credentials" || error.message === "Invalid login credentials"
          ? MENSAJE_CREDENCIALES
          : "No se pudo iniciar sesión. Intente de nuevo.",
      correo,
    };
  }
  await apuntarIntento(cuenta.claveLimite, true);

  // redirect() lanza para cortar el flujo, así que va fuera de cualquier
  // try/catch y después de que la cookie de sesión ya quedó escrita.
  redirect(destinoSeguro(datos.get("destino")));
}

/** Cierra la sesión y borra la cookie. También del lado del servidor. */
export async function cerrarSesion(): Promise<void> {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
