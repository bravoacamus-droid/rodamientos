import "server-only";

import type { clienteServidor } from "@rodatech/db/servidor";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

/**
 * La puerta del bloqueo de edición (106), para las Server Actions que
 * guardan: devuelve el error que hay que contestar si OTRA persona tiene el
 * registro abierto, o null si se puede guardar.
 *
 * Sin bloqueo —caducado o nunca tomado— se guarda: el bloqueo avisa de un
 * conflicto, no es un permiso. Y si la pregunta falla, también se guarda:
 * dejar a alguien sin poder guardar por un fallo de esta comprobación sería
 * peor que el conflicto que intenta evitar.
 */
export async function bloqueoQueImpide(
  supabase: Cliente,
  entidad: "producto" | "cotizacion",
  registro: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("bloqueo_ajeno", {
    p_entidad: entidad,
    p_registro: registro,
  });
  if (error || !data) return null;
  const que = entidad === "producto" ? "este producto" : "esta cotización";
  return `${data} está editando ${que} ahora mismo, y guardar pisaría sus cambios. Espera a que termine y vuelve a abrirlo.`;
}
