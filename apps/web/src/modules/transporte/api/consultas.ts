import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

/**
 * El maestro de transporte: con quién y con qué se despacha.
 *
 * Luis, 07/09: *«deberíamos tener nuestra data maestra de transporte, ¿no?,
 * donde tenemos público y privado, así pueden editar, crear o dar de baja»*.
 *
 * Aquí se leen las TRES listas enteras, activas y de baja. Es la diferencia
 * con lo que lee la guía —que solo ofrece lo activo—: esta es la pantalla
 * donde se reactiva una agencia que se dejó de usar, y para eso hay que poder
 * verla.
 */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export interface AgenciaMaestro {
  id: string;
  razon_social: string;
  nombre_corto: string | null;
  numero_documento: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
}

export interface VehiculoMaestro {
  id: string;
  placa: string;
  descripcion: string | null;
  marca: string | null;
  activo: boolean;
}

export interface ConductorMaestro {
  id: string;
  nombre: string;
  numero_documento: string | null;
  licencia: string | null;
  telefono: string | null;
  activo: boolean;
}

export async function agenciasDelMaestro(): Promise<Resultado<AgenciaMaestro[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("agencias_transporte")
      .select("id, razon_social, nombre_corto, numero_documento, telefono, direccion, activo")
      // Las activas primero: dar de baja no es esconder, pero tampoco es
      // dejarlas mezcladas con las que se usan todos los días.
      .order("activo", { ascending: false })
      .order("nombre_corto", { nullsFirst: false })
      .limit(200);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((a) => ({
        id: String(a.id),
        razon_social: String(a.razon_social),
        nombre_corto: (a.nombre_corto as string | null) ?? null,
        numero_documento: (a.numero_documento as string | null) ?? null,
        telefono: (a.telefono as string | null) ?? null,
        direccion: (a.direccion as string | null) ?? null,
        activo: a.activo !== false,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

export async function vehiculosDelMaestro(): Promise<Resultado<VehiculoMaestro[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("vehiculos")
      .select("id, placa, descripcion, marca, activo")
      .order("activo", { ascending: false })
      .order("placa")
      .limit(200);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((v) => ({
        id: String(v.id),
        placa: String(v.placa),
        descripcion: (v.descripcion as string | null) ?? null,
        marca: (v.marca as string | null) ?? null,
        activo: v.activo !== false,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

export async function conductoresDelMaestro(): Promise<Resultado<ConductorMaestro[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("conductores")
      .select("id, nombre, numero_documento, licencia, telefono, activo")
      .order("activo", { ascending: false })
      .order("nombre")
      .limit(200);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((c) => ({
        id: String(c.id),
        nombre: String(c.nombre),
        numero_documento: (c.numero_documento as string | null) ?? null,
        licencia: (c.licencia as string | null) ?? null,
        telefono: (c.telefono as string | null) ?? null,
        activo: c.activo !== false,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Los vehículos y conductores activos, para el atajo de la guía privada. */
export async function transportePropioActivo(): Promise<
  Resultado<{ vehiculos: VehiculoMaestro[]; conductores: ConductorMaestro[] }>
> {
  const [v, c] = await Promise.all([vehiculosDelMaestro(), conductoresDelMaestro()]);
  if (!v.ok) return v;
  if (!c.ok) return c;
  return {
    ok: true,
    datos: {
      vehiculos: v.datos.filter((x) => x.activo),
      conductores: c.datos.filter((x) => x.activo),
    },
  };
}
