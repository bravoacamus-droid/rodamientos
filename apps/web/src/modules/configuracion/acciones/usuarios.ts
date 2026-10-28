"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { clienteAdmin, hayClaveAdmin } from "@rodatech/db/admin";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";
import { esquemaUsuarioOpcional, esUsuarioRepetido, MENSAJE_USUARIO_REPETIDO } from "@/lib/usuario";
import { generarContrasenaInicial } from "../dominio/contrasena";
import type { Rol } from "../dominio/tipos";

export type ResultadoAlta =
  | { ok: true; contrasena: string; nombre: string; email: string; usuario: string | null }
  | { ok: false; error: string };

const esquema = z.object({
  nombre: z.string().trim().min(3, "El nombre es muy corto.").max(120),
  email: z.string().trim().toLowerCase().email("Ese correo no es válido."),
  cargo: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(30).optional(),
  // Con el que también entra (171). Opcional: sin él, entra con el correo.
  usuario: esquemaUsuarioOpcional.optional(),
  rol: z.string().min(2).max(41),
});

/**
 * ¿Lo tiene ya otra persona? Antes de escribir nada, para no dejar a medias
 * un alta o un cambio de correo por un usuario repetido. El índice único de
 * la 171 sigue siendo la última palabra, por si dos lo eligen a la vez.
 */
async function usuarioOcupado(usuario: string, salvo?: string): Promise<boolean> {
  let q = clienteAdmin().from("perfiles").select("id").eq("usuario", usuario).limit(1);
  if (salvo) q = q.neq("id", salvo);
  const { data } = await q;
  return Boolean(data && data.length > 0);
}

/**
 * El rol tiene que existir en `roles` (143). Ya no es una lista fija: los
 * crea gerencia en Configuración › Roles y permisos.
 */
async function rolExiste(clave: string): Promise<boolean> {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(clave)) return false;
  const supabase = await clienteServidor();
  const { data } = await supabase.from("roles").select("clave").eq("clave", clave).maybeSingle();
  return Boolean(data);
}


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
  usuario?: string;
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
  const usuario = datos.data.usuario ?? null;
  if (!(await rolExiste(rol))) return { ok: false, error: "Ese rol no existe. Elígelo de la lista." };
  if (usuario && (await usuarioOcupado(usuario))) return { ok: false, error: MENSAJE_USUARIO_REPETIDO };
  const contrasena = generarContrasenaInicial();

  try {
    const admin = clienteAdmin();

    /*
      `email_confirm: true` porque aquí no hay correo de bienvenida que
      confirmar: la contraseña se la da su jefe en mano. Sin esto la cuenta
      nace sin confirmar y no puede entrar, que es un callejón sin salida
      cuando ninguno de los 97 clientes —ni la mayoría de los empleados— tiene
      el correo a mano.

      `nombre` va en los metadatos porque es de ahí donde lo lee
      `trg_usuario_nuevo` (004) para crear el perfil; el rol, en los dos.
    */
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: contrasena,
      email_confirm: true,
      user_metadata: { nombre, rol },
      /*
        El rol de verdad va en `app_metadata` (145): esa la escribe solo la
        clave de servicio, y es la única que el trigger cree. La de
        `user_metadata` la elige cualquiera que se registre por su cuenta, y
        con ella se podía nacer gerencia.
      */
      app_metadata: { rol },
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
    if (cargo || telefono || usuario) {
      const { error: errorPerfil } = await admin
        .from("perfiles")
        .update({ cargo: cargo || null, telefono: telefono || null, usuario })
        .eq("id", data.user.id);

      // No se aborta: la cuenta ya existe y entra con su correo. El usuario
      // se le pone luego en «Editar datos»; por eso no se enseña.
      if (errorPerfil) {
        revalidatePath("/configuracion/usuarios");
        return { ok: true, contrasena, nombre, email, usuario: null };
      }
    }

    revalidatePath("/configuracion/usuarios");
    return { ok: true, contrasena, nombre, email, usuario };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

export type ResultadoContrasena =
  | { ok: true; contrasena: string; nombre: string; email: string }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Una contraseña nueva para un empleado que olvidó la suya (auditoría, 21/10).
 *
 * Hasta hoy la única salida era el panel de Supabase. Va con las mismas
 * reglas que el alta: solo GERENCIA, la genera el servidor, se enseña UNA vez
 * y el perfil queda con `debe_cambiar_contrasena`, así que el empleado la
 * cambia antes de ver nada. La propia no se cambia desde aquí: para eso está
 * /perfil, que pide la actual.
 */
export async function darContrasenaNueva(id: string): Promise<ResultadoContrasena> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (perfil.rol !== "gerencia") {
    return { ok: false, error: "Solo gerencia puede darle una contraseña nueva a alguien." };
  }
  if (!UUID.test(id)) return { ok: false, error: "Ese usuario no existe." };
  if (id === perfil.id) {
    return { ok: false, error: "Tu propia contraseña se cambia en «Mi perfil»." };
  }
  if (!hayClaveAdmin()) {
    return {
      ok: false,
      error: "No se puede desde aquí: falta una configuración del servidor. Avise a quien mantiene el sistema.",
    };
  }

  try {
    const admin = clienteAdmin();
    const { data: quien } = await admin
      .from("perfiles")
      .select("id, nombre, email")
      .eq("id", id)
      .maybeSingle();
    if (!quien) return { ok: false, error: "Ese usuario no existe." };

    const contrasena = generarContrasenaInicial();
    const { error } = await admin.auth.admin.updateUserById(id, { password: contrasena });
    if (error) return { ok: false, error: mensajeDeError(error) };

    // Que la cambie al entrar: esta la ha visto quien se la dio.
    await admin.from("perfiles").update({ debe_cambiar_contrasena: true }).eq("id", id);

    revalidatePath("/configuracion/usuarios");
    return { ok: true, contrasena, nombre: quien.nombre ?? "", email: quien.email ?? "" };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

export type ResultadoDatos = { ok: true; mensaje: string } | { ok: false; error: string };

const esquemaDatos = z.object({
  nombre: z.string().trim().min(3, "El nombre es muy corto.").max(120),
  email: z.string().trim().toLowerCase().email("Ese correo no es válido."),
  telefono: z.string().trim().max(30),
  usuario: esquemaUsuarioOpcional,
});

/**
 * Corregir el nombre, el correo, el usuario (171), el cargo o el teléfono de un empleado
 * (Luis, 21/10: «el CRUD completo»). Hasta hoy solo se podía al darlo de alta.
 *
 * Borrar no existe a propósito: su nombre está en cotizaciones, cobros y en la
 * bitácora. Quien se va se da de baja.
 *
 * Solo GERENCIA, como el alta, y nunca la propia ficha (eso es /perfil). El
 * correo es con lo que entra: si cambia, cambia también en Auth, y antes que
 * en `perfiles` — al revés quedaría una ficha que dice un correo con el que
 * no se puede entrar.
 */
export async function editarDatosUsuario(
  id: string,
  entrada: { nombre: string; email: string; telefono: string; usuario: string },
): Promise<ResultadoDatos> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (perfil.rol !== "gerencia") {
    return { ok: false, error: "Solo gerencia puede cambiar los datos de otra persona." };
  }
  if (!UUID.test(id)) return { ok: false, error: "Ese usuario no existe." };
  if (id === perfil.id) return { ok: false, error: "Tus propios datos se cambian en «Mi perfil»." };

  const datos = esquemaDatos.safeParse(entrada);
  if (!datos.success) return { ok: false, error: datos.error.issues[0]?.message ?? "Revisa los datos." };
  if (!hayClaveAdmin()) {
    return {
      ok: false,
      error: "No se puede desde aquí: falta una configuración del servidor. Avise a quien mantiene el sistema.",
    };
  }

  try {
    const admin = clienteAdmin();
    const { data: antes } = await admin.from("perfiles").select("email").eq("id", id).maybeSingle();
    if (!antes) return { ok: false, error: "Ese usuario no existe." };

    const { nombre, email, telefono, usuario } = datos.data;
    // Antes que el correo de Auth: si el usuario está ocupado, no se cambia nada.
    if (usuario && (await usuarioOcupado(usuario, id))) return { ok: false, error: MENSAJE_USUARIO_REPETIDO };
    if (email !== (antes.email ?? "").toLowerCase()) {
      const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          return { ok: false, error: `Ya hay una cuenta con el correo ${email}.` };
        }
        return { ok: false, error: "No se pudo cambiar el correo con el que entra. No se cambió nada." };
      }
    }

    const { error } = await admin
      .from("perfiles")
      .update({ nombre, email, telefono: telefono || null, usuario })
      .eq("id", id);
    if (error) {
      if (esUsuarioRepetido(error)) return { ok: false, error: MENSAJE_USUARIO_REPETIDO };
      return { ok: false, error: mensajeDeError(error) };
    }

    revalidatePath("/configuracion/usuarios");
    return { ok: true, mensaje: `Datos de ${nombre} guardados.` };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
