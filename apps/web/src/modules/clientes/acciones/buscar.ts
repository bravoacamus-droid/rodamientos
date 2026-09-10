"use server";

import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Buscar un cliente por nombre, RUC o código, para los filtros de las listas.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe, si el constructor ya buscaba clientes
 * ---------------------------------------------------------------------------
 * El constructor de cotizaciones tiene el suyo desde hace tiempo, y su
 * comentario ya decía lo que había que saber: *«era un `<select>` con la
 * cartera entera dentro. Un desplegable nativo no busca: salta a la primera
 * letra que teclees y nada más. Con dos clientes de prueba se aguanta; con la
 * cartera que Willy va a subir, no»*.
 *
 * Ese razonamiento se aplicó al constructor y **no a los filtros de las
 * listas**, que siguieron con el desplegable de 500. Luis, 10/09: *«ese
 * selector de cliente, buscador infinito; tiene que ser un buscador de cliente
 * inteligente, ya que puede haber demasiados clientes: voy buscando y me va
 * listando»*.
 *
 * No se reutiliza `buscarClientesParaCotizar` porque devuelve la ficha de
 * venta —condición de pago, última cotización, motivo por el que no se puede
 * elegir— y un filtro no necesita nada de eso: solo con qué reconocerlo. La
 * lógica de ordenar no se duplica: vive en Postgres desde la 030.
 */

export interface ClienteParaFiltrar {
  id: string;
  razon_social: string;
  numero_documento: string | null;
}

export type ResultadoBusquedaClientes =
  | { ok: true; datos: ClienteParaFiltrar[] }
  | { ok: false; error: string };

export async function buscarClientesParaFiltrar(
  termino: string,
): Promise<ResultadoBusquedaClientes> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };

  const q = termino.trim();
  // Con una letra el trigrama no discrimina y devolvería la cartera entera.
  if (q.length < 2) return { ok: true, datos: [] };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("buscar_clientes", {
      p_q: q,
      p_limit: 15,
    });
    if (error) return { ok: false, error: error.message };

    const filas = (data ?? []) as unknown as {
      id: unknown;
      razon_social: unknown;
      numero_documento?: unknown;
    }[];

    return {
      ok: true,
      datos: filas.map((c) => ({
        id: String(c.id),
        razon_social: String(c.razon_social),
        numero_documento:
          typeof c.numero_documento === "string" ? c.numero_documento : null,
      })),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo buscar.",
    };
  }
}

/**
 * El nombre de un cliente concreto.
 *
 * Hace falta para pintar el filtro ya aplicado: la URL guarda el id, y sin
 * esto el chip diría «cliente 8f3a…». Es una fila por id, no una lista.
 */
export async function nombreDelCliente(
  id: string,
): Promise<{ ok: true; nombre: string | null } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clientes")
      .select("razon_social")
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, nombre: data ? String(data.razon_social) : null };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo leer el cliente.",
    };
  }
}
