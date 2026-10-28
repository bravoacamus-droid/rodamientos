"use server";

import { redirect } from "next/navigation";
import { clienteServidor } from "@rodatech/db/servidor";

import { apuntarIntento, esperaParaEntrar, minutosDeEspera } from "@/lib/limite-login";

import { destinoSeguro, esquemaLogin } from "./validar";

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
    return { error: revision.error.issues[0]?.message ?? "Revise el correo y la contraseña.", correo: escrito.trim() };
  }
  const { correo, clave } = revision.data;

  // El límite propio (136): por correo y por IP, antes de llamar a Supabase.
  const espera = await esperaParaEntrar(correo);
  if (espera > 0) {
    return {
      // Puede ser por intentos de otra persona con este correo: se dice (21/10).
      error: `Por seguridad, esta cuenta está en pausa ${minutosDeEspera(espera)} porque se escribió mal la contraseña varias veces. Si no fue usted, avise a Gerencia.`,
      correo,
    };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: clave,
  });

  if (error) {
    // El mensaje no revela si el correo existe. Por código y no por el texto
    // en inglés, que Supabase puede cambiar.
    if (error.status === 429 || error.code === "over_request_rate_limit") {
      return { error: "Demasiados intentos. Espere unos minutos y vuelva a probar.", correo };
    }
    await apuntarIntento(correo, false);
    return {
      error:
        error.code === "invalid_credentials" || error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : "No se pudo iniciar sesión. Intente de nuevo.",
      correo,
    };
  }
  await apuntarIntento(correo, true);

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
