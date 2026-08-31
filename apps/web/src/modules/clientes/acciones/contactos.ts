"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import type { ContactoCliente } from "../dominio/tipos";

/**
 * Los contactos de una empresa cliente.
 *
 * Pedido de Willy el 31/08: una cotización va dirigida al jefe de compras, al
 * asistente de logística o al de mantenimiento según el caso, y hasta hoy solo
 * cabía UNO por cliente, en una columna de texto.
 *
 * Viven en su propia tabla (`cliente_contactos`, migración 035) y en su propia
 * acción y no dentro de `guardarCliente` por un motivo práctico: se editan en
 * momentos distintos. Añadir el contacto que acaba de dar el cliente por
 * teléfono no debería obligar a revalidar y reenviar la ficha comercial
 * entera, ni a arriesgarse a pisar un cambio que hizo otro mientras tanto.
 */

const ROLES = ["gerencia", "admin", "ventas"] as const;

export type ResultadoContacto =
  | { ok: true; id: string }
  | { ok: false; error: string; campo?: string };

function opcional(max: number, etiqueta: string) {
  return z
    .string()
    .trim()
    .max(max, `${etiqueta} no puede pasar de ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);
}

const esquema = z.object({
  id: z.string().uuid().optional(),
  cliente_id: z.string().uuid({ message: "Falta el cliente." }),
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre del contacto no puede quedar vacío.")
    .max(120, "El nombre no puede pasar de 120 caracteres."),
  cargo: opcional(80, "El cargo"),
  // Texto libre y no una lista cerrada: las áreas reales las sabe Willy. El
  // formulario propone las tres que nombró y deja escribir otra.
  area: opcional(60, "El área"),
  email: opcional(160, "El correo").refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    "El correo no tiene un formato válido.",
  ),
  telefono: opcional(40, "El teléfono"),
  whatsapp: opcional(40, "El WhatsApp"),
  principal: z.coerce.boolean().default(false),
});

async function permiso(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Tu sesión expiró. Vuelve a entrar.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Tu rol no puede editar los contactos de un cliente.";
  }
  return null;
}

function revalidar(clienteId: string) {
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath(`/clientes/${clienteId}/editar`);
}

/** Nombre repetido dentro del mismo cliente: lo impide `ux_cliente_contactos_nombre`. */
function esDuplicado(error: { code?: string }): boolean {
  return error.code === "23505";
}

export async function guardarContacto(formData: FormData): Promise<ResultadoContacto> {
  const problema = await permiso();
  if (problema) return { ok: false, error: problema };

  const crudo = formData.get("contacto");
  if (typeof crudo !== "string") return { ok: false, error: "No llegó el contacto." };

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    if (e instanceof z.ZodError) {
      const primero = e.errors[0];
      return {
        ok: false,
        error: primero?.message ?? "Revisa los datos del contacto.",
        campo: primero?.path[0]?.toString(),
      };
    }
    return { ok: false, error: "No se pudo leer el contacto." };
  }

  const supabase = await clienteServidor();

  // Marcar a este como principal exige quitarle la marca al que la tuviera:
  // `ux_cliente_contactos_principal` solo deja uno activo por cliente, y sin
  // esto el guardado fallaría con un 23505 que el usuario no entendería —él
  // marcó una casilla, no creó un duplicado—.
  //
  // Va ANTES de escribir, y a propósito no en una transacción: PostgREST no
  // las ofrece. El peor caso si lo segundo falla es un cliente sin principal,
  // que es un estado válido —el buscador cae a cualquiera de sus contactos— y
  // se arregla volviendo a marcar. El orden inverso sí sería malo: dejaría dos
  // principales imposibles de guardar después.
  if (datos.principal) {
    const quitar = supabase
      .from("cliente_contactos")
      .update({ principal: false })
      .eq("cliente_id", datos.cliente_id)
      .eq("principal", true);
    const { error } = datos.id ? await quitar.neq("id", datos.id) : await quitar;
    if (error) return { ok: false, error: error.message };
  }

  const campos = {
    cliente_id: datos.cliente_id,
    nombre: datos.nombre,
    cargo: datos.cargo,
    area: datos.area,
    email: datos.email,
    telefono: datos.telefono,
    whatsapp: datos.whatsapp,
    principal: datos.principal,
  };

  const { data, error } = datos.id
    ? await supabase
        .from("cliente_contactos")
        .update(campos)
        .eq("id", datos.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("cliente_contactos").insert(campos).select("id").maybeSingle();

  if (error) {
    if (esDuplicado(error)) {
      return {
        ok: false,
        campo: "nombre",
        error: `Ya hay un contacto que se llama «${datos.nombre}» en este cliente.`,
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "El contacto no existe o no tienes permiso para editarlo." };
  }

  revalidar(datos.cliente_id);
  return { ok: true, id: data.id };
}

/**
 * Dar de baja a un contacto.
 *
 * Se desactiva, no se borra. Una cotización de hace seis meses guarda su
 * `contacto_id`, y borrar la ficha la dejaría sin poder responder «¿a quién le
 * mandamos esto?». El nombre impreso lo conserva igual —va copiado en
 * `cotizaciones.contacto`— pero el enlace sirve para lo otro: ver todo lo que
 * se le ha cotizado a esa persona.
 */
export async function desactivarContacto(
  id: string,
  clienteId: string,
): Promise<ResultadoContacto> {
  const problema = await permiso();
  if (problema) return { ok: false, error: problema };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Contacto no válido." };
  }

  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("cliente_contactos")
    // La marca de principal se va con la baja: el índice parcial deja el hueco
    // libre para nombrar a otro, y un principal inactivo no lo es de nada.
    .update({ activo: false, principal: false })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "El contacto no existe o no tienes permiso." };

  revalidar(clienteId);
  return { ok: true, id: data.id };
}

/**
 * Los contactos de un cliente, para el selector del constructor de
 * cotizaciones.
 *
 * Es una lectura, así que por la convención de módulos viviría en `api/`. Está
 * aquí porque la invoca el navegador al elegir cliente, y eso solo se puede
 * hacer con `"use server"` — igual que las búsquedas del constructor.
 */
export async function contactosDeCliente(
  clienteId: string,
): Promise<{ ok: true; datos: ContactoCliente[] } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Sesión expirada." };
  if (!z.string().uuid().safeParse(clienteId).success) {
    return { ok: false, error: "Cliente no válido." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("contactos_de_cliente", {
      p_cliente: clienteId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, datos: (data ?? []) as unknown as ContactoCliente[] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudieron cargar los contactos.",
    };
  }
}
