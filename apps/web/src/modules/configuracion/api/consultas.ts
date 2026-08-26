import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import { ordenarSeries } from "../dominio/serie";
import type {
  ConteosCatalogo,
  Empresa,
  Rol,
  SerieDocumento,
  TipoDocumento,
  Usuario,
} from "../dominio/tipos";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/** La fila única de `empresa` (id = 1, lo garantiza `empresa_unica`). */
export async function empresa(): Promise<Resultado<Empresa>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("empresa")
      .select(
        `razon_social, nombre_comercial, ruc, direccion, telefono, celular,
         email, email_ventas, web, eslogan, igv_porcentaje,
         detraccion_monto_minimo, detraccion_porcentaje, retencion_porcentaje,
         cuenta_detraccion, agente_retencion, actualizado_en`,
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) {
      return {
        ok: false,
        error: "No hay ficha de empresa. La crea el seed 007_seed_maestros.sql.",
      };
    }

    const f = data as Record<string, unknown>;
    return {
      ok: true,
      datos: {
        razon_social: String(f.razon_social),
        nombre_comercial: String(f.nombre_comercial),
        ruc: String(f.ruc),
        direccion: (f.direccion as string | null) ?? null,
        telefono: (f.telefono as string | null) ?? null,
        celular: (f.celular as string | null) ?? null,
        email: (f.email as string | null) ?? null,
        email_ventas: (f.email_ventas as string | null) ?? null,
        web: (f.web as string | null) ?? null,
        eslogan: (f.eslogan as string | null) ?? null,
        igv_porcentaje: Number(f.igv_porcentaje ?? 18),
        detraccion_monto_minimo: Number(f.detraccion_monto_minimo ?? 700),
        detraccion_porcentaje: Number(f.detraccion_porcentaje ?? 12),
        retencion_porcentaje: Number(f.retencion_porcentaje ?? 3),
        cuenta_detraccion: (f.cuenta_detraccion as string | null) ?? null,
        agente_retencion: Boolean(f.agente_retencion),
        actualizado_en: String(f.actualizado_en),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Todas las series, ordenadas como se leen. */
export async function series(): Promise<Resultado<SerieDocumento[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("series_documento")
      .select(
        `id, tipo, serie, correlativo_inicial, correlativo_actual, longitud,
         predeterminada, activo, descripcion`,
      )
      .limit(100);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: ordenarSeries(
        (data ?? []).map((s) => ({
          id: String(s.id),
          tipo: String(s.tipo) as TipoDocumento,
          serie: String(s.serie),
          correlativo_inicial: Number(s.correlativo_inicial ?? 1),
          correlativo_actual: Number(s.correlativo_actual ?? 0),
          longitud: Number(s.longitud ?? 8),
          predeterminada: Boolean(s.predeterminada),
          activo: Boolean(s.activo),
          descripcion: (s.descripcion as string | null) ?? null,
        })),
      ),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Quién entra y con qué rol. */
export async function usuarios(): Promise<Resultado<Usuario[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("perfiles")
      .select("id, nombre, email, rol, cargo, activo, ultimo_acceso")
      .order("activo", { ascending: false })
      .order("nombre")
      .limit(200);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((u) => ({
        id: String(u.id),
        nombre: String(u.nombre),
        email: (u.email as string | null) ?? null,
        rol: String(u.rol) as Rol,
        cargo: (u.cargo as string | null) ?? null,
        activo: Boolean(u.activo),
        ultimo_acceso: (u.ultimo_acceso as string | null) ?? null,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Cuántas filas tiene cada catálogo.
 *
 * Solo el número, y a propósito: editar marcas y familias todavía no tiene
 * pantalla, así que lo honesto es enseñar lo que hay y decir por dónde se
 * toca, en lugar de un formulario a medias. Se cuentan con `head: true`, que
 * no trae ninguna fila.
 */
export async function conteosCatalogo(): Promise<Resultado<ConteosCatalogo>> {
  try {
    const supabase = await clienteServidor();

    // Las cinco se escriben una a una y no con un `map` sobre una lista de
    // nombres: así `Promise.all` devuelve una tupla y cada resultado tiene su
    // tipo, en lugar de un array donde cada elemento «puede ser undefined».
    const contar = (tabla: "marcas" | "familias" | "subfamilias" | "tipos" | "unidades_medida") =>
      supabase.from(tabla).select("*", { count: "exact", head: true });

    const [marcas, familias, subfamilias, tipos, unidades] = await Promise.all([
      contar("marcas"),
      contar("familias"),
      contar("subfamilias"),
      contar("tipos"),
      contar("unidades_medida"),
    ]);

    const primerFallo = [marcas, familias, subfamilias, tipos, unidades].find((c) => c.error);
    if (primerFallo?.error) return fallo(primerFallo.error);

    return {
      ok: true,
      datos: {
        marcas: marcas.count ?? 0,
        familias: familias.count ?? 0,
        subfamilias: subfamilias.count ?? 0,
        tipos: tipos.count ?? 0,
        unidades: unidades.count ?? 0,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
