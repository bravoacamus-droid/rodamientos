"use server";

import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Qué distrito es un código de ubigeo.
 *
 * ---------------------------------------------------------------------------
 * Por qué hace falta
 * ---------------------------------------------------------------------------
 * `150101` y `150132` se parecen y son distritos distintos: Lima Cercado y San
 * Juan de Lurigancho. La empresa tenía puesto el primero teniendo el local en
 * el segundo, y **nadie lo detectó** — porque el ubigeo no estaba en ninguna
 * pantalla, y porque seis dígitos no le dicen nada a quien los lee.
 *
 * Va como punto de partida en cada guía de remisión, así que un dígito
 * cambiado es un documento que declara que la mercadería salió de otro sitio.
 *
 * La cifra sola no se puede comprobar. Con el distrito al lado, un `150101`
 * debajo de una dirección que dice «SAN JUAN DE LURIGANCHO» salta a la vista.
 */
export type ResultadoUbigeo =
  | { ok: true; nombre: string }
  | { ok: false; error: string };

export async function nombreDelUbigeo(codigo: string): Promise<ResultadoUbigeo> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };

  const limpio = (codigo ?? "").trim();
  if (!z.string().regex(/^[0-9]{6}$/).safeParse(limpio).success) {
    return { ok: false, error: "Son seis dígitos." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("ubigeo")
      .select("departamento, provincia, distrito")
      .eq("codigo", limpio)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) {
      return { ok: false, error: "Ese código no está en el padrón del INEI." };
    }

    // Distrito primero: es lo que se compara contra la dirección de al lado.
    return {
      ok: true,
      nombre: `${data.distrito} · ${data.provincia}, ${data.departamento}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo comprobar el ubigeo.",
    };
  }
}
