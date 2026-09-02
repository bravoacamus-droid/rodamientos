"use server";

import { clienteServidor } from "@rodatech/db/servidor";

/**
 * Apuntar un fallo que ocurrió EN EL NAVEGADOR.
 *
 * `lib/errores.ts` cubre los del servidor. Este es el otro lado: cuando el
 * layout raíz revienta, `global-error.tsx` es lo único que queda en pie, y sin
 * esto ese fallo no sale de la pantalla de quien lo sufrió.
 *
 * Vive suelta en `app/` y no en un módulo porque la usa la pantalla de error
 * global, que por definición no puede depender de nada del ERP: si el fallo
 * estuviera en un módulo, importarlo volvería a romperla.
 */
export async function anotarFalloDelNavegador(
  mensaje: string,
  digest: string | null,
  ruta: string | null,
): Promise<void> {
  try {
    const supabase = await clienteServidor();
    await supabase.rpc("registrar_fallo", {
      p_origen: "navegador",
      // En producción React esconde el mensaje real a propósito y deja el
      // `digest`. Se guardan los dos: el que haya sirve.
      p_mensaje: mensaje.slice(0, 2000),
      p_codigo: digest ?? undefined,
      p_ruta: ruta ?? undefined,
    });
  } catch {
    // Nunca lanza. Si esto fallara, la pantalla de error —que es lo único que
    // le queda a la persona— se caería también.
  }
}
