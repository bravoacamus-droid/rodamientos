import { NextResponse } from "next/server";
import { createClient as createServerClient, getSesion } from "@/lib/supabase/server";
import { credencialesSupabase } from "@/lib/supabase/config";

/**
 * Alta de usuarios del ERP.
 *
 * Crear una cuenta en Supabase Auth exige la Admin API, que solo acepta la
 * service role key. Esa clave omite todas las políticas de RLS, así que nunca
 * sale del servidor: la petición del navegador llega aquí, se verifica que
 * quien la hace tenga rol de administración, y recién entonces se usa.
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor. Sin ella el
 * resto del ERP funciona igual; solo queda deshabilitada el alta de usuarios.
 */

const ROLES_VALIDOS = ["admin", "gerencia", "ventas", "almacen", "compras", "cobranzas"];

export async function POST(request: Request) {
  const sesion = await getSesion();

  if (!sesion?.perfil) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }
  if (!["admin", "gerencia"].includes(sesion.perfil.rol)) {
    return NextResponse.json(
      { error: "Solo Administración o Gerencia pueden dar de alta usuarios." },
      { status: 403 }
    );
  }

  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
    .trim()
    .replace(/[\r\n\t]/g, "");

  if (!serviceKey) {
    return NextResponse.json(
      {
        error:
          "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor. " +
          "Cárguela en Vercel como variable de servidor (sin el prefijo NEXT_PUBLIC_) " +
          "para habilitar el alta de usuarios.",
      },
      { status: 501 }
    );
  }

  let cuerpo: {
    email?: string; password?: string; nombre?: string;
    rol?: string; cargo?: string; telefono?: string;
  };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  const email = (cuerpo.email ?? "").trim().toLowerCase();
  const password = cuerpo.password ?? "";
  const nombre = (cuerpo.nombre ?? "").trim();
  const rol = cuerpo.rol ?? "ventas";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "El correo no tiene un formato válido." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }
  if (!nombre) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return NextResponse.json({ error: "Rol no reconocido." }, { status: 400 });
  }

  const { url } = credencialesSupabase();

  const respuesta = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre,
        rol,
        cargo: (cuerpo.cargo ?? "").trim(),
        telefono: (cuerpo.telefono ?? "").trim(),
      },
    }),
  });

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    const mensaje = String(datos?.msg ?? datos?.message ?? "No se pudo crear el usuario.");
    return NextResponse.json(
      {
        error: /already been registered|already exists/i.test(mensaje)
          ? "Ya existe un usuario con ese correo."
          : mensaje,
      },
      { status: respuesta.status }
    );
  }

  // El perfil lo crea el trigger on_auth_user_created; aquí se completan los
  // campos que no viajan en los metadatos.
  const supabase = await createServerClient();
  await supabase
    .from("profiles")
    .update({
      nombre,
      rol,
      cargo: (cuerpo.cargo ?? "").trim() || null,
      telefono: (cuerpo.telefono ?? "").trim() || null,
    })
    .eq("id", datos.id);

  await supabase.from("actividad").insert({
    usuario_id: sesion.perfil.id,
    usuario_nombre: sesion.perfil.nombre,
    accion: "crear_usuario",
    entidad: "profiles",
    entidad_id: datos.id,
    descripcion: `Usuario ${nombre} (${email}) dado de alta con rol ${rol}`,
  });

  return NextResponse.json({ id: datos.id, email, nombre, rol });
}

/** Indica al cliente si el alta de usuarios está disponible en este despliegue. */
export async function GET() {
  const sesion = await getSesion();
  if (!sesion?.perfil) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }
  return NextResponse.json({
    disponible: Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()),
  });
}
