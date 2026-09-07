"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Mantener el maestro de transporte.
 *
 * Luis, 07/09: *«deberíamos tener nuestra data maestra de transporte, ¿no?,
 * donde tenemos público y privado, así pueden editar, crear o dar de baja»*.
 *
 * Tres entidades y un solo archivo porque son la misma operación tres veces:
 * validar lo que se puede decir con palabras, guardar, y revalidar las dos
 * pantallas que las leen. Partirlo en tres obligaría a arreglar cualquier cosa
 * de estas en tres sitios.
 *
 * ---------------------------------------------------------------------------
 * No se borra nada
 * ---------------------------------------------------------------------------
 * `cambiarEstado` pone `activo` en true o false y nada más. La 060 no tiene
 * política de DELETE a propósito: una guía de hace ocho meses tiene que poder
 * seguir citando el vehículo con el que salió. «Dar de baja» quiere decir «no
 * me lo ofrezcas más», no «haz como si no hubiera existido».
 */

/** Los mismos roles que la 029 y la 060 dieron a las tres tablas. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"] as const;

export type ResultadoMaestro = { ok: true; id: string } | { ok: false; error: string };

const limpio = (v: string | null | undefined) =>
  v === null || v === undefined || v.trim() === "" ? null : v.trim();

async function permiso(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Tu rol no puede tocar el maestro de transporte.";
  }
  return null;
}

function revalidar() {
  revalidatePath("/transporte");
  revalidatePath("/guias/nueva");
}

/** El mensaje de Postgres, traducido a lo que de verdad pasó. */
function traducir(mensaje: string, que: string): string {
  if (mensaje.includes("duplicate key") || mensaje.includes("ux_")) {
    return `Ya hay ${que} con ese dato. Búscalo en la lista: puede estar dado de baja.`;
  }
  return mensaje;
}

// ---------------------------------------------------------------------------
// Agencias · transporte público
// ---------------------------------------------------------------------------
const esquemaAgencia = z.object({
  id: z.string().uuid().nullable().default(null),
  razon_social: z.string().trim().min(3, "Falta la razón social.").max(200),
  nombre_corto: z.string().trim().max(60).nullable().default(null),
  numero_documento: z.string().trim().nullable().default(null),
  telefono: z.string().trim().max(40).nullable().default(null),
  direccion: z.string().trim().max(200).nullable().default(null),
});

export async function guardarAgencia(crudos: unknown): Promise<ResultadoMaestro> {
  const noPuede = await permiso();
  if (noPuede) return { ok: false, error: noPuede };

  let d: z.infer<typeof esquemaAgencia>;
  try {
    d = esquemaAgencia.parse(crudos);
  } catch (e) {
    const primero = e instanceof z.ZodError ? e.issues[0]?.message : null;
    return { ok: false, error: primero ?? "Los datos de la agencia no son válidos." };
  }

  const ruc = limpio(d.numero_documento);
  if (ruc !== null && !/^[0-9]{11}$/.test(ruc)) {
    return { ok: false, error: "El RUC son once dígitos, o déjalo vacío." };
  }

  const fila = {
    razon_social: d.razon_social.trim(),
    nombre_corto: limpio(d.nombre_corto),
    numero_documento: ruc,
    telefono: limpio(d.telefono),
    direccion: limpio(d.direccion),
  };

  try {
    const supabase = await clienteServidor();
    if (d.id) {
      const { error } = await supabase
        .from("agencias_transporte")
        .update(fila)
        .eq("id", d.id);
      if (error) return { ok: false, error: traducir(error.message, "otra agencia") };
      revalidar();
      return { ok: true, id: d.id };
    }

    const { data, error } = await supabase
      .from("agencias_transporte")
      .insert(fila)
      .select("id")
      .single();
    if (error) return { ok: false, error: traducir(error.message, "una agencia") };
    revalidar();
    return { ok: true, id: String(data!.id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

// ---------------------------------------------------------------------------
// Vehículos · transporte privado
// ---------------------------------------------------------------------------
const esquemaVehiculo = z.object({
  id: z.string().uuid().nullable().default(null),
  placa: z.string().trim().min(1, "Falta la placa.").max(12),
  descripcion: z.string().trim().max(120).nullable().default(null),
  marca: z.string().trim().max(60).nullable().default(null),
});

/**
 * «abc-123», «ABC 123» y «ABC123» son la misma camioneta.
 *
 * Se normaliza aquí y no en la base porque el índice único es sobre la columna
 * tal cual: sin esto, la misma placa entraría tres veces con tres formas de
 * escribirla y el desplegable de la guía ofrecería tres opciones idénticas.
 */
function normalizarPlaca(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function guardarVehiculo(crudos: unknown): Promise<ResultadoMaestro> {
  const noPuede = await permiso();
  if (noPuede) return { ok: false, error: noPuede };

  let d: z.infer<typeof esquemaVehiculo>;
  try {
    d = esquemaVehiculo.parse(crudos);
  } catch (e) {
    const primero = e instanceof z.ZodError ? e.issues[0]?.message : null;
    return { ok: false, error: primero ?? "Los datos del vehículo no son válidos." };
  }

  const placa = normalizarPlaca(d.placa);
  // El mismo `check` que la 060, dicho con palabras.
  if (!/^[A-Z0-9]{6,8}$/.test(placa)) {
    return {
      ok: false,
      error: "La placa son entre 6 y 8 letras o números, con guion o sin él.",
    };
  }

  const fila = {
    placa,
    descripcion: limpio(d.descripcion),
    marca: limpio(d.marca),
  };

  try {
    const supabase = await clienteServidor();
    if (d.id) {
      const { error } = await supabase.from("vehiculos").update(fila).eq("id", d.id);
      if (error) return { ok: false, error: traducir(error.message, "otro vehículo") };
      revalidar();
      return { ok: true, id: d.id };
    }

    const { data, error } = await supabase
      .from("vehiculos")
      .insert(fila)
      .select("id")
      .single();
    if (error) return { ok: false, error: traducir(error.message, "un vehículo") };
    revalidar();
    return { ok: true, id: String(data!.id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

// ---------------------------------------------------------------------------
// Conductores · transporte privado
// ---------------------------------------------------------------------------
const esquemaConductor = z.object({
  id: z.string().uuid().nullable().default(null),
  nombre: z.string().trim().min(3, "Falta el nombre del conductor.").max(160),
  numero_documento: z.string().trim().nullable().default(null),
  licencia: z.string().trim().max(30).nullable().default(null),
  telefono: z.string().trim().max(40).nullable().default(null),
});

export async function guardarConductor(crudos: unknown): Promise<ResultadoMaestro> {
  const noPuede = await permiso();
  if (noPuede) return { ok: false, error: noPuede };

  let d: z.infer<typeof esquemaConductor>;
  try {
    d = esquemaConductor.parse(crudos);
  } catch (e) {
    const primero = e instanceof z.ZodError ? e.issues[0]?.message : null;
    return { ok: false, error: primero ?? "Los datos del conductor no son válidos." };
  }

  const dni = limpio(d.numero_documento);
  if (dni !== null && !/^[0-9]{8}$/.test(dni)) {
    return { ok: false, error: "El DNI son ocho dígitos, o déjalo vacío." };
  }

  const fila = {
    nombre: d.nombre.trim(),
    numero_documento: dni,
    licencia: limpio(d.licencia)?.toUpperCase() ?? null,
    telefono: limpio(d.telefono),
  };

  try {
    const supabase = await clienteServidor();
    if (d.id) {
      const { error } = await supabase.from("conductores").update(fila).eq("id", d.id);
      if (error) return { ok: false, error: traducir(error.message, "otro conductor") };
      revalidar();
      return { ok: true, id: d.id };
    }

    const { data, error } = await supabase
      .from("conductores")
      .insert(fila)
      .select("id")
      .single();
    if (error) return { ok: false, error: traducir(error.message, "un conductor") };
    revalidar();
    return { ok: true, id: String(data!.id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

// ---------------------------------------------------------------------------
// Alta y baja
// ---------------------------------------------------------------------------
const TABLAS = {
  agencia: "agencias_transporte",
  vehiculo: "vehiculos",
  conductor: "conductores",
} as const;

export type TipoTransporte = keyof typeof TABLAS;

export async function cambiarEstado(
  tipo: TipoTransporte,
  id: string,
  activo: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const noPuede = await permiso();
  if (noPuede) return { ok: false, error: noPuede };

  const tabla = TABLAS[tipo];
  if (!tabla) return { ok: false, error: "No sé qué es eso." };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Ese identificador no vale." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from(tabla).update({ activo }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidar();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo cambiar." };
  }
}
