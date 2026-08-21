"use server";

import { redirect } from "next/navigation";
import { clienteServidor } from "@rodatech/db/servidor";

import { CUENTAS_DEV, hayAtajos } from "./cuentas-dev";

export interface ResultadoLogin {
  error: string | null;
}

/** Solo se acepta una ruta interna, para que `destino` no sirva de trampolín
 *  a un dominio externo (redirección abierta). */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  const ruta = typeof valor === "string" ? valor : "";
  return ruta.startsWith("/") && !ruta.startsWith("//") ? ruta : "/dashboard";
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
  const correo = String(datos.get("correo") ?? "").trim();
  const clave = String(datos.get("clave") ?? "");

  if (!correo || !clave) {
    return { error: "Escriba su correo y su contraseña." };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: clave,
  });

  if (error) {
    // El mensaje de Supabase es genérico a propósito: no revela si el correo
    // existe. Se traduce sin añadir detalle.
    return {
      error:
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : "No se pudo iniciar sesión. Intente de nuevo.",
    };
  }

  // redirect() lanza para cortar el flujo, así que va fuera de cualquier
  // try/catch y después de que la cookie de sesión ya quedó escrita.
  redirect(destinoSeguro(datos.get("destino")));
}

/**
 * Atajo de desarrollo: entra como una de las cuentas sembradas.
 *
 * La demo anterior hacía esto con la contraseña escrita en el código, así que
 * viajaba en el bundle del navegador y cualquiera podía leerla. Aquí la clave
 * sale de RODATECH_DEV_PASSWORD, que es una variable de SERVIDOR: el navegador
 * solo envía qué cuenta quiere.
 *
 * Tres puertas independientes, y basta que falle una para que no haga nada:
 *   1. hayAtajos(): fuera de producción, o RODATECH_ATAJOS=1 puesto a mano
 *   2. RODATECH_DEV_PASSWORD definida
 *   3. el correo pedido está en CUENTAS_DEV
 */
export async function entrarComoDev(datos: FormData): Promise<void> {
  if (!hayAtajos()) return;

  const clave = process.env.RODATECH_DEV_PASSWORD;
  if (!clave) return;

  const correo = String(datos.get("correo") ?? "");
  if (!CUENTAS_DEV.some((c) => c.correo === correo)) return;

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: clave,
  });
  if (error) return;

  redirect(destinoSeguro(datos.get("destino")));
}

/** Cierra la sesión y borra la cookie. También del lado del servidor. */
export async function cerrarSesion(): Promise<void> {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
