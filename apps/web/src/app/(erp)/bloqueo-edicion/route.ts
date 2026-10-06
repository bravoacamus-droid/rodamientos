import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Tomar, renovar y soltar el bloqueo de edición (106).
 *
 * Una ruta y no una Server Action por una sola razón: al cerrar la pestaña
 * hay que SOLTAR el bloqueo, y lo único que el navegador garantiza enviar
 * mientras se cierra es un `fetch` con `keepalive`. Una Server Action no se
 * puede mandar así.
 *
 * Quién es quién lo decide la base con `auth.uid()`: aquí no se pasa ningún
 * usuario, así que nadie puede tomar un bloqueo a nombre de otro.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTIDADES = ["producto", "cotizacion"] as const;

export async function POST(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return Response.json({ ok: false, error: "Hay que iniciar sesión." }, { status: 401 });

  let cuerpo: { accion?: unknown; entidad?: unknown; registro?: unknown; forzar?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Petición no válida." }, { status: 400 });
  }

  const entidad = ENTIDADES.find((e) => e === cuerpo.entidad);
  const registro = typeof cuerpo.registro === "string" && UUID.test(cuerpo.registro) ? cuerpo.registro : null;
  if (!entidad || !registro) return Response.json({ ok: false, error: "Petición no válida." }, { status: 400 });

  const supabase = await clienteServidor();

  if (cuerpo.accion === "soltar") {
    const { error } = await supabase.rpc("soltar_bloqueo", { p_entidad: entidad, p_registro: registro });
    return Response.json({ ok: !error });
  }

  const { data, error } = await supabase.rpc("tomar_bloqueo", {
    p_entidad: entidad,
    p_registro: registro,
    p_forzar: cuerpo.forzar === true,
  });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json(data);
}
