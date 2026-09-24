"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { clienteAdmin, hayClaveAdmin } from "@rodatech/db/admin";
import { perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";
import { generarContrasenaInicial } from "../dominio/contrasena";
import { ROLES, type Rol } from "../dominio/tipos";

export type ResultadoAlta =
  | { ok: true; contrasena: string; nombre: string; email: string }
  | { ok: false; error: string };

const esquema = z.object({
  nombre: z.string().trim().min(3, "El nombre es muy corto.").max(120),
  email: z.string().trim().toLowerCase().email("Ese correo no es válido."),
  cargo: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(30).optional(),
  rol: z.enum(ROLES as unknown as [Rol, ...Rol[]]),
});

/**
 * Da de alta a un empleado.
 *
 * Hasta hoy esto no se podía hacer desde el ERP: la propia pantalla decía «el
 * alta se hace en Supabase Auth», o sea que cada vez que entraba alguien había
 * que abrir el panel de Supabase. `clienteAdmin()` existía desde el principio
 * —su comentario dice literalmente «hoy, únicamente el alta y baja de
 * usuarios»— y nadie lo llamaba para eso. La pieza estaba; faltaba el camino.
 *
 * ---------------------------------------------------------------------------
 * Solo GERENCIA, y no «gerencia o admin»
 * ---------------------------------------------------------------------------
 * `exigirAdmin()` deja pasar a los dos roles, y aquí no vale: quien da de alta
 * elige el rol del nuevo, así que un `admin` podría crearse un cómplice
 * `gerencia` —o crear uno y entrar con la contraseña que la pantalla le
 * enseña—. El trigger de la 077 no lo impide porque es de UPDATE: vigila que
 * nadie se ASCIENDA, no que nadie NAZCA arriba.
 *
 * Es la misma regla que ya aplica `cambiarUsuario`, y por el mismo motivo.
 *
 * ---------------------------------------------------------------------------
 * La contraseña
 * ---------------------------------------------------------------------------
 * La genera el servidor (ver `dominio/contrasena.ts`) y se devuelve UNA vez,
 * para que quien da de alta se la pase al empleado. No se guarda en ningún
 * sitio nuestro: Supabase Auth se queda el hash y nosotros no volvemos a
 * verla. Si se pierde, se da de nuevo — no se recupera.
 *
 * Y el perfil nace con `debe_cambiar_contrasena` en true, que es el default
 * que puso la 092: el empleado no ve el ERP hasta cambiarla.
 */
export async function crearUsuario(entrada: {
  nombre: string;
  email: string;
  cargo?: string;
  telefono?: string;
  rol: Rol;
}): Promise<ResultadoAlta> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (perfil.rol !== "gerencia") {
    return { ok: false, error: "Solo gerencia puede dar de alta a alguien." };
  }

  if (!hayClaveAdmin()) {
    return {
      ok: false,
      error:
        "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor. Sin ella no se pueden crear cuentas desde aquí.",
    };
  }

  const datos = esquema.safeParse(entrada);
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0]?.message ?? "Los datos no son válidos." };
  }

  const { nombre, email, cargo, telefono, rol } = datos.data;
  const contrasena = generarContrasenaInicial();

  try {
    const admin = clienteAdmin();

    /*
      `email_confirm: true` porque aquí no hay correo de bienvenida que
      confirmar: la contraseña se la da su jefe en mano. Sin esto la cuenta
      nace sin confirmar y no puede entrar, que es un callejón sin salida
      cuando ninguno de los 97 clientes —ni la mayoría de los empleados— tiene
      el correo a mano.

      `nombre` y `rol` van en los metadatos porque es de ahí donde los lee
      `trg_usuario_nuevo` (004) para crear el perfil.
    */
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: contrasena,
      email_confirm: true,
      user_metadata: { nombre, rol },
    });

    if (error) {
      // El mensaje de Supabase para el correo repetido es en inglés y no dice
      // de quién: se traduce, que es lo único que el que está delante puede
      // arreglar.
      if (/already/i.test(error.message)) {
        return { ok: false, error: `Ya hay una cuenta con el correo ${email}.` };
      }
      return { ok: false, error: mensajeDeError(error) };
    }
    if (!data.user) return { ok: false, error: "Supabase no devolvió el usuario creado." };

    /*
      Cargo y teléfono no caben en los metadatos que lee el trigger, así que
      van en un segundo paso. Va con el cliente admin a propósito: la política
      de `perfiles` deja a gerencia escribir, pero el perfil lo acaba de crear
      un trigger y no queremos que un fallo de RLS aquí deje la cuenta a medias
      sin que nadie se entere.
    */
    if (cargo || telefono) {
      const { error: errorPerfil } = await admin
        .from("perfiles")
        .update({ cargo: cargo || null, telefono: telefono || null })
        .eq("id", data.user.id);

      // No se aborta: la cuenta ya existe y entra. El cargo se edita luego.
      if (errorPerfil) {
        return {
          ok: true,
          contrasena,
          nombre,
          email,
        };
      }
    }

    revalidatePath("/configuracion/usuarios");
    return { ok: true, contrasena, nombre, email };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
