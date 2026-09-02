import { after } from "next/server";

import { clienteServidor } from "@rodatech/db/servidor";

/**
 * Mensaje legible a partir de cualquier cosa que se pueda lanzar o devolver.
 *
 * Existe por un fallo concreto y caro: los siete módulos hacían
 *
 *     e instanceof Error ? e.message : String(e)
 *
 * y el error de PostgREST **no es un `Error`**, es un objeto plano
 * `{ message, details, hint, code }`. `String()` sobre él da `[object Object]`,
 * así que cada fallo de consulta se mostraba en pantalla exactamente así.
 *
 * El coste real no fue la fealdad: la ficha de producto llevaba días rota por
 * un `PGRST200` —una relación inexistente entre `productos` y `familias`— y el
 * mensaje que lo decía con nombre y apellidos se estaba tirando a la basura.
 * Sin él, desde la pantalla, «no abre nada».
 *
 * `details` y `hint` se conservan porque son justo la parte accionable:
 * PostgREST llega a sugerir la tabla correcta.
 */
export function mensajeDeError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;

  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const partes: string[] = [];

    if (typeof o.message === "string" && o.message) partes.push(o.message);
    if (typeof o.details === "string" && o.details) partes.push(o.details);
    if (typeof o.hint === "string" && o.hint) partes.push(o.hint);

    if (partes.length > 0) {
      // El código va al final entre paréntesis: es lo que se busca para
      // rastrear el fallo, pero no es lo que el operador tiene que leer.
      const codigo = typeof o.code === "string" && o.code ? ` (${o.code})` : "";
      return `${partes.join(" · ")}${codigo}`;
    }
  }

  return "Error desconocido.";
}

/**
 * Envoltura para las funciones `fallo()` de cada módulo.
 *
 * Con `origen`, además deja constancia (§0.2). Es opcional porque el
 * mensaje al usuario no depende de él, y porque se ha ido poniendo primero
 * donde un fallo callado cuesta dinero: emitir, comprar, recibir, cobrar.
 */
export function fallo(e: unknown, origen?: string): { ok: false; error: string } {
  if (origen) anotarFallo(origen, e);
  return { ok: false, error: mensajeDeError(e) };
}

/**
 * Deja constancia de un fallo de servidor.
 *
 * De la auditoría del 31/08 (PENDIENTES §0.2): hoy un error se pinta en la
 * pantalla de quien lo provocó y muere ahí. En un listado es molesto; en la
 * emisión de un comprobante es una factura que no salió y nadie sabe por qué.
 *
 * ---------------------------------------------------------------------------
 * Tres reglas
 * ---------------------------------------------------------------------------
 * 1. **Nunca lanza.** Un registro de fallos que rompe la pantalla que
 *    intentaba salvar es peor que no tenerlo. Todo va dentro de un `catch`
 *    vacío a propósito.
 * 2. **No bloquea la respuesta.** Va en `after()`, así que el usuario recibe
 *    su error igual de rápido. Sin eso, cada fallo costaría un viaje más.
 * 3. **No guarda el payload.** En este ERP serían RUC, direcciones y precios
 *    de clientes reales, y un registro de fallos no es sitio para datos de
 *    nadie. Con dónde pasó y qué dijo el error se reproduce.
 *
 * El `origen` se escribe a mano —`facturacion/emitir`— porque en producción el
 * nombre de la función va minificado y no le diría nada a nadie.
 */
export function anotarFallo(origen: string, e: unknown, ruta?: string): void {
  const mensaje = mensajeDeError(e);
  const codigo =
    e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string"
      ? (e as { code: string }).code
      : null;

  try {
    after(async () => {
      try {
        const supabase = await clienteServidor();
        await supabase.rpc("registrar_fallo", {
          p_origen: origen,
          p_mensaje: mensaje,
          p_codigo: codigo ?? undefined,
          p_ruta: ruta ?? undefined,
        });
      } catch {
        // Si ni siquiera se puede apuntar el fallo, no hay nada más que
        // hacer: lo que no puede pasar es que esto tumbe la petición.
      }
    });
  } catch {
    // `after()` fuera de un contexto de petición (una prueba, un script).
  }
}
