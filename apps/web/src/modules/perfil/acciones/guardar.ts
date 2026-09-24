"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, usuarioActual } from "@rodatech/db/servidor";
import { clienteAdmin, hayClaveAdmin } from "@rodatech/db/admin";

import { mensajeDeError } from "@/lib/errores";

import { MINIMO_CONTRASENA } from "../dominio/tipos";

export type ResultadoPerfil =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

/**
 * Lo que se acepta, y solo eso.
 *
 * `strict()` no es adorno: sin él, un campo de más en el cuerpo de la petición
 * —pongamos `rol: "gerencia"`— pasaría el parseo y llegaría al `update`. El
 * esquema es la lista blanca, y esto es lo que la hace lista blanca de verdad.
 */
const esquema = z
  .object({
    nombre: z.string().trim().min(2, "El nombre es demasiado corto.").max(120),
    telefono: z.string().trim().max(40).nullable(),
    cargo: z.string().trim().max(80).nullable(),
  })
  .strict();

/**
 * Guardar mi propia ficha.
 *
 * **No recibe un id.** Sale de la sesión, y por eso esta acción no puede tocar
 * la ficha de otro aunque alguien la llame a mano con un `fetch`: no hay
 * parámetro que manipular. Es la forma más barata de cerrar un IDOR — quitar
 * el identificador en vez de comprobarlo.
 *
 * Y tres cosas que NO se escriben nunca aquí: `rol`, `activo` y `email`. Las
 * dos primeras las defiende además la base desde la 077; el correo es la
 * credencial con la que se entra y se cambia por otro camino.
 */
export async function guardarMiPerfil(cambios: {
  nombre: string;
  telefono: string | null;
  cargo: string | null;
}): Promise<ResultadoPerfil> {
  const usuario = await usuarioActual();
  if (!usuario) return { ok: false, error: "Hay que iniciar sesión." };

  const datos = esquema.safeParse(cambios);
  if (!datos.success) {
    return {
      ok: false,
      error: datos.error.issues[0]?.message ?? "Los datos no son válidos.",
    };
  }

  try {
    const supabase = await clienteServidor();
    /*
      `.select()` no es para leer: es para saber si se escribió ALGO.

      Sin él, un UPDATE que RLS no deja pasar no devuelve error — devuelve
      éxito y cero filas. La pantalla enseñaba «Perfil actualizado», el
      servidor respondía 200, y el dato seguía igual. Se cazó probándolo en
      pantalla el 15/09, y es exactamente el fallo que en esta casa se paga
      caro: el que no avisa.
    */
    const { data, error } = await supabase
      .from("perfiles")
      .update({
        nombre: datos.data.nombre,
        // Cadena vacía a null: un teléfono en blanco es «no tengo», no «tengo
        // uno que no se ve». La diferencia importa en las consultas que
        // preguntan si hay con qué avisar.
        telefono: datos.data.telefono || null,
        cargo: datos.data.cargo || null,
      })
      .eq("id", usuario.id)
      .select("id");

    if (error) return { ok: false, error: mensajeDeError(error) };
    if (!data || data.length === 0) {
      return {
        ok: false,
        error:
          "La base no dejó guardar tu ficha. Avisa a Gerencia: es un permiso, no un dato mal escrito.",
      };
    }

    // El nombre sale en la cabecera de TODAS las pantallas, así que no basta
    // con refrescar esta.
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Perfil actualizado." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Cambiar mi contraseña.
 *
 * Hace falta de verdad y no es un adorno: las seis cuentas nacieron sembradas
 * con `RODATECH_DEV_PASSWORD`, la misma para todas. Sin esta pantalla, el día
 * de la entrega cada empleado seguiría entrando con la contraseña de
 * desarrollo y no habría forma de cambiarla desde el ERP.
 *
 * Se pide la ACTUAL antes de cambiarla. Supabase no lo exige —con la sesión
 * abierta basta— pero un portátil desbloqueado encima de un mostrador es
 * exactamente el escenario de esta empresa, y sin ese paso cualquiera que pase
 * por delante deja al dueño fuera de su propio sistema.
 */
export async function cambiarMiContrasena(
  actual: string,
  nueva: string,
): Promise<ResultadoPerfil> {
  const usuario = await usuarioActual();
  if (!usuario?.email) return { ok: false, error: "Hay que iniciar sesión." };

  if (typeof nueva !== "string" || nueva.length < MINIMO_CONTRASENA) {
    return {
      ok: false,
      error: `La contraseña nueva necesita al menos ${MINIMO_CONTRASENA} caracteres.`,
    };
  }
  if (nueva === actual) {
    return { ok: false, error: "La contraseña nueva es igual que la actual." };
  }

  try {
    const supabase = await clienteServidor();

    // La actual, comprobada contra Supabase Auth y no contra nada nuestro.
    const { error: errorClave } = await supabase.auth.signInWithPassword({
      email: usuario.email,
      password: actual,
    });
    if (errorClave) {
      return { ok: false, error: "La contraseña actual no es correcta." };
    }

    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (error) return { ok: false, error: mensajeDeError(error) };

    /*
      Y aquí se apaga la marca de la 092, que es lo que deja salir de la
      pantalla de «cambia tu contraseña» y ver el ERP.

      Va con `clienteAdmin` y no con la sesión a propósito: el trigger
      `tg_perfil_contrasena` prohíbe que una sesión de empleado la apague, y
      es lo que impide quitársela con un PATCH sin tocar la contraseña. El
      único que puede es el servidor, y solo aquí — después de que Supabase
      Auth haya confirmado el cambio.

      Si no hay clave de servicio no se aborta: la contraseña YA cambió, y
      devolver error haría creer que no. Se avisa, que es lo honesto.
    */
    if (hayClaveAdmin()) {
      const { error: errorMarca } = await clienteAdmin()
        .from("perfiles")
        .update({ debe_cambiar_contrasena: false })
        .eq("id", usuario.id);

      if (errorMarca) {
        return {
          ok: true,
          mensaje:
            "Contraseña cambiada, pero el sistema sigue pidiéndotela. Avisa a soporte.",
        };
      }
    }

    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Contraseña cambiada." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
